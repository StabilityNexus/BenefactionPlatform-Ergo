import { explorer_uri } from "$lib/common/store";
import { get } from "svelte/store";

/**
 * Resolving which box really is a project.
 *
 * A project has no verifiable on-chain identity in v1 and v2: it is identified by `tokens(0)` of
 * the contract box - the APT - and that does not distinguish the real box from an imitation. The
 * ErgoTree is the same for every v2 project, the APT circulates to buyers by design, and anyone
 * holding one unit of it can build a box with the same script, the same id and registers of their
 * choosing. Nothing in the contract stops them; see #176.
 *
 * What does distinguish the real box is where it came from. Every project starts as OUTPUTS(0) of
 * the transaction that spends its mint box, and stays OUTPUTS(0) of every transaction that spends
 * it afterwards, because the contract requires the replica to sit at index 0. So walking the chain
 * of OUTPUTS(0) from the mint reaches exactly one box, and an imitation - which was created by
 * some unrelated transaction, or at an index other than 0 - is never on that path.
 *
 * The walk also gets termination right for free. When a campaign closes, the transaction that
 * spends the project box has a payment box at OUTPUTS(0), not a replica, so the chain ends there
 * and the project is reported as finished. That includes the #174 case, where a clone was slipped
 * in at index 2 of the terminating transaction: the clone is not on the path, so it is not the
 * project, which is the answer we want.
 *
 * Cost is one explorer call per action the campaign has had. That is why {@link lineageCache}
 * exists and why the walk is incremental: a resolved project only has to be walked forward from
 * where it was left, not from the mint again.
 */

/** How far the walk will go before giving up, so a malformed chain cannot spin forever. */
const MAX_CHAIN_LENGTH = 5000;

export interface ExplorerBox {
    boxId: string;
    transactionId: string;
    ergoTree: string;
    value: number;
    assets: { tokenId: string; amount: number }[];
    additionalRegisters: Record<string, any>;
    [key: string]: any;
}

export interface LineageResult {
    /** The live project box, or null when the campaign has ended. */
    box: ExplorerBox | null;
    /** Why there is no box, when there is none. */
    ended: boolean;
    /** How many transactions were walked. Useful to see the cache working. */
    steps: number;
}

interface CacheEntry {
    /** Last box known to be on the chain. */
    box: ExplorerBox;
    /** True when that box was already spent into something that is not a project box. */
    ended: boolean;
}

/**
 * Last known position per project, so the next walk continues instead of restarting.
 *
 * Only ever holds boxes that were reached from the mint, so continuing from one cannot put the
 * walk onto a chain it would not have reached anyway.
 */
const lineageCache = new Map<string, CacheEntry>();

export function clearLineageCache(projectId?: string) {
    if (projectId) lineageCache.delete(projectId);
    else lineageCache.clear();
}

async function explorerJson(path: string): Promise<any | null> {
    const response = await fetch(get(explorer_uri) + path, { method: "GET" });
    if (!response.ok) return null;
    return await response.json();
}

/** The box a token was minted into. For a project id that is the mint contract box. */
async function mintBoxOf(tokenId: string): Promise<string | null> {
    const token = await explorerJson("/api/v1/tokens/" + tokenId);
    return token?.boxId ?? null;
}

async function boxById(boxId: string): Promise<any | null> {
    return await explorerJson("/api/v1/boxes/" + boxId);
}

async function transactionById(txId: string): Promise<any | null> {
    return await explorerJson("/api/v1/transactions/" + txId);
}

/**
 * Whether `box` is the project carried forward, rather than a payment box that happens to sit at
 * OUTPUTS(0) of the spending transaction.
 *
 * The test is that it still holds the project's APT at index 0, which is what the contract's
 * `sameId` check enforces on every replication. A terminating transaction pays the owner at
 * OUTPUTS(0) instead, and that box does not carry the APT.
 */
function carriesProject(box: ExplorerBox | null | undefined, projectId: string): boolean {
    return !!box && Array.isArray(box.assets) && box.assets.length > 0 && box.assets[0].tokenId === projectId;
}

/**
 * Walk forward from `box` for as long as OUTPUTS(0) of each spending transaction is still the
 * project. Returns where it stopped.
 */
async function walkForward(projectId: string, from: ExplorerBox, alreadySteps: number): Promise<LineageResult> {
    let current = from;
    let steps = alreadySteps;

    while (steps < MAX_CHAIN_LENGTH) {
        const detail = await boxById(current.boxId);
        if (!detail) {
            // The explorer could not tell us about this box. Report what we have rather than
            // inventing a conclusion: the caller can retry, and reporting "ended" here would
            // wrongly hide a live campaign.
            return { box: current, ended: false, steps };
        }

        const spentTx = detail.spentTransactionId;
        if (!spentTx) {
            lineageCache.set(projectId, { box: current, ended: false });
            return { box: current, ended: false, steps };
        }

        const tx = await transactionById(spentTx);
        const next = tx?.outputs?.[0];
        steps += 1;

        if (!carriesProject(next, projectId)) {
            // The box was spent into something that is not the project: the campaign ended here.
            lineageCache.set(projectId, { box: current, ended: true });
            return { box: null, ended: true, steps };
        }

        current = next;
    }

    console.warn(`Lineage walk for ${projectId} hit the ${MAX_CHAIN_LENGTH} step limit`);
    return { box: current, ended: false, steps };
}

/**
 * The canonical box of a project, resolved from its mint rather than from its token id.
 *
 * Returns `box: null, ended: true` when the campaign has finished, and `box: null, ended: false`
 * when the chain could not be resolved at all (no such token, or the explorer did not answer) -
 * which the caller should treat as "unknown", not as "finished".
 */
export async function resolveCanonicalBox(projectId: string): Promise<LineageResult> {
    const cached = lineageCache.get(projectId);
    if (cached?.ended) return { box: null, ended: true, steps: 0 };
    if (cached) return await walkForward(projectId, cached.box, 0);

    const mintBoxId = await mintBoxOf(projectId);
    if (!mintBoxId) return { box: null, ended: false, steps: 0 };

    // The mint box is spent by creation Tx B, whose OUTPUTS(0) is the project box. mint_idt.es
    // requires exactly that, so a project that exists at all starts here.
    const mintBox = await boxById(mintBoxId);
    if (!mintBox?.spentTransactionId) return { box: null, ended: false, steps: 0 };

    const creationTx = await transactionById(mintBox.spentTransactionId);
    const genesis = creationTx?.outputs?.[0];
    if (!carriesProject(genesis, projectId)) return { box: null, ended: false, steps: 1 };

    return await walkForward(projectId, genesis, 1);
}

/**
 * Whether `boxId` is the canonical box of `projectId`.
 *
 * This is the question the UI actually needs answered when more than one box claims an id.
 */
export async function isCanonicalBox(projectId: string, boxId: string): Promise<boolean> {
    const { box } = await resolveCanonicalBox(projectId);
    return box?.boxId === boxId;
}
