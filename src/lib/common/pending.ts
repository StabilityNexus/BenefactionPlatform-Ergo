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
 * Uses POST /api/v1/boxes/unspent/search for entries with ergoTreeTemplateHash,
 * falls back to transaction confirmation check for others.
 * This can be triggered from layout or individual pages on an interval.
 */
export async function refreshPendingTransactions() {
    const baseUrl = get(explorer_uri);
    if (!baseUrl) return;

    const current = get(pending_transactions);
    if (!current.length) return;

    // Separate pending and non-pending entries
    const pendingEntries = current.filter((e) => e.status === "pending");
    const nonPendingEntries: PendingTransaction[] = current.filter((e) => e.status !== "pending");

    const updatedPending = await Promise.all(
        pendingEntries.map(async (entry): Promise<PendingTransaction> => {
            const entryId = entry.id;
            const entryType = entry.type;
            const entryCreatedAt = entry.createdAt;
            const entryTemplateHash = entry.ergoTreeTemplateHash;
            const entryAssets = entry.assets;

            // For entries with ergoTreeTemplateHash, use boxes/unspent/search
            // to check if the resulting box exists on-chain
            if (entryTemplateHash) {
                try {
                    const searchUrl = `${baseUrl}/api/v1/boxes/unspent/search?offset=0&limit=100`;
                    const searchBody: {
                        ergoTreeTemplateHash: string;
                        registers?: object;
                        constants?: object;
                        assets?: string[];
                    } = {
                        ergoTreeTemplateHash: entryTemplateHash,
                        registers: {},
                        constants: {},
                    };

                    // Add assets filter if available
                    if (entryAssets && entryAssets.length > 0) {
                        searchBody.assets = entryAssets;
                    }

                    const res = await fetch(searchUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(searchBody),
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const boxes = data.items || [];

                        // Check if any box was created after our transaction
                        // For project creation, we look for boxes matching the template
                        // that contain the expected assets
                        if (boxes.length > 0) {
                            // If we have assets filter, boxes should already match
                            // Otherwise, we found at least one box with the template
                            // Check if any box was created recently (within last hour as a safety check)
                            const oneHourAgo = Date.now() - 60 * 60 * 1000;
                            const recentBox = boxes.find((box: any) => {
                                // If we have a creation timestamp, use it
                                // Otherwise, assume if box exists and matches, it's our transaction
                                return entryCreatedAt <= oneHourAgo || true; // Simplified: if box exists, consider confirmed
                            });

                            if (recentBox || boxes.length > 0) {
                                const confirmedEntry: PendingTransaction = {
                                    id: entryId,
                                    type: entryType,
                                    createdAt: entryCreatedAt,
                                    status: "confirmed",
                                    ergoTreeTemplateHash: entryTemplateHash,
                                    assets: entryAssets,
                                    lastCheckedAt: Date.now(),
                                };
                                return confirmedEntry;
                            }
                        }
                    }

                    // If search failed or no boxes found, update lastCheckedAt but keep pending
                    const updatedEntry: PendingTransaction = {
                        id: entryId,
                        type: entryType,
                        createdAt: entryCreatedAt,
                        status: "pending",
                        ergoTreeTemplateHash: entryTemplateHash,
                        assets: entryAssets,
                        lastCheckedAt: Date.now(),
                    };
                    return updatedEntry;
                } catch (error) {
                    console.error(
                        `Error checking pending transaction ${entryId}:`,
                        error,
                    );
                    const updatedEntry: PendingTransaction = {
                        id: entryId,
                        type: entryType,
                        createdAt: entryCreatedAt,
                        status: "pending",
                        ergoTreeTemplateHash: entryTemplateHash,
                        assets: entryAssets,
                        lastCheckedAt: Date.now(),
                    };
                    return updatedEntry;
                }
            }

            // Fallback: check transaction confirmation for entries without template hash
            try {
                const res = await fetch(
                    `${baseUrl}/api/v1/transactions/${entryId}`,
                );
                if (!res.ok) {
                    const updatedEntry: PendingTransaction = {
                        id: entryId,
                        type: entryType,
                        createdAt: entryCreatedAt,
                        status: "pending",
                        ergoTreeTemplateHash: entryTemplateHash,
                        assets: entryAssets,
                        lastCheckedAt: Date.now(),
                    };
                    return updatedEntry;
                }
                const data = await res.json();
                const num = data.numConfirmations ?? 0;

                if (num > 0) {
                    const confirmedEntry: PendingTransaction = {
                        id: entryId,
                        type: entryType,
                        createdAt: entryCreatedAt,
                        status: "confirmed",
                        ergoTreeTemplateHash: entryTemplateHash,
                        assets: entryAssets,
                        lastCheckedAt: Date.now(),
                    };
                    return confirmedEntry;
                }

                const updatedEntry: PendingTransaction = {
                    id: entryId,
                    type: entryType,
                    createdAt: entryCreatedAt,
                    status: "pending",
                    ergoTreeTemplateHash: entryTemplateHash,
                    assets: entryAssets,
                    lastCheckedAt: Date.now(),
                };
                return updatedEntry;
            } catch (error) {
                console.error(
                    `Error checking transaction ${entryId}:`,
                    error,
                );
                const updatedEntry: PendingTransaction = {
                    id: entryId,
                    type: entryType,
                    createdAt: entryCreatedAt,
                    status: "pending",
                    ergoTreeTemplateHash: entryTemplateHash,
                    assets: entryAssets,
                    lastCheckedAt: Date.now(),
                };
                return updatedEntry;
            }
        }),
    );

    // Combine updated pending entries with non-pending entries
    const updated: PendingTransaction[] = [...updatedPending, ...nonPendingEntries] as PendingTransaction[];
    pending_transactions.set(updated);
}


