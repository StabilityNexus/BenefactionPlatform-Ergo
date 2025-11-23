<script>
    import { onMount } from "svelte";
    import { download_dev, execute_dev } from "$lib/ergo/dev/dev_contract";
    import Button from "$lib/components/ui/button/button.svelte";

    let message = "Developer fees not yet taken (mainnet only)";
    let items = [];
    let error = null;
    let loading = false;

    function shortHex(hex, len = 10) {
        if (!hex) return "";
        if (hex.length <= len) return hex;
        return hex.slice(0, len) + "…" + hex.slice(-4);
    }

    function formatErg(nanoErg) {
        if (typeof nanoErg !== "number") return nanoErg;
        return (nanoErg / 1e9).toLocaleString(undefined, {
            maximumFractionDigits: 9,
        });
    }

    function formatTokenAmount(amount) {
        if (amount === undefined || amount === null) return "-";
        try {
            return Number(amount).toLocaleString();
        } catch (e) {
            return amount;
        }
    }

    // Try to parse R4 register Coll[Byte] representation like '0e20<hex...>' and return tokenId if present
    function parseR4TokenId(r4) {
        if (!r4 || typeof r4 !== "string") return null;
        if (!r4.startsWith("0e")) return null;
        try {
            const lengthByteHex = r4.substring(2, 4);
            const length = parseInt(lengthByteHex, 16);
            const tokenHex = r4.substring(4, 4 + length * 2);
            if (tokenHex && tokenHex.length === 64) return tokenHex;
        } catch (e) {
            return null;
        }
        return null;
    }

    async function fetchDownloadDev() {
        loading = true;
        error = null;
        try {
            const raw = await download_dev();
            // Normalize items to ensure fields exist and convert asset amounts to numbers when possible
            items = raw.map((b) => ({
                ...b,
                value: Number(b.value),
                assets: (b.assets || []).map((a) => ({
                    tokenId: a.tokenId,
                    amount: Number(a.amount),
                })),
                r4TokenId: parseR4TokenId(
                    b.additionalRegisters && b.additionalRegisters.R4,
                ),
            }));
        } catch (e) {
            console.error(e);
            error = e && e.message ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        fetchDownloadDev();
    });

    // Derived totals
    $: totalErg = items.reduce((acc, b) => acc + (Number(b.value) || 0), 0);

    $: assetTotals = (() => {
        const map = new Map();
        for (const b of items) {
            for (const a of b.assets || []) {
                if (!a || !a.tokenId) continue;
                const prev = map.get(a.tokenId) || 0;
                map.set(a.tokenId, prev + (Number(a.amount) || 0));
            }
        }
        // Convert to array sorted by amount desc
        return Array.from(map.entries())
            .map(([tokenId, amount]) => ({ tokenId, amount }))
            .sort((x, y) => y.amount - x.amount);
    })();
</script>

<div class="container">
    <header>
        <h1>{message}</h1>
        <div class="meta">
            <div class="badge">Boxes: {items.length}</div>
            <div class="badge">{loading ? "Loading…" : "Ready"}</div>
        </div>

        <div class="summary">
            <div class="badge">
                <div class="small">Total pending</div>
                <div style="font-weight:700; margin-top:6px;">
                    {formatErg(totalErg)} ERG
                </div>
            </div>

            <div class="tokens-summary">
                {#if assetTotals.length === 0}
                    <div class="small" style="opacity:0.8">
                        No tokens across boxes
                    </div>
                {:else}
                    {#each assetTotals as t}
                        <div class="badge">
                            <div class="small">{shortHex(t.tokenId, 14)}</div>
                            <div style="font-weight:600; margin-top:6px;">
                                {formatTokenAmount(t.amount)}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </header>

    {#if error}
        <p class="small" style="color: #ff6b6b;">Error loading data: {error}</p>
    {/if}

    <div class="list">
        {#if loading && items.length === 0}
            <p class="small">Loading data…</p>
        {:else if items.length === 0}
            <p class="small">No boxes found.</p>
        {:else}
            {#each items as box}
                <div class="box">
                    <div class="box-left">
                        <div
                            style="display:flex; justify-content:space-between; align-items:center; gap:12px;"
                        >
                            <div>
                                <div class="box-id">
                                    <strong>Box ID:</strong>
                                    <span class="mono"
                                        >{shortHex(box.boxId, 28)}</span
                                    >
                                </div>
                                <div class="small">
                                    Tx: <span class="mono"
                                        >{shortHex(box.transactionId, 18)}</span
                                    >
                                    • Index: {box.index} • Height: {box.creationHeight}
                                </div>
                            </div>

                            <div class="meta" style="align-items:center;">
                                <div class="badge">
                                    Value: {formatErg(box.value)} ERG
                                </div>
                                <div class="badge">
                                    Assets: {box.assets.length}
                                </div>
                                {#if box.r4TokenId}
                                    <div class="badge">
                                        R4 token: {shortHex(box.r4TokenId)}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div style="margin-top:8px;">
                            <div class="small">
                                ErgoTree: <span class="mono"
                                    >{shortHex(box.ergoTree, 48)}</span
                                >
                            </div>
                        </div>

                        <div style="margin-top:10px;">
                            <strong>Box contents</strong>
                            <div style="margin-top:8px;">
                                <div class="small">ERG:</div>
                                <div
                                    style="font-weight:600; margin-bottom:8px;"
                                >
                                    {formatErg(box.value)} ERG
                                </div>

                                <div class="small">Tokens:</div>
                                {#if box.assets.length === 0}
                                    <div class="small">
                                        No tokens in this box.
                                    </div>
                                {:else}
                                    <div
                                        class="assets-list"
                                        style="margin-top:8px;"
                                    >
                                        {#each box.assets as asset}
                                            <div class="asset-item">
                                                <div>
                                                    <div class="mono">
                                                        {shortHex(
                                                            asset.tokenId,
                                                            18,
                                                        )}
                                                    </div>
                                                    <div class="small">
                                                        Token ID (full): <span
                                                            class="mono"
                                                            >{asset.tokenId}</span
                                                        >
                                                    </div>
                                                </div>
                                                <div
                                                    style="text-align:right; min-width:120px;"
                                                >
                                                    <div>
                                                        <strong
                                                            >{formatTokenAmount(
                                                                asset.amount,
                                                            )}</strong
                                                        >
                                                    </div>
                                                    <div class="small">
                                                        raw units
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <div class="actions">
                        <Button on:click={() => execute_dev(box)}
                            >Execute</Button
                        >
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <div class="controls">
        <Button on:click={() => fetchDownloadDev()}>Refresh</Button>
    </div>
</div>

<style>
    :global(body) {
        background-color: #000;
        color: #fff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
    }

    .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px;
    }

    header {
        position: sticky;
        top: 0;
        background: #000;
        z-index: 10;
        padding-bottom: 12px;
    }

    h1 {
        margin: 0 0 8px 0;
    }

    .summary {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 8px;
        flex-wrap: wrap;
    }

    .summary .badge {
        background: linear-gradient(180deg, #111, #0b0b0b);
        border: 1px solid #222;
        padding: 8px 12px;
        border-radius: 8px;
        min-width: 140px;
        text-align: center;
    }

    .tokens-summary {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
    }

    .list {
        margin-top: 16px;
    }

    .box {
        background: #0f0f0f;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 12px;
        align-items: start;
    }

    .box-left {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 0.95rem;
    }

    .badge {
        background: #151515;
        border: 1px solid #222;
        padding: 6px 10px;
        border-radius: 6px;
    }

    .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
    }

    .details {
        margin-top: 10px;
        border-top: 1px dashed #222;
        padding-top: 10px;
        font-size: 0.92rem;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .registers,
    .assets-list {
        background: #0b0b0b;
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #222;
    }

    .asset-item {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .small {
        font-size: 0.85rem;
        color: #aaa;
    }

    .controls {
        position: sticky;
        bottom: 0;
        margin-top: 16px;
        background: linear-gradient(0deg, #000, transparent);
        padding-top: 12px;
        display: flex;
        gap: 8px;
    }

    .mono {
        font-family: monospace;
    }
</style>
