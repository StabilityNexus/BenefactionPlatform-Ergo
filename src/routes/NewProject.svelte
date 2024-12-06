<script lang="ts">
    import { time_to_block } from '$lib/common/countdown';
    import { explorer_uri, web_explorer_uri_tx } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Button } from 'spaper';

    let platform = new ErgoPlatform();

    let tokenId: string;
    let tokenDecimals: number = 0;

    let tokenAmountRaw: number;
    let tokenAmountPrecise: number;
    let maxTokenAmountRaw: number;
    
    let daysLimit: number;
    
    let exchangeRateRaw: number;
    let exchangeRatePrecise: number;
    
    let maxValuePrecise: number;
    let minValuePrecise: number;

    let projectTitle: string = "";
    let projectDescription: string = "";
    let projectImage: string = "";
    let projectLink: string = "";

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let currentHeight: number | null = null;
    let userTokens: Array<{ tokenId: string, title: string, balance: number, decimals: number }> = [];

    $: tokenDecimals = userTokens.find(t => t.tokenId === tokenId)?.decimals || 0;

    $: {
        const token = userTokens.find(t => t.tokenId === tokenId);
        maxTokenAmountRaw = token ? Number(token.balance) / Math.pow(10, token.decimals) : 0;
    }

    $: {
        tokenAmountRaw = tokenAmountPrecise * Math.pow(10, tokenDecimals);
    }

    $: {
        exchangeRateRaw = exchangeRatePrecise * Math.pow(10, 9-tokenDecimals);
    }

    function updateExchangeRate() {
        if (maxValuePrecise && tokenAmountPrecise) {
            exchangeRatePrecise = maxValuePrecise / tokenAmountPrecise
        }
    }
    
    function updateMaxValue() {
        if (tokenAmountPrecise && exchangeRatePrecise) {
            maxValuePrecise = exchangeRatePrecise * tokenAmountPrecise;
        }
    }

    async function handleSubmit() {
        isSubmitting = true;
        errorMessage = null;
        transactionId = null;

        let target_date = new Date();
        target_date.setDate(target_date.getDate() + daysLimit);
        // target_date.setTime(target_date.getTime() + 10 * 60 * 1000);
        let blockLimit = await time_to_block(target_date.getTime(), platform);

        if (minValuePrecise === undefined) {minValuePrecise = 0;}
        let minValueNano = minValuePrecise * 1000000000;

        let minimumTokenSold = minValueNano / exchangeRateRaw;

        let projectContent = JSON.stringify({
            title: projectTitle,
            description: projectDescription,
            image: projectImage,
            link: projectLink
        });

        try {
            const result = await platform.submit(
                tokenId, 
                tokenAmountRaw, 
                blockLimit, 
                exchangeRateRaw,
                projectContent, 
                minimumTokenSold
            );

            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while submitting the project";
        } finally {
            isSubmitting = false;
        }
    }

    async function getCurrentHeight() {
        try {
            currentHeight = await platform.get_current_height();
        } catch (error) {
            console.error("Error fetching current height:", error);
        }
    }
    getCurrentHeight();

    async function getTokenName(id: string) {
        const url = explorer_uri+'/api/v1/tokens/'+id;
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                let json_data = await response.json();
                if (json_data['name'] !== null){
                    return json_data['name'];
                }
            }
            return id.slice(0, 6) + id.slice(-4);
    }

    async function getTokenDecimals(id: string) {
        const url = explorer_uri+'/api/v1/tokens/'+id;
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                let json_data = await response.json();
                console.log(json_data)
                if (json_data['decimals'] !== null){
                    return json_data['decimals'];
                }
            }
            return 0;
    }

    async function getUserTokens() {
        try {
            const tokens = await platform.get_balance();
            userTokens = await Promise.all(
                Array.from(tokens.entries())
                    .filter(([tokenId, _]) => tokenId !== "ERG")
                    .map(async ([tokenId, balance]) => ({
                        tokenId: tokenId,
                        title: await getTokenName(tokenId),
                        balance: balance,
                        decimals: await getTokenDecimals(tokenId)
                    }))
            );
        } catch (error) {
            console.error("Error fetching user tokens:", error);
        }
    }
    getUserTokens();

</script>

<div>
    <div class="container">
        <h1 class="title">Raise Funds for a new Project</h1>

        <div class="form-grid">
            <div class="form-group">
                <label for="tokenId">Token</label>
                <select id="tokenId" bind:value={tokenId} required>
                    <option value="" disabled>Select a token</option>
                   <!--- <option value={null}>-- Mint one --</option> -->
                    {#each userTokens as token}
                        <option value={token.tokenId}>{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</option>
                    {/each}
                </select>
            </div>

            <div class="form-group">
                <label for="tokenAmount">Token amount</label>
                <input 
                    type="number" 
                    id="tokenAmount" 
                    bind:value={tokenAmountPrecise} 
                    max={maxTokenAmountRaw}
                    step={1 / Math.pow(10, tokenDecimals)}
                    min={0}
                    placeholder="Max amount token"
                    on:input={() => {
                        // updateMaxValue();  // Could change this instead.
                        updateExchangeRate();
                    }}
                />
            </div>

            <div class="form-group">
                <label for="exchangeRate">Exchange Rate (ERGs per token)</label>
                <input 
                    type="number" 
                    id="exchangeRate" 
                    bind:value={exchangeRatePrecise}
                    min={0}
                    step="0.000000001"
                    placeholder="Exchange rate in ERG"
                    on:input={updateMaxValue}
                />
            </div>

            <div class="form-group">
                <label for="maxValue">Max ERGs collected</label>
                <input 
                    type="number" 
                    id="maxValue" 
                    bind:value={maxValuePrecise}
                    min={minValuePrecise}
                    placeholder="Max amount token"
                    on:input={updateExchangeRate}
                />
            </div>

            <div class="form-group">  
                <label for="minValue">Min ERGs collected</label>
                <input 
                    type="number" 
                    id="minValue" 
                    bind:value={minValuePrecise} 
                    max={maxValuePrecise}
                    min={0}
                    placeholder="Max amount token"  
                />
            </div>

            <div class="form-group">
                <label for="blockLimit">Days limit</label>
                <input
                    id="blockLimit"
                    type="number"
                    bind:value={daysLimit}
                    min="1"
                    style="width: 20rem; align-self:center;"
                    placeholder="Enter days limit"
                    aria-label="Enter the limit in days"
                />
            </div>

            <div class="form-group">
                <label for="projectTitle">Project Title</label>
                <input type="text" id="projectTitle" bind:value={projectTitle} placeholder="Enter project title" required />
            </div>

            <div class="form-group">
                <label for="projectImage">Project Image URL</label>
                <input type="text" id="projectImage" bind:value={projectImage} placeholder="Enter image URL" required />
            </div>

            <div class="form-group">
                <label for="projectLink">Project Link</label>
                <input type="text" id="projectLink" bind:value={projectLink} placeholder="Enter project link" required />
            </div>

            <div class="form-group form-group-full">
                <label for="projectDescription">Project Description</label>
                <textarea id="projectDescription" bind:value={projectDescription} placeholder="Enter project description" required style="width: 100%; height: 7rem;"></textarea>
            </div>
        </div>
        
        {#if transactionId}
            <div class="result">
                <p>
                    <strong>Transaction ID:</strong>
                    <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" style="color: #ffa500;">
                        {transactionId}
                    </a>
                </p>
            </div>
        {:else}
            <Button on:click={handleSubmit} 
                disabled={isSubmitting || !tokenAmountRaw || !exchangeRateRaw || !maxValuePrecise || !projectTitle || !daysLimit} 
                style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;"
                >
                {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>  
        {/if}
        
        {#if errorMessage}
            <div class="error">
                <p>{errorMessage}</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 10px;
    }
    .title {
        font-size: 3em;
        text-align: center;
        margin-top: 0px;
        margin-bottom: 20px;
    }

    #tokenId {
        background-color: #000;
        color: orange;
        border: 1px solid #555;
    }

    #tokenId option {
        background-color: #000;
        color: orange;
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 1rem;
    }

    .form-group-full {
        grid-column: span 3;
    }

    .form-group {
        margin-bottom: 1.5rem;
    }
    label {
        font-weight: bold;
    }
    input, select, textarea {
        width: 100%;
        padding: 0.5rem;
        margin-top: 0.25rem;
        color: orange;
        background-color: #000;
        border: 1px solid #555;
    }
    input:focus, select:focus, textarea:focus {
        outline: none !important;
        border:1px solid orange;
    }
    .result {
        margin-top: 1rem;
        padding: 1rem;
    }
    .error {
        color: red;
    }
</style>