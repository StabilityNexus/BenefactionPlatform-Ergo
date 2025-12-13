import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type ConstantContent, type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { type contract_version, get_template_hash } from "./contract";
import { explorer_uri, projects } from "$lib/common/store";
import { get } from "svelte/store";

const expectedSigmaTypesV1 = {
    R4: 'SInt',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'SLong',
    R8: 'Coll[SByte]',
    R9: 'Coll[SByte]'
};

const expectedSigmaTypesV2 = {
    R4: '(SBoolean, SLong)',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'SLong',
    R8: 'Coll[Coll[SByte]]',
    R9: 'Coll[SByte]'
};

// Cache duration (e.g. 5 minutes)
const CACHE_DURATION_MS = 1000 * 60 * 5;

// Variable to track an ongoing request
let inFlightFetch: Promise<Map<string, Project>> | null = null;

function hasValidSigmaTypes(additionalRegisters: any, version: contract_version): boolean {
    const expectedTypes = version === "v2" ? expectedSigmaTypesV2 : expectedSigmaTypesV1;
    for (const [key, expectedType] of Object.entries(expectedTypes)) {
        if (additionalRegisters[key] && additionalRegisters[key].sigmaType !== expectedType) {
            return false;
        }
    }
    return true;
}

export async function fetch_token_details(id: string): Promise<TokenEIP4> {
    console.log("Fetching token details for ", id);
    const url = get(explorer_uri) + '/api/v1/tokens/' + id;
    const response = await fetch(url, {
        method: 'GET',
    });

    try {
        if (response.ok) {
            let json_data = await response.json();
            if (json_data['type'] == 'EIP-004') {
                return {
                    "name": json_data['name'],
                    "description": json_data['description'],
                    "decimals": json_data['decimals'],
                    "emissionAmount": json_data['emissionAmount']
                }
            }
            else if (json_data['type'] == null) {
                return {
                    "name": id.slice(0, 6),
                    "description": "",
                    "decimals": 0,
                    "emissionAmount": json_data['emissionAmount']
                }
            }
        }
    } catch { }
    return {
        'name': 'token',
        'description': "",
        'decimals': 0,
        'emissionAmount': null
    };
}

export async function wait_until_confirmation(tx_id: string): Promise<Box | null> {
    const url = get(explorer_uri) + '/api/v1/transactions/' + tx_id;

    // Wait for 90 seconds before retrying
    await new Promise(resolve => setTimeout(resolve, 90000));

    const startTime = Date.now();

    while (true) {
        try {
            // Perform GET request to fetch transaction details
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const json_data = await response.json();

                // Check if numConfirmations is greater than 0
                if (json_data.numConfirmations > 0) {
                    let e = json_data['outputs'][0];
                    return {
                        boxId: e.boxId,
                        value: e.value,
                        assets: e.assets,
                        ergoTree: e.ergoTree,
                        creationHeight: e.creationHeight,
                        additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                            acc[key] = (value as any).serializedValue;
                            return acc;
                        }, {} as {
                            [key: string]: string;
                        }),
                        index: e.index,
                        transactionId: e.transactionId
                    };
                }
            } else {
                //  console.log(`Error fetching transaction: ${response.statusText}`);
            }
        } catch (error) {
            //  console.log(`Error during fetch: ${error}`);
        }

        // Check if 15 minutes have passed
        if (Date.now() - startTime > 15 * 60 * 1000) {
            return null;
        }

        // Wait for 5 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// Internal function for fetching projects from blockchain
export async function fetchProjectsFromBlockchain() {
    console.log("Fetch projects from blockchain");
    const registers = {};
    let moreDataAvailable;

    const versions: contract_version[] = ["v2", "v1_1", "v1_0"];

    try {
        for (const version of versions) {
            moreDataAvailable = true;
            let params = {
                offset: 0, // Starts at 0 for each version
                limit: 100, // Increased limit for fewer requests
            };

            let template = get_template_hash(version);

            while (moreDataAvailable) {
                const url = get(explorer_uri) + '/api/v1/boxes/unspent/search';
                const response = await fetch(url + '?' + new URLSearchParams({
                    offset: params.offset.toString(),
                    limit: params.limit.toString(),
                }), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "ergoTreeTemplateHash": template,
                        "registers": registers,
                        "constants": {},
                        "assets": []
                    }),
                });

                if (!response.ok) {
                    console.error('Error while making the POST request');
                    moreDataAvailable = false; // Stop loop on error
                    break;
                }

                const json_data = await response.json();

                if (!json_data.items || json_data.items.length === 0) {
                    moreDataAvailable = false;
                    break;
                }

                for (const e of json_data.items) {
                    if (hasValidSigmaTypes(e.additionalRegisters, version)) {
                        // Safety: require R5 (minimum goal register) to exist and be parsable
                        if (!e.additionalRegisters || !e.additionalRegisters.R5) {
                            console.warn("Invalid campaign box (missing R5):", e.boxId);
                            // Skip this box to avoid polluting UI with broken campaigns
                            continue;
                        }
                        let constants: ConstantContent | null = null;

                        if (version === "v1_0" || version === "v1_1") {
                            constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "");
                            if (constants === null) { console.warn("constants null"); continue; }
                        }
                        else {
                            try {
                                if (!e.additionalRegisters.R8) throw new Error("R8 missing");

                                // Parse R8 using regex/split as requested, handling brackets, quotes, and spaces
                                const rawValues = e.additionalRegisters.R8.renderedValue
                                    .replace(/[\[\]"'\s]/g, "")
                                    .split(",")
                                    .filter((s: string) => s.length > 0);

                                console.log(rawValues)
                                if (rawValues.length < 3) throw new Error("Insufficient R8 constants");

                                constants = {
                                    owner: rawValues[0],
                                    dev_hash: rawValues[1],
                                    dev_fee: parseInt(rawValues[2], 16),
                                    pft_token_id: rawValues[3],
                                    base_token_id: rawValues[4] ?? "",
                                    raw: e.additionalRegisters.R8.serializedValue
                                };
                            } catch (err) {
                                console.warn("Failed to parse R8 constants", err);
                                continue;
                            }
                        }

                        let project_id = e.assets[0].tokenId;
                        let token_id = constants.pft_token_id;
                        let token_amount_sold = 0;
                        let refunded_token_amount = 0;
                        let auxiliar_exchange_counter = 0;
                        let token_amount_sold_big: bigint | null = null;
                        let refunded_token_amount_big: bigint | null = null;
                        let auxiliar_exchange_counter_big: bigint | null = null;
                        try {
                            const r6 = JSON.parse(e.additionalRegisters.R6.renderedValue);
                            token_amount_sold = Number(r6[0] ?? 0);
                            refunded_token_amount = Number(r6[1] ?? 0);
                            auxiliar_exchange_counter = Number(r6[2] ?? 0);
                            try {
                                token_amount_sold_big = BigInt(r6[0]);
                            } catch (err) { token_amount_sold_big = null; }
                            try {
                                refunded_token_amount_big = BigInt(r6[1]);
                            } catch (err) { refunded_token_amount_big = null; }
                            try {
                                auxiliar_exchange_counter_big = BigInt(r6[2]);
                            } catch (err) { auxiliar_exchange_counter_big = null; }
                        } catch (err) {
                            console.warn('Failed to parse R6 renderedValue:', err);
                        }


                        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                        let base_token_id = constants.base_token_id ?? "";

                        let current_pft_amount = (e.assets.find((asset: any) => asset.tokenId === constants.pft_token_id)?.amount) ?? 0;
                        let total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
                        let unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
                        let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
                        let minimum_token_amount: number | null = null;
                        let minimum_token_amount_big: bigint | null = null;
                        try {
                            if (e.additionalRegisters.R5 && e.additionalRegisters.R5.renderedValue != null) {
                                // Use BigInt to correctly decode large integer register values
                                const minBig = BigInt(e.additionalRegisters.R5.renderedValue);
                                minimum_token_amount_big = minBig;
                                minimum_token_amount = Number(minBig);
                            }
                        } catch (err) {
                            console.warn('Failed to parse R5 register as BigInt:', err);
                            minimum_token_amount = null;
                            minimum_token_amount_big = null;
                        }


                        let block_limit: number = 0;
                        let is_timestamp_limit = false;
                        if (version === "v2") {
                            const r4Value = JSON.parse(e.additionalRegisters.R4?.renderedValue.replace(/\[([a-f0-9]+)(,.*)/, '["$1"$2'));
                            if (!Array.isArray(r4Value) || r4Value.length < 2) throw new Error("R4 is not a valid tuple (Type, Deadline).");

                            is_timestamp_limit = r4Value[0] === true;
                            block_limit = Number(r4Value[1]);
                            console.log("Parsed R4 for v2:", r4Value, "is_timestamp_limit:", is_timestamp_limit, "block_limit:", block_limit);
                        } else {
                            block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
                        }

                        let base_token_details = undefined;
                        if (base_token_id && base_token_id !== "" && base_token_id !== undefined && base_token_id !== "00".repeat(32)) {
                            try {
                                base_token_details = await fetch_token_details(base_token_id);
                            } catch (error) {
                                console.warn(`Failed to fetch base token details for ${base_token_id}:`, error);
                            }
                        }

                        const project: Project = {
                            version: version,
                            platform: new ErgoPlatform(),
                            box: {
                                boxId: e.boxId,
                                value: e.value,
                                assets: e.assets,
                                ergoTree: e.ergoTree,
                                creationHeight: e.creationHeight,
                                additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                                    acc[key] = (value as any).serializedValue;
                                    return acc;
                                }, {} as { [key: string]: string; }),
                                index: e.index,
                                transactionId: e.transactionId
                            },
                            project_id: project_id,
                            current_idt_amount: e.assets[0].amount,
                            pft_token_id: constants.pft_token_id,
                            base_token_id: base_token_id,
                            base_token_details: base_token_details,
                            block_limit: block_limit,
                            is_timestamp_limit: is_timestamp_limit,
                            minimum_amount: minimum_token_amount,
                            maximum_amount: total_pft_amount,
                            total_pft_amount: total_pft_amount,
                            current_pft_amount: current_pft_amount,
                            unsold_pft_amount: unsold_pft_amount,
                            refund_counter: refunded_token_amount,
                            sold_counter: token_amount_sold,
                            auxiliar_exchange_counter: auxiliar_exchange_counter,
                            tokens_sold_big: token_amount_sold_big ?? undefined,
                            refund_counter_big: refunded_token_amount_big ?? undefined,
                            auxiliar_exchange_counter_big: auxiliar_exchange_counter_big ?? undefined,
                            minimum_amount_big: minimum_token_amount_big ?? undefined,
                            exchange_rate: exchange_rate,
                            content: getProjectContent(
                                token_id.slice(0, 8),
                                hexToUtf8(e.additionalRegisters.R9.renderedValue) ?? ""
                            ),
                            constants: constants,
                            value: e.value,
                            current_value: current_erg_value,
                            token_details: await fetch_token_details(token_id)
                        };

                        const current = get(projects).data;
                        current.set(project_id, project)
                        projects.set({ data: current, last_fetch: get(projects).last_fetch });
                    } else {
                        console.warn(`Box ${e.boxId} has invalid sigma types, skipping.`);
                        console.log(e.additionalRegisters);
                    }
                }
                params.offset += params.limit;
            }
        }
    } catch (error) {
        console.error('Error while making the POST request:', error);
        return new Map(); // Returns empty map in case of error
    }
}

// Fetch a single project box by its project token id (APT token id).
export async function fetchProjectById(projectId: string): Promise<Project | null> {
    console.log("Fetch project by id", projectId);
    const registers = {};

    const versions: contract_version[] = ["v2", "v1_1", "v1_0"];

    try {
        for (const version of versions) {
            let params = { offset: 0, limit: 50 };
            let template = get_template_hash(version);

            while (true) {
                const url = get(explorer_uri) + '/api/v1/boxes/unspent/search';
                const response = await fetch(url + '?' + new URLSearchParams({
                    offset: params.offset.toString(),
                    limit: params.limit.toString(),
                }), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ergoTreeTemplateHash: template,
                        registers: registers,
                        constants: {},
                        assets: [{ tokenId: projectId }]
                    }),
                });

                if (!response.ok) {
                    console.warn('Error while making the POST request for fetchProjectById');
                    break;
                }

                const json_data = await response.json();
                if (!json_data.items || json_data.items.length === 0) {
                    break;
                }

                for (const e of json_data.items) {
                    if (!hasValidSigmaTypes(e.additionalRegisters, version)) {
                        console.warn(`Box ${e.boxId} has invalid sigma types, skipping.`);
                        continue;
                    }

                    // Safety: require R5 (minimum goal register) to exist and be parsable
                    if (!e.additionalRegisters || !e.additionalRegisters.R5) {
                        console.warn("Invalid campaign box (missing R5):", e.boxId);
                        // For targeted fetch, skip this box and continue searching
                        continue;
                    }

                    let constants: ConstantContent | null = null;

                    if (version === "v1_0" || version === "v1_1") {
                        constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "");
                        if (constants === null) { console.warn("constants null"); continue; }
                    } else {
                        try {
                            if (!e.additionalRegisters.R8) throw new Error("R8 missing");

                            const rawValues = e.additionalRegisters.R8.renderedValue
                                .replace(/[\[\]"'\s]/g, "")
                                .split(",")
                                .filter((s: string) => s.length > 0);

                            if (rawValues.length < 3) throw new Error("Insufficient R8 constants");

                            constants = {
                                owner: rawValues[0],
                                dev_hash: rawValues[1],
                                dev_fee: parseInt(rawValues[2], 16),
                                pft_token_id: rawValues[3],
                                base_token_id: rawValues[4] ?? "",
                                raw: e.additionalRegisters.R8.serializedValue
                            };
                        } catch (err) {
                            console.warn("Failed to parse R8 constants", err);
                            continue;
                        }
                    }

                    let project_id = e.assets[0].tokenId;
                    let token_id = constants.pft_token_id;
                                    let token_amount_sold = 0;
                                    let refunded_token_amount = 0;
                                    let auxiliar_exchange_counter = 0;
                                    let token_amount_sold_big: bigint | null = null;
                                    let refunded_token_amount_big: bigint | null = null;
                                    let auxiliar_exchange_counter_big: bigint | null = null;
                                    try {
                                        const r6 = JSON.parse(e.additionalRegisters.R6.renderedValue);
                                        token_amount_sold = Number(r6[0] ?? 0);
                                        refunded_token_amount = Number(r6[1] ?? 0);
                                        auxiliar_exchange_counter = Number(r6[2] ?? 0);
                                        try { token_amount_sold_big = BigInt(r6[0]); } catch { token_amount_sold_big = null; }
                                        try { refunded_token_amount_big = BigInt(r6[1]); } catch { refunded_token_amount_big = null; }
                                        try { auxiliar_exchange_counter_big = BigInt(r6[2]); } catch { auxiliar_exchange_counter_big = null; }
                                    } catch (err) {
                                        console.warn('Failed to parse R6 renderedValue:', err);
                                    }

                    let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                    let base_token_id = constants.base_token_id ?? "";

                    let current_pft_amount = (e.assets.find((asset: any) => asset.tokenId === constants.pft_token_id)?.amount) ?? 0;
                    let total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
                    let unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
                    let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
                    let minimum_token_amount: number | null = null;
                    let minimum_token_amount_big: bigint | null = null;
                    try {
                        if (e.additionalRegisters.R5 && e.additionalRegisters.R5.renderedValue != null) {
                            const minBig = BigInt(e.additionalRegisters.R5.renderedValue);
                            minimum_token_amount_big = minBig;
                            minimum_token_amount = Number(minBig);
                        }
                    } catch (err) {
                        console.warn('Failed to parse R5 register as BigInt:', err);
                        minimum_token_amount = null;
                        minimum_token_amount_big = null;
                    }

                    let block_limit: number = 0;
                    let is_timestamp_limit = false;
                    if (version === "v2") {
                        const r4Value = JSON.parse(e.additionalRegisters.R4?.renderedValue.replace(/\[([a-f0-9]+)(,.*)/, '"$1"$2'));
                        if (!Array.isArray(r4Value) || r4Value.length < 2) throw new Error("R4 is not a valid tuple (Type, Deadline).");

                        is_timestamp_limit = r4Value[0] === true;
                        block_limit = Number(r4Value[1]);
                    } else {
                        block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
                    }

                    let base_token_details = undefined;
                    if (base_token_id && base_token_id !== "" && base_token_id !== undefined && base_token_id !== "00".repeat(32)) {
                        try {
                            base_token_details = await fetch_token_details(base_token_id);
                        } catch (error) {
                            console.warn(`Failed to fetch base token details for ${base_token_id}:`, error);
                        }
                    }

                    const project: Project = {
                        version: version,
                        platform: new ErgoPlatform(),
                        box: {
                            boxId: e.boxId,
                            value: e.value,
                            assets: e.assets,
                            ergoTree: e.ergoTree,
                            creationHeight: e.creationHeight,
                            additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                                acc[key] = (value as any).serializedValue;
                                return acc;
                            }, {} as { [key: string]: string; }),
                            index: e.index,
                            transactionId: e.transactionId
                        },
                        project_id: project_id,
                        current_idt_amount: e.assets[0].amount,
                        pft_token_id: constants.pft_token_id,
                        base_token_id: base_token_id,
                        base_token_details: base_token_details,
                        block_limit: block_limit,
                        is_timestamp_limit: is_timestamp_limit,
                        minimum_amount: minimum_token_amount,
                        maximum_amount: total_pft_amount,
                        total_pft_amount: total_pft_amount,
                        current_pft_amount: current_pft_amount,
                        unsold_pft_amount: unsold_pft_amount,
                        refund_counter: refunded_token_amount,
                        sold_counter: token_amount_sold,
                        auxiliar_exchange_counter: auxiliar_exchange_counter,
                        tokens_sold_big: token_amount_sold_big ?? undefined,
                        refund_counter_big: refunded_token_amount_big ?? undefined,
                        auxiliar_exchange_counter_big: auxiliar_exchange_counter_big ?? undefined,
                        minimum_amount_big: minimum_token_amount_big ?? undefined,
                        exchange_rate: exchange_rate,
                        content: getProjectContent(
                            token_id.slice(0, 8),
                            hexToUtf8(e.additionalRegisters.R9.renderedValue) ?? ""
                        ),
                        constants: constants,
                        value: e.value,
                        current_value: current_erg_value,
                        token_details: await fetch_token_details(token_id)
                    };

                    return project;
                }

                params.offset += params.limit;
                if (params.offset > 1000) break;
            }
        }
    } catch (error) {
        console.error('Error while making the POST request in fetchProjectById:', error);
        return null;
    }

    return null;
}

export async function fetchProjects(force: boolean = false): Promise<Map<string, Project>> {

    const current = get(projects);

    // 1. Return cached data if valid and not forced
    if (!force && (Date.now() - current.last_fetch < CACHE_DURATION_MS)) {
        return current.data;
    }

    // 2. If a request is in progress, return its promise
    if (inFlightFetch) {
        return inFlightFetch;
    }

    // 3. Start the fetch operation
    inFlightFetch = (async () => {
        try {
            if (force) {
                console.log("[fetchProjects] Forcing reload, clearing store...");
                projects.set({ data: new Map(), last_fetch: Date.now() });
            } else {
                projects.update(current => ({ ...current, last_fetch: Date.now() }));
            }

            await fetchProjectsFromBlockchain();

            return get(projects).data;

        } catch (error) {
            console.error("Critical error during fetchProjects:", error);
            // In case of error, return the data we had before the failure
            return get(projects).data;
        } finally {
            // 4. Release the lock for future requests
            inFlightFetch = null;
        }
    })();

    return inFlightFetch;
}