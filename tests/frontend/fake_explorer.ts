import { vi } from "vitest";
import { get_dev_contract_hash, get_dev_fee } from "$lib/ergo/dev/dev_contract";

/**
 * A tiny in-memory stand-in for the Ergo explorer, serving only the three endpoints the lineage
 * walk uses: `/api/v1/tokens/{id}`, `/api/v1/boxes/{boxId}` and `/api/v1/transactions/{txId}`.
 *
 * It records every path it is asked for, which is how the tests check that the cache actually
 * saves work rather than merely returning the right answer twice.
 */

export const EXPLORER_URI = "https://explorer.test";

export interface FakeBox {
    boxId: string;
    transactionId: string;
    ergoTree: string;
    value: number;
    creationHeight: number;
    assets: { tokenId: string; amount: number }[];
    additionalRegisters: Record<string, any>;
    spentTransactionId?: string | null;
}

export class FakeExplorer {
    /** tokenId -> id of the box the token was minted in. */
    tokens = new Map<string, string>();
    boxes = new Map<string, FakeBox>();
    txs = new Map<string, { id: string; outputs: FakeBox[] }>();
    /** Every path requested, in order. */
    calls: string[] = [];
    /** Paths that should answer with a network-level failure rather than 404. */
    unreachable = new Set<string>();
    /**
     * Boxes the unspent-by-token index does not list even though they are unspent - what a lagging
     * or partial explorer index looks like from outside.
     */
    hiddenFromUnspent = new Set<string>();
    /**
     * Order of the unspent listing. Real explorers make no promise here, so tests that depend on
     * picking the right box out of several should hold under both.
     */
    reverseUnspent = false;

    private txCounter = 0;
    private boxCounter = 0;

    /** A box holding `tokenId` at index 0 - the shape the walk accepts as the project. */
    box(tokenId: string | null, amount = 1, label?: string): FakeBox {
        const boxId = label ?? `box${++this.boxCounter}`.padStart(64, "0");
        const box: FakeBox = {
            boxId,
            transactionId: "",
            ergoTree: "0008cd0000",
            value: 1_000_000,
            creationHeight: 800_000,
            assets: tokenId === null ? [] : [{ tokenId, amount }],
            additionalRegisters: {},
            spentTransactionId: null,
        };
        this.boxes.set(boxId, box);
        return box;
    }

    /** Register `box` as the box `tokenId` was minted in. */
    mintedIn(tokenId: string, box: FakeBox) {
        this.tokens.set(tokenId, box.boxId);
    }

    /** Spend `box` in a new transaction with the given outputs, in order. */
    spend(box: FakeBox, outputs: FakeBox[]): string {
        const txId = `tx${++this.txCounter}`;
        const stored = this.boxes.get(box.boxId);
        if (!stored) throw new Error(`spend() called on an unknown box ${box.boxId}`);
        stored.spentTransactionId = txId;
        for (const out of outputs) {
            out.transactionId = txId;
            this.boxes.set(out.boxId, out);
        }
        this.txs.set(txId, { id: txId, outputs });
        return txId;
    }

    /** Install this explorer as `globalThis.fetch`. */
    install() {
        globalThis.fetch = vi.fn(async (url: any) => {
            const full = String(url);
            const path = full.startsWith(EXPLORER_URI) ? full.slice(EXPLORER_URI.length) : full;
            this.calls.push(path);

            if (this.unreachable.has(path)) throw new Error(`network error on ${path}`);

            const body = this.route(path);
            if (body === undefined) {
                return { ok: false, status: 404, json: async () => ({}) } as any;
            }
            return { ok: true, status: 200, json: async () => body } as any;
        }) as any;
    }

    /** How many times a path prefix was requested. */
    countCalls(prefix: string): number {
        return this.calls.filter((p) => p.startsWith(prefix)).length;
    }

    private route(path: string): any | undefined {
        let match = path.match(/^\/api\/v1\/tokens\/(.+)$/);
        if (match) {
            const boxId = this.tokens.get(match[1]);
            return boxId === undefined ? undefined : { id: match[1], boxId };
        }

        match = path.match(/^\/api\/v1\/boxes\/([^/]+)$/);
        if (match) return this.boxes.get(match[1]);

        match = path.match(/^\/api\/v1\/transactions\/(.+)$/);
        if (match) return this.txs.get(match[1]);

        match = path.match(/^\/api\/v1\/boxes\/unspent\/search\?(.*)$/);
        if (match) {
            const params = new URLSearchParams(match[1]);
            const offset = Number(params.get("offset") ?? 0);
            const limit = Number(params.get("limit") ?? 100);
            // Everything that looks like a contract box: the scan matches on the ergo tree
            // template, which these fixtures do not carry, so "has an R8" stands in for it.
            const all = [...this.boxes.values()].filter(
                (b) => !b.spentTransactionId && !this.hiddenFromUnspent.has(b.boxId) && b.additionalRegisters.R8
            );
            if (this.reverseUnspent) all.reverse();
            return { items: all.slice(offset, offset + limit), total: all.length };
        }

        match = path.match(/^\/api\/v1\/boxes\/unspent\/byTokenId\/(.+?)(\?.*)?$/);
        if (match) {
            const items = [...this.boxes.values()].filter(
                (b) =>
                    !b.spentTransactionId &&
                    !this.hiddenFromUnspent.has(b.boxId) &&
                    b.assets.some((a) => a.tokenId === match![1])
            );
            if (this.reverseUnspent) items.reverse();
            return { items, total: items.length };
        }

        return undefined;
    }
}

export const PFT_TOKEN_ID = "d".repeat(64);

/**
 * Give a box the registers of a v2 project, so that `parseProjectBox` accepts it.
 *
 * Without this a fake box is rejected for having no registers, and a test meant to show that a
 * box was *filtered out* would pass whether the filter ran or not.
 */
export function asV2Project(
    box: FakeBox,
    opts: { title?: string; pftTokenId?: string; pftAmount?: number; deadline?: number } = {}
): FakeBox {
    const pft = opts.pftTokenId ?? PFT_TOKEN_ID;
    const owner = "0008cd03" + "11".repeat(32);
    const content = JSON.stringify({
        title: opts.title ?? "A project",
        description: "",
        link: null,
        image: null,
    });

    box.assets = [box.assets[0], { tokenId: pft, amount: opts.pftAmount ?? 50_000 }];
    box.additionalRegisters = {
        R4: reg("(SBoolean, SLong)", `[false,${opts.deadline ?? 900_000}]`),
        R5: reg("SLong", "1000"),
        R6: reg("Coll[SLong]", "[0,0,0]"),
        R7: reg("SLong", "1000000"),
        // owner, dev contract hash, dev fee (hex), PFT id - and no base token, so ERG mode.
        R8: reg("Coll[Coll[SByte]]", `[${owner},${get_dev_contract_hash()},${get_dev_fee().toString(16)},${pft}]`),
        R9: reg("Coll[SByte]", Buffer.from(content, "utf-8").toString("hex")),
    };
    return box;
}

function reg(sigmaType: string, renderedValue: string) {
    return { sigmaType, renderedValue, serializedValue: "00" };
}
