<script>
    import { download_dev, execute_dev } from "$lib/ergo/dev/dev_contract";
    import { Button } from "spaper";

    let message = "Developer fees not yet taken"; 
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
    body {
        background-color: #000000;
        color: #ffffff;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
    }

    h1 {
        text-align: center;
        margin-bottom: 20px;
    }

    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
    }

    ul {
        list-style: none;
        padding: 0;
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

    button {
        background-color: #444444;
        color: #ffffff;
        padding: 10px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1em;
    }

    button:hover {
        background-color: #666666;
    }

    .error-message {
        color: #ff4d4d;
        text-align: center;
    }

    .loading {
        text-align: center;
        color: #bbbbbb;
    }
</style>

<div class="container">
    <h1>{message}</h1>

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
