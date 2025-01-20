<script>
    import { download_dev, execute_dev } from "$lib/ergo/dev/dev_contract";
    import { mint_token } from "$lib/ergo/dev/mint_token";
    import { submit_test } from "$lib/ergo/dev/submit_test";
    import Button from "$lib/components/ui/button/button.svelte";

    let message = "Developer fees not yet taken (mainnet only)"; 
    let items = [];
    let error;

    async function fetchDownloadDev() {
        try {
            items = await download_dev();
        } catch (e) {
            error = e.message;
        }
    }

    fetchDownloadDev();
</script>

<style>
    :global(body) {
        background-color: #000000;
        color: #ffffff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        height: 100vh;
        overflow-y: auto;
    }

    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        height: 100%;
        overflow-y: auto;
        scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
    }

    h1 {
        text-align: center;
        margin-bottom: 20px;
        position: sticky;
        top: 0;
        background-color: #000000;
        padding: 20px 0;
        z-index: 10;
    }

    .content-wrapper {
        height: calc(100vh - 100px);
        overflow-y: auto;
        padding-right: 10px;
    }

    ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    li {
        background: #111111;
        border: 1px solid #444444;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .box-id, .value {
        font-weight: bold;
        color: #ffffff;
    }

    .value {
        font-size: 1em;
    }

    .error-message {
        color: #ff4d4d;
        text-align: center;
    }

    .loading {
        text-align: center;
        color: #bbbbbb;
    }

    .actions-container {
        position: sticky;
        bottom: 0;
        background-color: #000000;
        padding: 20px 0;
        border-top: 1px solid #444444;
        display: block;
        flex-direction: column;
        gap: 10px;
    }
</style>

<div class="container">
    <h1>{message}</h1>

    <div class="content-wrapper">
        {#if error}
            <p class="error-message">Error loading data: {error}</p>
        {:else if items.length === 0}
            <p class="loading">Loading data...</p>
        {:else}
            <ul>
                {#each items as box}
                    <li>
                        <div><span class="box-id">Box ID:</span> {box.boxId}</div>
                        <div><span class="value">Value:</span> {box.value / Math.pow(10, 9)} ERG</div>
                        <Button on:click={() => execute_dev(box)}>Execute</Button>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>

    <div class="actions-container">
        <Button on:click={() => submit_test()}>Add to test</Button>
        <Button on:click={() => fetchDownloadDev()}>Refresh</Button>
        <Button on:click={() => mint_token(1000, "TEST", 2)}>Mint new test token</Button>
    </div>
</div>