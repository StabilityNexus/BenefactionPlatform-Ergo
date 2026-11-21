import { explorer_uri } from "$lib/common/store";
import { get } from "svelte/store";
import { compute_ergotree_template_hash, get_template_hash, type contract_version } from "./contract";

export type LineageResolution =
    | { status: "live"; boxId: string }
    | { status: "ended" }
    | { status: "unresolved" };

interface ExplorerBoxSummary {
    boxId: string;
    ergoTree: string;
    spentTransactionId?: string | null;
    assets?: Array<{ tokenId: string; amount: number | string | bigint }>;
}

const lineageTipCache = new Map<string, ExplorerBoxSummary>();

export function clearLineageCache(): void {
    lineageTipCache.clear();
}

function matchesCampaignTemplate(ergoTreeHex: string, version: contract_version): boolean {
    const actualTemplateHash = compute_ergotree_template_hash(ergoTreeHex);
    if (!actualTemplateHash) return false;
    return actualTemplateHash === get_template_hash(version);
}

async function fetchJson(url: string): Promise<any | null> {
    try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function refreshBoxState(baseUri: string, box: ExplorerBoxSummary): Promise<ExplorerBoxSummary | null> {
    if (box.spentTransactionId) return box;
    const latest = await fetchJson(`${baseUri}/api/v1/boxes/${box.boxId}`);
    if (!latest || !latest.boxId) return null;
    return latest;
}

export async function resolveCanonicalBox(
    projectId: string,
    version: contract_version,
    customExplorerUri?: string
): Promise<LineageResolution> {
    const baseUri = customExplorerUri ?? (get(explorer_uri) || "https://api.ergoplatform.com");

    const cacheKey = `${version}:${projectId}`;
    let current = lineageTipCache.get(cacheKey) ?? null;

    if (!current) {
        let mintTx: any = null;
const issuingInputBox = await fetchJson(`${baseUri}/api/v1/boxes/${projectId}`);
if (issuingInputBox && issuingInputBox.boxId) {
if (!issuingInputBox.spentTransactionId) return { status: "ended" };
mintTx = await fetchJson(`${baseUri}/api/v1/transactions/${issuingInputBox.spentTransactionId}`);
            } else {
            const tokenInfo = await fetchJson(`${baseUri}/api/v1/tokens/${projectId}`);
            if (!tokenInfo || !tokenInfo.boxId) return { status: "unresolved" };
            const tokenOutBox = await fetchJson(`${baseUri}/api/v1/boxes/${tokenInfo.boxId}`);
            if (!tokenOutBox || !tokenOutBox.transactionId) return { status: "unresolved" };
            mintTx = await fetchJson(`${baseUri}/api/v1/transactions/${tokenOutBox.transactionId}`);
        }

        if (!mintTx || !Array.isArray(mintTx.outputs) || mintTx.outputs.length === 0) {
            return { status: "unresolved" };
        }

        if (Array.isArray(mintTx.inputs) && mintTx.inputs.length > 0) {
            if (mintTx.inputs[0]?.boxId !== projectId) {
                return { status: "ended" };
            }
        }

        let totalMinted = 0n;
        for (const out of mintTx.outputs) {
            if (!Array.isArray(out?.assets)) continue;
            for (const asset of out.assets) {
                if (asset?.tokenId === projectId) {
                    totalMinted += BigInt(asset.amount);
                }
            }
        }
        if (totalMinted <= 0n) {
            return { status: "unresolved" };
        }

        const mintOut0: ExplorerBoxSummary | undefined = mintTx.outputs[0];
        const out0FirstAsset = mintOut0?.assets?.[0];
        if (!mintOut0 || !out0FirstAsset || out0FirstAsset.tokenId !== projectId) {
            return { status: "ended" };
        }
        const out0Amount = BigInt(out0FirstAsset.amount);

        if (version === "v3") {
            if (totalMinted !== 1n || out0Amount !== 1n || !matchesCampaignTemplate(mintOut0.ergoTree, "v3")) {
                return { status: "ended" };
            }
            current = mintOut0;
        } else {
            if (out0Amount !== totalMinted) {
                return { status: "ended" };
            }
            if (matchesCampaignTemplate(mintOut0.ergoTree, version)) {
                current = mintOut0;
            } else {
                const refreshedMint = await refreshBoxState(baseUri, mintOut0);
                if (!refreshedMint) return { status: "unresolved" };
                if (!refreshedMint.spentTransactionId) return { status: "ended" };

                const txB = await fetchJson(`${baseUri}/api/v1/transactions/${refreshedMint.spentTransactionId}`);
                const genesisCandidate: ExplorerBoxSummary | undefined = txB?.outputs?.[0];
                const genAsset = genesisCandidate?.assets?.[0];
                if (
                    !genesisCandidate ||
                    !matchesCampaignTemplate(genesisCandidate.ergoTree, version) ||
                    !genAsset ||
                    genAsset.tokenId !== projectId ||
                    BigInt(genAsset.amount) !== totalMinted
                ) {
                    return { status: "ended" };
                }
                current = genesisCandidate;
            }
        }
    }
    
    

    for (let hop = 0; hop < 10_000; hop++) {
        const refreshed = await refreshBoxState(baseUri, current);
        if (!refreshed) return { status: "unresolved" };
        current = refreshed;
        lineageTipCache.set(cacheKey, current);

        if (!current.spentTransactionId) {
            return { status: "live", boxId: current.boxId };
        }

        const spendTx = await fetchJson(`${baseUri}/api/v1/transactions/${current.spentTransactionId}`);
        if (!spendTx || !Array.isArray(spendTx.outputs)) return { status: "unresolved" };

        const nextOut: ExplorerBoxSummary | undefined = spendTx.outputs[0];
        const continuesAtZero =
            Boolean(nextOut) &&
            matchesCampaignTemplate(nextOut.ergoTree, version) &&
            nextOut.assets?.[0]?.tokenId === projectId &&
            (version !== "v3" || BigInt(nextOut.assets![0].amount) === 1n);

        if (!continuesAtZero) return { status: "ended" };
        current = nextOut;
    }

    return { status: "unresolved" };
}
