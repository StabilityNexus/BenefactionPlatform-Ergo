import { get, writable } from "svelte/store";
import { explorer_uri } from "$lib/common/store";
import type { contract_version } from "$lib/ergo/contract";
import { get_template_hash } from "$lib/ergo/contract";

export type PendingTxType =
    | "projectCreation"
    | "contribution"
    | "withdrawal"
    | "rebalance";

export type PendingTxStatus = "pending" | "confirmed" | "failed";

export interface PendingTransaction {
    id: string; // transaction id or client-generated id
    type: PendingTxType;
    createdAt: number;
    status: PendingTxStatus;
    // Optional metadata to help identify the resulting box
    ergoTreeTemplateHash?: string;
    assets?: string[]; // token ids expected in the resulting box
    lastCheckedAt?: number | null;
}

export const pending_transactions = writable<PendingTransaction[]>([]);

export function addPendingProjectCreation(params: {
    txId: string;
    version: contract_version;
    expectedAssets?: string[];
}) {
    const entry: PendingTransaction = {
        id: params.txId,
        type: "projectCreation",
        createdAt: Date.now(),
        status: "pending",
        ergoTreeTemplateHash: get_template_hash(params.version),
        assets: params.expectedAssets,
        lastCheckedAt: null,
    };

    pending_transactions.update((current) => {
        // Avoid duplicates by id
        if (current.some((p) => p.id === entry.id)) return current;
        return [...current, entry];
    });
}

/**
 * Lightweight polling helper for pending transactions.
 * This is intentionally generic and can be triggered from
 * layout or individual pages on an interval.
 */
export async function refreshPendingTransactions() {
    const baseUrl = get(explorer_uri);
    if (!baseUrl) return;

    const current = get(pending_transactions);
    if (!current.length) return;

    const updated = await Promise.all(
        current.map(async (entry) => {
            if (entry.status !== "pending") return entry;

            // For now, fall back to /transactions/{id} which is cheap
            // and reliable; this can be extended to boxes/unspent/search
            // using ergoTreeTemplateHash + assets when needed.
            try {
                const res = await fetch(
                    `${baseUrl}/api/v1/transactions/${entry.id}`,
                );
                if (!res.ok) {
                    return {
                        ...entry,
                        lastCheckedAt: Date.now(),
                    };
                }
                const data = await res.json();
                const num = data.numConfirmations ?? 0;

                if (num > 0) {
                    return {
                        ...entry,
                        status: "confirmed",
                        lastCheckedAt: Date.now(),
                    };
                }

                return {
                    ...entry,
                    lastCheckedAt: Date.now(),
                };
            } catch {
                return {
                    ...entry,
                    lastCheckedAt: Date.now(),
                };
            }
        }),
    );

    pending_transactions.set(updated);
}


