import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import * as FleetSerializer from "@fleet-sdk/serializer";
import { type ConstantContent, type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8, uint8ArrayToHex } from "./utils";
import { compute_ergotree_template_hash, type contract_version, get_template_hash } from "./contract";
import { resolveCanonicalBox } from "./lineage";
import { explorer_uri, projects, project_id_conflicts } from "$lib/common/store";
import { get } from "svelte/store";
import { get_dev_contract_hash, get_dev_fee } from "./dev/dev_contract";

const expectedSigmaTypesV1 = { R4: 'SInt', R5: 'SLong', R6: 'Coll[SLong]', R7: 'SLong', R8: 'Coll[SByte]', R9: 'Coll[SByte]' };
const expectedSigmaTypesV2AndV3 = { R4: '(SBoolean, SLong)', R5: 'SLong', R6: 'Coll[SLong]', R7: 'SLong', R8: 'Coll[Coll[SByte]]', R9: 'Coll[SByte]' };
const CACHE_DURATION_MS = 1000 * 60 * 5;
const ALL_CONTRACT_VERSIONS: contract_version[] = ["v3", "v2", "v1_1", "v1_0"];

let inFlightFetch: Promise<Map<string, Project>> | null = null;

function sigmaDecode<T>(hex: string): T {
    const fn = (FleetSerializer as any).parse;
    if (typeof fn === "function") return fn(hex) as T;
    return (FleetSerializer as any).SConstant.from(hex).data as T;
}
const parse = sigmaDecode;
function getExplorerBaseUri(): string { return get(explorer_uri) || "https://api.ergoplatform.com"; }

function recordConflict(projectId: string, boxIds: string[]) {
    project_id_conflicts.update((current) => new Map(current).set(projectId, boxIds));
}

function clearConflict(projectId: string) {
    project_id_conflicts.update((current) => {
        if (!current.has(projectId)) return current;
        const next = new Map(current);
        next.delete(projectId);
        return next;
    });
}

function hasValidSigmaTypes(additionalRegisters: any, version: contract_version): boolean {
    if (!additionalRegisters) return false;
    const expectedTypes = (version === "v2" || version === "v3") ? expectedSigmaTypesV2AndV3 : expectedSigmaTypesV1;
    for (const [key, expectedType] of Object.entries(expectedTypes)) {
        const reg = additionalRegisters[key];
        if (!reg) return false;
        if (typeof reg === "object" && reg.sigmaType && reg.sigmaType !== expectedType) return false;
    }
    return true;
}

function getSerializedHex(reg: any): string | null {
    if (!reg) return null;
    if (typeof reg === "string") return reg;
    if (typeof reg.serializedValue === "string") return reg.serializedValue;
    return null;
}

function hexToRawBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function readUVlq(bytes: Uint8Array, pos: number): [number, number] {
    let value = 0;
    let shift = 0;
    while (pos < bytes.length) {
        const b = bytes[pos++];
        value |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return [value >>> 0, pos];
}

function parseR8ByteArrays(r8Reg: any): string[] | null {
    const serHex = getSerializedHex(r8Reg);
    if (serHex) {
        try {
            const bytes = hexToRawBytes(serHex);
            if (bytes.length >= 2 && bytes[0] === 0x1a) {
                let [count, pos] = readUVlq(bytes, 1);
                const items: string[] = [];
                for (let i = 0; i < count; i++) {
                    let len: number;
                    [len, pos] = readUVlq(bytes, pos);
                    items.push(uint8ArrayToHex(bytes.subarray(pos, pos + len)));
                    pos += len;
                }
                return items;
            }
            const decoded = parse<any[]>(serHex);
            if (Array.isArray(decoded)) {
                return decoded.map((arr) => {
                    if (ArrayBuffer.isView(arr)) {
                        return uint8ArrayToHex(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
                    }
                    if (Array.isArray(arr)) {
                        return uint8ArrayToHex(Uint8Array.from(arr, (b: any) => Number(b) & 0xff));
                    }
                    return typeof arr === "string" ? arr : "";
                });
            }
        } catch {
            // Fall through to renderedValue parser
        }
    }
    if (r8Reg && typeof r8Reg.renderedValue === "string") {
        const trimmed = r8Reg.renderedValue.trim().replace(/^\[|\]$/g, "");
        return trimmed.split(",").map((s: string) => s.replace(/["'\s]/g, ""));
    }
    return null;
}

function parseR4Tuple(r4Reg: any): [boolean, number] | null {
    const serHex = getSerializedHex(r4Reg);
    if (serHex) {
     try {
         const decoded: any = parse(serHex);
         if (Array.isArray(decoded) && decoded.length === 2) { return [Boolean(decoded[0]), Number(decoded[1])]; }
         if (decoded && typeof decoded === "object" && "_1" in decoded && "_2" in decoded) { return [Boolean(decoded._1), Number(decoded._2)]; }
     } catch { /* Fall through */ }
    }
    if (r4Reg && typeof r4Reg.renderedValue === "string") {
        const v = JSON.parse(r4Reg.renderedValue.replace(/\[([a-f0-9]+)(,.*)/, '["$1"$2'));
        if (Array.isArray(v) && v.length >= 2) return [v[0] === true, Number(v[1])];
    }
    return null;
}

function parseSLongValue(reg: any): number {
    const serHex = getSerializedHex(reg);
    if (serHex) {
        try { return Number(sigmaDecode<bigint | number>(serHex)); } catch {}
    }
    return parseInt(reg.renderedValue);
}

function parseR6Counters(r6Reg: any): [number, number, number] {
    const serHex = getSerializedHex(r6Reg);
    if (serHex) {
        try {
            const arr = sigmaDecode<bigint[]>(serHex);
            return [Number(arr[0]), Number(arr[1]), Number(arr[2])];
        } catch {}
    }
    const p = JSON.parse(r6Reg.renderedValue);
    return [Number(p[0]), Number(p[1]), Number(p[2])];
}

function parseR9Utf8(r9Reg: any): string {
    const serHex = getSerializedHex(r9Reg);
    if (serHex) {
        try {
            const raw = hexToRawBytes(serHex);
            if (raw.length >= 2 && raw[0] === 0x0e) {
                const [len, pos] = readUVlq(raw, 1);
                return new TextDecoder("utf-8").decode(raw.subarray(pos, pos + len));
            }
            const parsedVal: any = parse(serHex);
            if (ArrayBuffer.isView(parsedVal)) {
                return new TextDecoder("utf-8").decode(
                    new Uint8Array(parsedVal.buffer, parsedVal.byteOffset, parsedVal.byteLength)
                );
            }
            if (typeof parsedVal === "string") {
                return hexToUtf8(parsedVal) ?? "";
            }
        } catch {
            // Fall through
        }
    }
    if (r9Reg && typeof r9Reg.renderedValue === "string") {
        return hexToUtf8(r9Reg.renderedValue) ?? "";
    }
    return "";
}

export async function fetch_token_details(id: string): Promise<TokenEIP4> {
    const url = getExplorerBaseUri() + '/api/v1/tokens/' + id;
    try {
        const response = await fetch(url, { method: 'GET' });
        if (response.ok) {
            const json_data = await response.json();
            if (json_data['type'] == 'EIP-004') {
                return { name: json_data['name'], description: json_data['description'], decimals: json_data['decimals'], emissionAmount: json_data['emissionAmount'] };
            } else if (json_data['type'] == null) {
                return { name: id.slice(0, 6), description: "", decimals: 0, emissionAmount: json_data['emissionAmount'] };
            }
        }
    } catch {}
    return { name: 'token', description: "", decimals: 0, emissionAmount: null };
}

export async function wait_until_confirmation(tx_id: string): Promise<Box | null> {
    const url = getExplorerBaseUri() + '/api/v1/transactions/' + tx_id;
    await new Promise(resolve => setTimeout(resolve, 90000));
    const startTime = Date.now();
    while (true) {
        try {
            const response = await fetch(url, { method: 'GET' });
            if (response.ok) {
                const json_data = await response.json();
                if (json_data.numConfirmations > 0) {
                    const e = json_data['outputs'][0];
                    return {
                        boxId: e.boxId, value: e.value, assets: e.assets, ergoTree: e.ergoTree, creationHeight: e.creationHeight,
                        additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [k, v]) => {
                            acc[k] = typeof v === "string" ? v : (v as any).serializedValue;
                            return acc;
                        }, {} as { [key: string]: string }),
                        index: e.index, transactionId: e.transactionId
                    };
                }
            }
        } catch {}
        if (Date.now() - startTime > 15 * 60 * 1000) return null;
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

async function selectCanonicalCandidate(projectId: string, candidates: Project[]): Promise<Project | null> {
    if (candidates.length === 0) return null;
    
    for (const candidate of candidates) {
        const res = await resolveCanonicalBox(projectId, candidate.version);
        if (res.status === "live") {
            const matched = candidates.find((c) => c.box.boxId === res.boxId);
            if (matched) return matched;
        }
    }
    return null;
}

export async function fetchProjectsFromBlockchain() {
    const candidatesByProject = new Map<string, Project[]>();
    const conflicts = new Map<string, string[]>();
    try {
        for (const version of ALL_CONTRACT_VERSIONS) {
            let moreDataAvailable = true;
            const params = { offset: 0, limit: 100 };
            const template = get_template_hash(version);
            while (moreDataAvailable) {
                const url = getExplorerBaseUri() + '/api/v1/boxes/unspent/search';
                const response = await fetch(url + '?' + new URLSearchParams({ offset: params.offset.toString(), limit: params.limit.toString() }), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ergoTreeTemplateHash: template, registers: {}, constants: {}, assets: [] }),
                });
                if (!response.ok) break;
                const json_data = await response.json();
                if (!json_data.items || json_data.items.length === 0) break;
                for (const e of json_data.items) {
                    const project = await parseProjectBox(e, version);
                    if (!project) continue;
                    const group = candidatesByProject.get(project.project_id) ?? [];
                    if (!group.some((p) => p.box.boxId === project.box.boxId)) group.push(project);
                    candidatesByProject.set(project.project_id, group);
                }
                params.offset += params.limit;
            }
        }
        const resolvedProjects = new Map<string, Project>();
        for (const [projectId, group] of candidatesByProject.entries()) {
            const winner = await selectCanonicalCandidate(projectId, group);
            if (winner) resolvedProjects.set(projectId, winner);
            else if (group.length > 1) conflicts.set(projectId, group.map((g) => g.box.boxId));
        }
        projects.set({ data: resolvedProjects, last_fetch: get(projects).last_fetch });
        project_id_conflicts.set(conflicts);
    } catch {
        return new Map();
    }
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
    try {
        const response = await fetch(getExplorerBaseUri() + '/api/v1/boxes/unspent/byTokenId/' + projectId, { method: 'GET' });
        if (!response.ok) return null;
        const json_data = await response.json();
        if (!json_data.items || json_data.items.length === 0) return null;

        const candidates: Project[] = [];
        for (const box of json_data.items) {
            for (const v of ALL_CONTRACT_VERSIONS) {
                const p = await parseProjectBox(box, v);
                if (p && p.project_id === projectId) {
                    candidates.push(p);
                    break;
                }
            }
        }
        if (candidates.length === 0) return null;
        const winner = await selectCanonicalCandidate(projectId, candidates);
        if (!winner) {
           if (candidates.length > 1)  recordConflict(projectId, candidates.map((p) => p.box.boxId));
            return null;
        }
        clearConflict(projectId);
        return winner;
    } catch {
        return null;
    }
}

export async function parseProjectBox(e: any, version: contract_version): Promise<Project | null> {
    if (!e || !Array.isArray(e.assets) || e.assets.length === 0) return null;
    if (typeof e.ergoTree === "string" && e.ergoTree.length > 0) {
        const actualTemplate = compute_ergotree_template_hash(e.ergoTree);
        if (actualTemplate && actualTemplate !== get_template_hash(version)) return null;
    }
    if (version === "v3") {
        try {
            if (BigInt(e.assets[0].amount) !== 1n) return null;
        } catch {
            return null;
        }
    }
    if (!hasValidSigmaTypes(e.additionalRegisters, version)) return null;

    let constants: ConstantContent | null = null;
    if (version === "v1_0" || version === "v1_1") {
        constants = getConstantContent(parseR9Utf8(e.additionalRegisters.R8));
        if (constants === null) return null;
    } else {
        try {
            const rawValues = parseR8ByteArrays(e.additionalRegisters.R8);
            if (!rawValues || rawValues.length < 4) return null;
            if (version === "v3" && (!rawValues[5] || rawValues[5].length === 0)) return null;
            const parsedFee = rawValues[2] ? parseInt(rawValues[2], 16) : 0;
            constants = {
                owner: rawValues[0],
                dev_hash: rawValues[1],
                dev_fee: Number.isNaN(parsedFee) ? 0 : parsedFee,
                pft_token_id: rawValues[3],
                base_token_id: rawValues[4] ?? "",
                apt_token_id: version === "v3" ? rawValues[5] : undefined,
                raw: getSerializedHex(e.additionalRegisters.R8) ?? undefined
            };
            if (rawValues[1] !== get_dev_contract_hash() || constants.dev_fee !== get_dev_fee()) return null;
        } catch {
            return null;
        }
    }

    try {
        const project_id = e.assets[0].tokenId;
        const apt_token_id = version === "v3" ? constants.apt_token_id! : project_id;
        const token_id = constants.pft_token_id;
        const [token_amount_sold, refunded_token_amount, auxiliar_exchange_counter] = parseR6Counters(e.additionalRegisters.R6);
        const exchange_rate = parseSLongValue(e.additionalRegisters.R7);
        const base_token_id = constants.base_token_id ?? "";
        const current_idt_amount = version === "v3"
            ? Number(e.assets.find((asset: any) => asset.tokenId === apt_token_id)?.amount ?? 0)
            : Number(e.assets[0].amount);
        const current_pft_amount = Number(e.assets.find((asset: any) => asset.tokenId === constants.pft_token_id)?.amount ?? 0);
        const total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
        const unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
        const numericValue = Number(e.value);
        const minimum_token_amount = parseSLongValue(e.additionalRegisters.R5);

        let block_limit = 0;
        let is_timestamp_limit = false;
        if (version === "v2" || version === "v3") {
            const tuple = parseR4Tuple(e.additionalRegisters.R4);
            if (!tuple) return null;
            [is_timestamp_limit, block_limit] = tuple;
        } else {
            block_limit = parseSLongValue(e.additionalRegisters.R4);
        }

        let base_token_details = undefined;
        if (base_token_id && base_token_id !== "" && base_token_id !== "00".repeat(32)) {
            try { base_token_details = await fetch_token_details(base_token_id); } catch {}
        }

        const normalizedRegisters = Object.entries(e.additionalRegisters).reduce((acc, [key, val]) => {
            const hex = getSerializedHex(val);
            if (hex) acc[key] = hex;
            return acc;
        }, {} as { [key: string]: string });

        return {
            version,
            platform: new ErgoPlatform(),
            box: {
                boxId: e.boxId, value: e.value, assets: e.assets, ergoTree: e.ergoTree,
                creationHeight: e.creationHeight, additionalRegisters: normalizedRegisters,
                index: e.index ?? 0, transactionId: e.transactionId ?? ""
            },
            project_id, apt_token_id, current_idt_amount, pft_token_id: constants.pft_token_id,
            base_token_id, base_token_details, block_limit, is_timestamp_limit,
            minimum_amount: minimum_token_amount, maximum_amount: total_pft_amount,
            total_pft_amount, current_pft_amount, unsold_pft_amount,
            refund_counter: refunded_token_amount, sold_counter: token_amount_sold,
            auxiliar_exchange_counter, exchange_rate,
            content: getProjectContent(token_id.slice(0, 8), parseR9Utf8(e.additionalRegisters.R9)),
            constants, value: numericValue, current_value: numericValue - Number(SAFE_MIN_BOX_VALUE),
            token_details: await fetch_token_details(token_id)
        };
    } catch {
        return null;
    }
}

export async function fetchProjects(force: boolean = false): Promise<Map<string, Project>> {
    const current = get(projects);
    if (!force && (Date.now() - current.last_fetch < CACHE_DURATION_MS)) return current.data;
    if (inFlightFetch) return inFlightFetch;
    inFlightFetch = (async () => {
        try {
            if (force) projects.set({ data: new Map(), last_fetch: Date.now() });
            else projects.update(c => ({ ...c, last_fetch: Date.now() }));
            await fetchProjectsFromBlockchain();
            return get(projects).data;
        } finally {
            inFlightFetch = null;
        }
    })();
    return inFlightFetch;
}
