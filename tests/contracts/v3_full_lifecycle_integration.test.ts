import { serializeBox } from "@fleet-sdk/serializer";
import { blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "$lib/ergo/utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockChain } from "@fleet-sdk/mock-chain";
import { ErgoAddress , OutputBuilder, TransactionBuilder, SAFE_MIN_BOX_VALUE} from "@fleet-sdk/core";
import { get } from "svelte/store";
import { __setMockWallet } from "wallet-svelte-component";
import { submit_project } from "$lib/ergo/actions/submit";
import { buy_refund } from "$lib/ergo/actions/buy_refund";
import { temp_exchange } from "$lib/ergo/actions/temp_exchange";
import { rebalance } from "$lib/ergo/actions/rebalance";
import { withdraw, calculateDevFee } from "$lib/ergo/actions/withdraw";
import { fetchProjectById, fetchProjectsFromBlockchain, parseProjectBox } from "$lib/ergo/fetch";
import { clearLineageCache, resolveCanonicalBox } from "$lib/ergo/lineage";
import {
    compute_ergotree_template_hash,
    get_ergotree_hex,
    get_template_hash,
    mint_contract_address,
    TERMINAL_ERGOTREE_HEX,
    type contract_version,
} from "$lib/ergo/contract";
import { is_legacy_version } from "$lib/common/project";
import { explorer_uri, projects, project_id_conflicts } from "$lib/common/store";
import { ErgoPlatform } from "$lib/ergo/platform";
function assetsEqual(a: any[] = [], b: any[] = []): boolean { return a.length === b.length && a.every((x, i) => x.tokenId === b[i].tokenId && BigInt(x.amount) === BigInt(b[i].amount)); }

class InMemoryExplorer {
    public boxesById = new Map<string, any>();
    public txsById = new Map<string, any>();
    public tokenRegistry = new Map<string, { name: string; description: string; decimals: number; emissionAmount: number }>();

    syncFromParties(eip12Tx: any, mockChain: MockChain, trackedParties: any[], preExecBoxIds: Set<string>, txIndex: number): string {
        const afterMap = new Map<string, any>();
        const newUtxos: any[] = [];
        for (const p of trackedParties) {
            for (const u of p.utxos.toArray()) {
                afterMap.set(u.boxId, u);
                if (!preExecBoxIds.has(u.boxId)) {
                    newUtxos.push(u);
                }
            }
        }

      const recordTxId = txIndex.toString(16).padStart(64, "0"); const preUsed = new Set<string>(); const matchedList = eip12Tx.outputs.map((out: any, idx: number) => { const mf = (u: any, ri: boolean) => !preUsed.has(u.boxId) && (!ri || u.index === idx) && u.ergoTree === out.ergoTree && BigInt(u.value) === BigInt(out.value) && assetsEqual(u.assets || [], out.assets || []); const m = newUtxos.find((u) => mf(u, true)) ?? newUtxos.find((u) => mf(u, false)); if (m) preUsed.add(m.boxId); return m; }); const actualTxId = matchedList.find((m: any) => m?.transactionId)?.transactionId ?? recordTxId;

        const usedBoxIds = new Set<string>();
        const outputs = eip12Tx.outputs.map((out: any, idx: number) => {
            const matched = matchedList[idx];
            const outTxId = actualTxId;
            const outIndex = matched?.index ?? idx;
            const rawRegs = matched?.additionalRegisters ?? out.additionalRegisters ?? {};
            const treeHex = matched?.ergoTree ?? out.ergoTree;
            const creationHeight = matched?.creationHeight ?? out.creationHeight ?? mockChain.height;
            const rawAssets = (matched?.assets ?? out.assets) || [];

            const boxId: string = matched
                ? matched.boxId
                : uint8ArrayToHex(
                      blake2b256(
                          serializeBox({
                              value: BigInt(out.value),
                              ergoTree: treeHex,
                              creationHeight,
                              assets: rawAssets.map((a: any) => ({ tokenId: a.tokenId, amount: BigInt(a.amount) })),
                              additionalRegisters: rawRegs,
                              transactionId: outTxId,
                              index: outIndex,
                          }).toBytes()
                      )
                  );
            
            const regs: Record<string, any> = {};
            for (const [k, hexVal] of Object.entries(rawRegs)) {
                regs[k] = {
                    serializedValue: hexVal,
                    sigmaType:
                        k === "R4" ? "(SBoolean, SLong)" :
                        k === "R6" ? "Coll[SLong]" :
                        k === "R8" ? "Coll[Coll[SByte]]" :
                        k === "R9" ? "Coll[SByte]" : "SLong",
                };
            }

            const rec = {
                boxId,
                transactionId: actualTxId,
                index: matched?.index ?? idx,
                value: Number(matched?.value ?? out.value),
                ergoTree: treeHex,
                ergoTreeTemplateHash: compute_ergotree_template_hash(treeHex) ?? "other",
                assets: ((matched?.assets ?? out.assets) || []).map((a: any) => ({
                    tokenId: a.tokenId,
                    amount: Number(a.amount),
                })),
                creationHeight: matched?.creationHeight ?? out.creationHeight ?? mockChain.height,
                additionalRegisters: regs,
                spentTransactionId: null as string | null,
            };
            this.boxesById.set(boxId, rec);
            return rec;
        });

        for (const bid of preExecBoxIds) { if (!afterMap.has(bid)) { const ex = this.boxesById.get(bid); if (ex && !ex.spentTransactionId) ex.spentTransactionId = actualTxId; } } for (const inp of eip12Tx.inputs ?? []) { const byId = this.boxesById.get(inp.boxId); if (byId) { byId.spentTransactionId = actualTxId; } else { const match = Array.from(this.boxesById.values()).find((b: any) => !b.spentTransactionId && b.ergoTree === inp.ergoTree && BigInt(b.value) === BigInt(inp.value) && assetsEqual(b.assets, inp.assets || [])); if (match) match.spentTransactionId = actualTxId; this.boxesById.set(inp.boxId, { boxId: inp.boxId, transactionId: inp.transactionId ?? actualTxId, index: inp.index ?? 0, ergoTree: inp.ergoTree, creationHeight: inp.creationHeight ?? mockChain.height, value: inp.value !== undefined ? BigInt(inp.value).toString() : "0", assets: (inp.assets || []).map((a: any) => ({ tokenId: a.tokenId, amount: BigInt(a.amount).toString() })), additionalRegisters: inp.additionalRegisters ?? {}, spentTransactionId: actualTxId }); } } this.txsById.set(actualTxId, { id: actualTxId, numConfirmations: 1, inputs: eip12Tx.inputs, outputs });
        return actualTxId;
    }

    installFetchMock() {
        const self = this;
        globalThis.fetch = (async (input: any, init?: any) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/api/v1/tokens/")) {
                const id = url.split("/api/v1/tokens/")[1].split("?")[0];
                const meta = self.tokenRegistry.get(id);
                return new Response(
                    JSON.stringify(meta ? { type: "EIP-004", ...meta } : { type: null, emissionAmount: 100 }),
                    { status: 200 }
                );
            }
            if (url.includes("/api/v1/boxes/unspent/search")) {
                const u = new URL(url, "https://api.ergoplatform.com");
                const off = Number(u.searchParams.get("offset") ?? "0");
                const lim = Number(u.searchParams.get("limit") ?? "100");
                const tpl = init?.body ? JSON.parse(init.body).ergoTreeTemplateHash : "";
                const items = Array.from(self.boxesById.values()).filter(
                    (b) => !b.spentTransactionId && b.ergoTreeTemplateHash === tpl
                );
                return new Response(JSON.stringify({ items: items.slice(off, off + lim) }), { status: 200 });
            }
            if (url.includes("/api/v1/boxes/unspent/byTokenId/")) {
                const id = url.split("/api/v1/boxes/unspent/byTokenId/")[1].split("?")[0];
                const items = Array.from(self.boxesById.values()).filter(
                    (b) => !b.spentTransactionId && b.assets.some((a: any) => a.tokenId === id)
                );
                return new Response(JSON.stringify({ items }), { status: 200 });
            }
            if (url.includes("/api/v1/boxes/byTokenId/")) {
                const [id, q] = url.split("/api/v1/boxes/byTokenId/")[1].split("?");
                const p = new URLSearchParams(q ?? "");
                const off = Number(p.get("offset") ?? "0");
                const lim = Number(p.get("limit") ?? "100");
                const items = Array.from(self.boxesById.values()).filter((b) =>
                    b.assets.some((a: any) => a.tokenId === id)
                );
                items.sort((a, b) => a.creationHeight - b.creationHeight || a.boxId.localeCompare(b.boxId));
                return new Response(JSON.stringify({ items: items.slice(off, off + lim) }), { status: 200 });
            }
            if (url.includes("/api/v1/boxes/")) {
                const id = url.split("/api/v1/boxes/")[1].split("?")[0];
                const box = self.boxesById.get(id);
                return box ? new Response(JSON.stringify(box), { status: 200 }) : new Response("404", { status: 404 });
            }
            if (url.includes("/api/v1/transactions/")) {
                const id = url.split("/api/v1/transactions/")[1].split("?")[0];
                const tx = self.txsById.get(id);
                return tx ? new Response(JSON.stringify(tx), { status: 200 }) : new Response("404", { status: 404 });
            }
            return new Response("404", { status: 404 });
        }) as any;
    }
}

function setupLifecycleEnv(version: contract_version, pftTokenId: string, emission = 100, baseTokenId = "") {
    explorer_uri.set("https://api.ergoplatform.com");
    const explorer = new InMemoryExplorer();
    explorer.installFetchMock();
    explorer.tokenRegistry.set(pftTokenId, { name: "PFT", description: "Reward", decimals: 0, emissionAmount: emission });
    if (baseTokenId) {
        explorer.tokenRegistry.set(baseTokenId, { name: "USD", description: "Base", decimals: 0, emissionAmount: 1_000_000 });
    }

    const mockChain = new MockChain({ height: 800_000 });
    const owner = mockChain.newParty("Owner");
    const buyer = mockChain.newParty("Buyer");

    owner.addUTxOs({
        value: 50_000_000_000n,
        ergoTree: owner.address.ergoTree,
        assets: [{ tokenId: pftTokenId, amount: BigInt(emission) }],
        creationHeight: 799_990,
        additionalRegisters: {},
    });
    buyer.addUTxOs({
        value: 100_000_000_000n,
        ergoTree: buyer.address.ergoTree,
        assets: baseTokenId ? [{ tokenId: baseTokenId, amount: 10_000n }] : [],
        creationHeight: 799_990,
        additionalRegisters: {},
    });

    const dummy = { owner: owner.address.toString(), dev_hash: "00".repeat(32), dev_fee: 5, pft_token_id: pftTokenId, base_token_id: baseTokenId };
    const beneParty = mockChain.addParty(get_ergotree_hex(dummy, version), "BeneContract");
    const mintParty = mockChain.addParty(ErgoAddress.fromBase58(mint_contract_address(dummy, version)).ergoTree, "MintContract");
    const terminalParty = mockChain.addParty(TERMINAL_ERGOTREE_HEX, "Terminal");
    const trackedParties = [owner, buyer, beneParty, mintParty, terminalParty];
    for (const p of trackedParties) { for (const u of p.utxos.toArray()) { explorer.boxesById.set(u.boxId, { boxId: u.boxId, transactionId: u.transactionId, index: u.index, value: Number(u.value), ergoTree: u.ergoTree, ergoTreeTemplateHash: compute_ergotree_template_hash(u.ergoTree) ?? "other", assets: (u.assets || []).map((a: any) => ({ tokenId: a.tokenId, amount: Number(a.amount) })), creationHeight: u.creationHeight, additionalRegisters: u.additionalRegisters ?? {}, spentTransactionId: null }); } }
    
    let txCount = 0;
    const state = { signer: owner };

    __setMockWallet({
        getCurrentHeight: async () => mockChain.height,
        getChangeAddress: async () => state.signer.address.toString(),
        getUtxos: async () =>
            state.signer.utxos.toArray().map((u: any) => ({
                boxId: u.boxId,
                transactionId: u.transactionId,
                index: u.index,
                ergoTree: u.ergoTree,
                creationHeight: u.creationHeight,
                value: u.value.toString(),
                assets: (u.assets || []).map((a: any) => ({ tokenId: a.tokenId, amount: a.amount.toString() })),
                additionalRegisters: u.additionalRegisters || {},
            })),
        signTransaction: async (tx) => tx,
        submitTransaction: async (tx) => {
            const txSnapshot = JSON.parse(JSON.stringify(tx)); const preExecBoxIds = new Set<string>();
            for (const p of trackedParties) {
                for (const u of p.utxos.toArray()) preExecBoxIds.add(u.boxId);
            }
            expect(mockChain.execute(tx, { signers: [state.signer] })).toBe(true);
            txCount += 1;
            return explorer.syncFromParties(txSnapshot, mockChain, trackedParties, preExecBoxIds, txCount);
        },
    });

    return { explorer, mockChain, owner, buyer, beneParty, terminalParty, state };
}

describe("Full End-to-End Project Lifecycle & Lineage Integration (Issues #176 & #177)", () => {
    const origFetch = globalThis.fetch;

    beforeEach(() => {
        (globalThis as any).alert = () => {};
        explorer_uri.set("https://api.ergoplatform.com");
        clearLineageCache();
        projects.set({ data: new Map(), last_fetch: 0 });
        project_id_conflicts.set(new Map());
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
    });

    it("executes complete ERG-base v3 lifecycle: submit(TxA->TxB) -> fetch -> rebalance(+PFT) -> buy(100% sell-out, 0 APT) -> partial withdraw -> temp_exchange -> full withdraw(NFT retired)", async () => {
        expect(new ErgoPlatform().last_version).toBe("v3");
        const env = setupLifecycleEnv("v3", "aa".repeat(32), 100);

        const gen = submit_project(
            "v3", "aa".repeat(32), 80, 800_500, false, 100_000_000,
            JSON.stringify({ title: "V3 E2E", description: "Desc", image: "", link: "" }), 50, "V3E2E"
        );
        await gen.next();
        const res = await gen.next();
        expect((res.value as string[]).length).toBe(2);

        await fetchProjectsFromBlockchain();
        const created = Array.from(get(projects).data.values())[0];
        if (!created) {
            throw new Error("NO_CREATED_PROJECT: " + JSON.stringify(Array.from(env.explorer.boxesById.values()).map((b) => ({ id: b.boxId, tplEq: b.ergoTreeTemplateHash === get_template_hash("v3"), spent: b.spentTransactionId, assets: b.assets, r8: b.additionalRegisters?.R8?.serializedValue }))));
        }
        const nftId = created.project_id;
        expect(created.version).toBe("v3");
        expect(is_legacy_version(created.version)).toBe(false);
        expect(BigInt(created.box.assets[0].amount)).toBe(1n);
        expect(created.current_idt_amount).toBe(100);
        expect(created.current_pft_amount).toBe(80);
        expect(await resolveCanonicalBox(nftId, "v3")).toEqual({ status: "live", boxId: created.box.boxId });

        let p = (await fetchProjectById(nftId))!;
        expect(await rebalance(p, 20)).toBeTruthy();

        env.state.signer = env.buyer;
        p = (await fetchProjectById(nftId))!;
        expect(await buy_refund(p, 100)).toBeTruthy();

        p = (await fetchProjectById(nftId))!;
        expect(p.current_idt_amount).toBe(0);
        expect(p.sold_counter).toBe(100);

        env.state.signer = env.owner;
        expect(await withdraw(p, 4)).toBeTruthy();

        env.state.signer = env.buyer;
        p = (await fetchProjectById(nftId))!;
        expect(await temp_exchange(p, 100)).toBeTruthy();

        env.state.signer = env.owner;
        p = (await fetchProjectById(nftId))!;
        expect(await withdraw(p, p.value / 1e9)).toBeTruthy();

        expect(await fetchProjectById(nftId)).toBeNull();
        expect(await resolveCanonicalBox(nftId, "v3")).toEqual({ status: "ended" });
        expect(env.terminalParty.utxos.toArray()[0].assets[0]).toEqual({ tokenId: nftId, amount: 1n });
    });

    it("executes post-deadline ERG refund via real submit -> fetch -> buy -> buy_refund(-amount)", async () => {
        const env = setupLifecycleEnv("v3", "bb".repeat(32), 100);
        const gen = submit_project(
            "v3", "bb".repeat(32), 100, 800_010, false, 100_000_000,
            JSON.stringify({ title: "Refund V3", description: "Desc", image: "", link: "" }), 50, "RefV3"
        );
        await gen.next();
        await gen.next();

        await fetchProjectsFromBlockchain();
        const nftId = Array.from(get(projects).data.keys())[0];

        env.state.signer = env.buyer;
        let p = (await fetchProjectById(nftId))!;
        expect(await buy_refund(p, 20)).toBeTruthy();

        env.mockChain.jumpTo(800_020);
        p = (await fetchProjectById(nftId))!;
        expect(await buy_refund(p, -20)).toBeTruthy();

        p = (await fetchProjectById(nftId))!;
        expect(p.refund_counter).toBe(20);
        expect(p.current_idt_amount).toBe(100);
    });

    it("executes multi-token (USD) v3 lifecycle: buy -> withdraw unsold -> exchange -> 19-unit ceiling withdraw -> full withdraw", async () => {
        const usdId = "dd".repeat(32);
        const env = setupLifecycleEnv("v3", "cc".repeat(32), 100, usdId);
        const gen = submit_project(
            "v3", "cc".repeat(32), 100, 800_500, false, 2,
            JSON.stringify({ title: "USD V3", description: "Desc", image: "", link: "" }), 50, "USDV3", usdId
        );
        await gen.next();
        await gen.next();

        await fetchProjectsFromBlockchain();
        const nftId = Array.from(get(projects).data.keys())[0];

        env.state.signer = env.buyer;
        let p = (await fetchProjectById(nftId))!;
        expect(await buy_refund(p, 60)).toBeTruthy();

        env.state.signer = env.owner;
        p = (await fetchProjectById(nftId))!;
        expect(await rebalance(p, -40)).toBeTruthy();

        env.state.signer = env.buyer;
        p = (await fetchProjectById(nftId))!;
        expect(await temp_exchange(p, 60)).toBeTruthy();

        env.state.signer = env.owner;
        p = (await fetchProjectById(nftId))!;
        expect(calculateDevFee(19n, 5, "v3")).toBe(1n);
        expect(await withdraw(p, 19)).toBeTruthy();

        p = (await fetchProjectById(nftId))!;
        expect(await withdraw(p, 101)).toBeTruthy();
        expect(await fetchProjectById(nftId)).toBeNull();
        expect(env.terminalParty.utxos.toArray().length).toBe(1);
    });

    it("resolves legacy v2 3-way APT impersonation via lineage (#176, #182 fix #3), rejects amount!=1 v3 NFT, & preserves v2 compatibility", async () => {
        const pftId = "ee".repeat(32);
        const env = setupLifecycleEnv("v2", pftId, 100);
        const gen = submit_project(
            "v2", pftId, 100, 800_500, false, 100_000_000,
            JSON.stringify({ title: "Legacy V2", description: "Desc", image: "", link: "" }), 50, "LegV2"
        );
        await gen.next();
        await gen.next();

        await fetchProjectsFromBlockchain();
        const v2Id = Array.from(get(projects).data.keys())[0];
        let v2Proj = (await fetchProjectById(v2Id))!;
        expect(is_legacy_version(v2Proj.version)).toBe(true);
        expect(v2Proj.current_idt_amount).toBe(101);

        env.state.signer = env.buyer;
        await buy_refund(v2Proj, 60);
        v2Proj = (await fetchProjectById(v2Id))!;
        const canonicalId = v2Proj.box.boxId;

        const baseFake = env.explorer.boxesById.get(canonicalId);
        const fake1Id = "f1".repeat(32);
        const fake2Id = "f2".repeat(32);
        env.explorer.boxesById.set(fake1Id, {
            ...baseFake, boxId: fake1Id, transactionId: "a1".repeat(32),
            assets: [{ tokenId: v2Id, amount: 1 }, { tokenId: pftId, amount: 100 }], spentTransactionId: null,
        });
        env.explorer.boxesById.set(fake2Id, {
            ...baseFake, boxId: fake2Id, transactionId: "a2".repeat(32),
            assets: [{ tokenId: v2Id, amount: 1 }, { tokenId: pftId, amount: 100 }], spentTransactionId: null,
        });

        await fetchProjectsFromBlockchain();
        expect(get(project_id_conflicts).size).toBe(0);
        expect(get(projects).data.get(v2Id)?.box.boxId).toBe(canonicalId);
        expect((await fetchProjectById(v2Id))?.box.boxId).toBe(canonicalId);

        const forgedV3 = {
            ...baseFake,
            ergoTree: get_ergotree_hex(v2Proj.constants, "v3"),
            ergoTreeTemplateHash: get_template_hash("v3"),
            assets: [{ tokenId: "ff".repeat(32), amount: 2 }, { tokenId: v2Id, amount: 100 }],
        };
        expect(await parseProjectBox(forgedV3, "v3")).toBeNull();

        env.state.signer = env.owner;
        expect(calculateDevFee(19n, 5, "v2")).toBe(0n);
        expect(await withdraw(v2Proj, 2)).toBeTruthy();
    });
    it("resolves v2 tie-break when spoofed box has equal creationHeight and smaller boxId", async () => { const pftId = "e1".repeat(32); const env = setupLifecycleEnv("v2", pftId, 100); const gen = submit_project("v2", pftId, 100, 800_500, false, 100_000_000, JSON.stringify({ title: "TieV2", description: "Desc", image: "", link: "" }), 50, "TieV2"); await gen.next(); await gen.next(); await fetchProjectsFromBlockchain(); const v2Id = Array.from(get(projects).data.keys())[0]; let v2Proj = (await fetchProjectById(v2Id))!; const canonicalId = v2Proj.box.boxId; const baseBox = env.explorer.boxesById.get(canonicalId); const smallerBoxId = "00".repeat(32); env.explorer.boxesById.set(smallerBoxId, { ...baseBox, boxId: smallerBoxId, transactionId: "01".repeat(32), creationHeight: baseBox.creationHeight, assets: [{ tokenId: v2Id, amount: 1 }, { tokenId: pftId, amount: 100 }], spentTransactionId: null }); clearLineageCache(); const res = await fetch(`${get(explorer_uri)}/api/v1/boxes/byTokenId/${v2Id}?offset=0&limit=1`); const json = await res.json(); expect(json.items[0].boxId).toBe(smallerBoxId); await fetchProjectsFromBlockchain(); expect(get(project_id_conflicts).size).toBe(0); expect(get(projects).data.get(v2Id)?.box.boxId).toBe(canonicalId); expect((await fetchProjectById(v2Id))?.box.boxId).toBe(canonicalId); });
    it("rejects fake dual-version v3 token and P2PK-derived box outside mint chain", async () => { const pftId = "e2".repeat(32); const env = setupLifecycleEnv("v3", pftId, 100); const gen = submit_project("v3", pftId, 100, 800_500, false, 100_000_000, JSON.stringify({ title: "AdvV3", description: "Desc", image: "", link: "" }), 50, "AdvV3"); await gen.next(); await gen.next(); await fetchProjectsFromBlockchain(); const nftId = Array.from(get(projects).data.keys())[0]; const v3Proj = (await fetchProjectById(nftId))!; const baseBox = env.explorer.boxesById.get(v3Proj.box.boxId); const splitId = "dd".repeat(32); const splitTxId = "d2".repeat(32); env.explorer.boxesById.set(splitId, { ...baseBox, boxId: splitId, transactionId: "d1".repeat(32), ergoTree: env.owner.address.ergoTree, assets: [], spentTransactionId: splitTxId }); const splitOut0 = { ...baseBox, boxId: "d3".repeat(32), transactionId: splitTxId, assets: [{ tokenId: splitId, amount: 1 }, ...baseBox.assets.slice(1)], spentTransactionId: null }; const splitOut1 = { ...baseBox, boxId: "d4".repeat(32), transactionId: splitTxId, assets: [{ tokenId: splitId, amount: 1 }, ...baseBox.assets.slice(1)], spentTransactionId: null }; env.explorer.boxesById.set(splitOut0.boxId, splitOut0); env.explorer.boxesById.set(splitOut1.boxId, splitOut1); env.explorer.txsById.set(splitTxId, { id: splitTxId, inputs: [{ boxId: splitId }], outputs: [splitOut0, splitOut1] }); expect((await resolveCanonicalBox(splitId, "v3")).status).toBe("ended"); expect(await fetchProjectById(splitId)).toBeNull(); const p2pkNftId = "cc".repeat(32); const mintTxId = "c1".repeat(32); const p2pkBoxId = "c2".repeat(32); const moveTxId = "c3".repeat(32); const wrappedV3Id = "c4".repeat(32); env.explorer.boxesById.set(p2pkNftId, { ...baseBox, boxId: p2pkNftId, transactionId: "c0".repeat(32), ergoTree: env.buyer.address.ergoTree, assets: [], spentTransactionId: mintTxId }); const p2pkOutBox = { ...baseBox, boxId: p2pkBoxId, transactionId: mintTxId, ergoTree: env.buyer.address.ergoTree, assets: [{ tokenId: p2pkNftId, amount: 1 }], spentTransactionId: moveTxId }; env.explorer.boxesById.set(p2pkBoxId, p2pkOutBox); env.explorer.txsById.set(mintTxId, { id: mintTxId, inputs: [{ boxId: p2pkNftId }], outputs: [p2pkOutBox] }); const wrappedV3 = { ...baseBox, boxId: wrappedV3Id, transactionId: moveTxId, assets: [{ tokenId: p2pkNftId, amount: 1 }, ...baseBox.assets.slice(1)], spentTransactionId: null }; env.explorer.boxesById.set(wrappedV3Id, wrappedV3); env.explorer.txsById.set(moveTxId, { id: moveTxId, inputs: [{ boxId: p2pkBoxId }], outputs: [wrappedV3] }); expect(await parseProjectBox(wrappedV3, "v3")).not.toBeNull(); expect((await resolveCanonicalBox(p2pkNftId, "v3")).status).toBe("ended"); expect(await fetchProjectById(p2pkNftId)).toBeNull(); await fetchProjectsFromBlockchain(); expect(get(projects).data.has(splitId)).toBe(false); expect(get(projects).data.has(p2pkNftId)).toBe(false); });
    it("spends TOKEN_B box without touching identical TOKEN_A box and records txId in txsById", async () => { const tokenA = "aa".repeat(32); const tokenB = "bb".repeat(32); const env = setupLifecycleEnv("v3", tokenB, 100); const gen = submit_project("v3", tokenB, 100, 800_500, false, 100_000_000, JSON.stringify({ title: "IsoAB", description: "Desc", image: "", link: "" }), 50, "IsoAB"); await gen.next(); await gen.next(); await fetchProjectsFromBlockchain(); const id = Array.from(get(projects).data.keys())[0]; let p = (await fetchProjectById(id))!; env.state.signer = env.buyer; await buy_refund(p, 20); p = (await fetchProjectById(id))!; const aptId = p.apt_token_id!; const buyerAptBox = env.buyer.utxos.toArray().find((u: any) => u.assets.some((a: any) => a.tokenId === aptId))!; const fakeTokenABoxId = "f00d".padEnd(64, "0"); env.buyer.addUTxOs({ value: buyerAptBox.value, ergoTree: buyerAptBox.ergoTree, assets: [{ tokenId: tokenA, amount: 20n }], creationHeight: buyerAptBox.creationHeight, additionalRegisters: {} }); env.explorer.boxesById.set(fakeTokenABoxId, { boxId: fakeTokenABoxId, value: buyerAptBox.value, ergoTree: buyerAptBox.ergoTree, assets: [{ tokenId: tokenA, amount: 20n }], creationHeight: buyerAptBox.creationHeight, additionalRegisters: {}, spentTransactionId: null }); env.explorer.boxesById.set(buyerAptBox.boxId, { boxId: buyerAptBox.boxId, value: buyerAptBox.value, ergoTree: buyerAptBox.ergoTree, assets: buyerAptBox.assets, creationHeight: buyerAptBox.creationHeight, additionalRegisters: {}, spentTransactionId: null }); env.mockChain.jumpTo(800_600); const txId = await buy_refund(p, -20); expect(txId).toBeTruthy(); expect(env.explorer.txsById.has(String(txId))).toBe(true); expect(env.explorer.boxesById.get(fakeTokenABoxId)?.spentTransactionId).toBeNull(); expect(env.explorer.boxesById.get(buyerAptBox.boxId)?.spentTransactionId).toBe(txId); }); });
