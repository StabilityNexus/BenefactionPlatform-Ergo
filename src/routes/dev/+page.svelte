<script>
    import { onMount } from 'svelte';
    import { download_dev, execute_dev } from "$lib/ergo/dev/dev_contract";
    import { mint_token } from "$lib/ergo/dev/mint_token";
    import { submit_test } from "$lib/ergo/dev/submit_test";
    import Button from "$lib/components/ui/button/button.svelte";

    let message = "Developer fees not yet taken (mainnet only)";
    let items = [];
    let error = null;
    let loading = false;

    // keep track of which boxes are expanded
    let openBoxes = new Set();

    function toggleDetails(boxId) {
        if (openBoxes.has(boxId)) {
            openBoxes.delete(boxId);
        } else {
            openBoxes.add(boxId);
        }
        // trigger Svelte reactivity by creating a new Set reference
        openBoxes = new Set(openBoxes);
    }

    function shortHex(hex, len = 10) {
        if (!hex) return '';
        if (hex.length <= len) return hex;
        return hex.slice(0, len) + '…' + hex.slice(-4);
    }

    function formatErg(nanoErg) {
        if (typeof nanoErg !== 'number') return nanoErg;
        return (nanoErg / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 });
    }

    function formatTokenAmount(amount) {
        // tokens usually are integers; we show a human-friendly grouping
        if (amount === undefined || amount === null) return '-';
        try {
            return Number(amount).toLocaleString();
        } catch (e) {
            return amount;
        }
    }

    // Try to parse R4 register Coll[Byte] representation like '0e20<hex...>' and return tokenId if present
    function parseR4TokenId(r4) {
        if (!r4 || typeof r4 !== 'string') return null;
        if (!r4.startsWith('0e')) return null;
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
            items = raw.map(b => ({
                ...b,
                value: Number(b.value),
                assets: (b.assets || []).map(a => ({ tokenId: a.tokenId, amount: Number(a.amount) })),
                r4TokenId: parseR4TokenId(b.additionalRegisters && b.additionalRegisters.R4)
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
</script>

<style>
    :global(body) {
        background-color: #000;
        color: #fff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
    }

    .container {
        max-width: 1000px;
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

    h1 { margin: 0 0 8px 0; }

    .list { margin-top: 12px; }

    .box {
        background: #0f0f0f;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: start;
    }

    .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 0.95rem;
    }

    .badge { background: #151515; border: 1px solid #222; padding: 4px 8px; border-radius: 6px; }

    .actions { display:flex; gap:8px; align-items:center; }

    .details {
        margin-top: 10px;
        border-top: 1px dashed #222;
        padding-top: 10px;
        font-size: 0.92rem;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .registers, .assets-list { background: #0b0b0b; padding: 8px; border-radius: 6px; border: 1px solid #222; }

    .asset-item { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03); }

    .small { font-size: 0.85rem; color: #aaa; }

    .controls { position: sticky; bottom: 0; margin-top: 16px; background: linear-gradient(0deg,#000,transparent); padding-top: 12px; display:flex; gap:8px; }

    .mono { font-family: monospace; }

</style>

<div class="container">
    <header>
        <h1>{message}</h1>
        <div class="meta">
            <div class="badge">Boxes: {items.length}</div>
            <div class="badge">{loading ? 'Loading…' : 'Ready'}</div>
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
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                            <div>
                                <div class="box-id"><strong>Box ID:</strong> <span class="mono">{shortHex(box.boxId, 24)}</span></div>
                                <div class="small">Tx: <span class="mono">{shortHex(box.transactionId, 18)}</span> • Index: {box.index} • Height: {box.creationHeight}</div>
                            </div>
                            <div class="meta" style="align-items:center;">
                                <div class="badge">Value: {formatErg(box.value)} ERG</div>
                                <div class="badge">Assets: {box.assets.length}</div>
                                {#if box.r4TokenId}
                                    <div class="badge">R4 token: {shortHex(box.r4TokenId)}</div>
                                {/if}
                            </div>
                        </div>

                        <div style="margin-top:8px;">
                            <div class="small">ErgoTree: <span class="mono">{shortHex(box.ergoTree, 48)}</span></div>
                        </div>

                        {#if openBoxes.has(box.boxId)}
                            <div class="details">
                                <div class="assets-list">
                                    <strong>Assets</strong>
                                    {#if box.assets.length === 0}
                                        <div class="small">No tokens in this box.</div>
                                    {:else}
                                        {#each box.assets as asset}
                                            <div class="asset-item">
                                                <div>
                                                    <div class="mono">{shortHex(asset.tokenId, 18)}</div>
                                                    <div class="small">Token ID (full): <span class="mono">{asset.tokenId}</span></div>
                                                </div>
                                                <div style="text-align:right; min-width:120px;">
                                                    <div><strong>{formatTokenAmount(asset.amount)}</strong></div>
                                                    <div class="small">raw units</div>
                                                </div>
                                            </div>
                                        {/each}
                                    {/if}
                                </div>

                                <div class="registers">
                                    <strong>Registers</strong>
                                    <div style="margin-top:8px;">
                                        {#each Object.entries(box.additionalRegisters || {}) as [k,v]}
                                            <div style="margin-bottom:6px;">
                                                <div class="small">{k}:</div>
                                                <div class="mono">{v}</div>
                                            </div>
                                        {/each}

                                        <div style="margin-top:8px;" class="small">Full JSON:</div>
                                        <pre style="max-height:120px; overflow:auto; background:transparent; border-radius:6px;">{JSON.stringify(box, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                        {/if}

                    </div>

                    <div class="actions">
                        <Button on:click={() => execute_dev(box)}>Execute</Button>
                        <Button on:click={() => { submit_test(box); }}>Add to test</Button>
                        <Button on:click={() => toggleDetails(box.boxId)}>{openBoxes.has(box.boxId) ? 'Hide' : 'Details'}</Button>
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <div class="controls">
        <Button on:click={() => fetchDownloadDev()}>Refresh</Button>
        <Button on:click={() => mint_token(1000, 'TEST', 2)}>Mint new test token</Button>
    </div>
</div>
