<script lang="ts">
    import { time_to_block } from '$lib/common/countdown';
    import { explorer_uri, web_explorer_uri_tx } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Label } from "$lib/components/ui/label/index.js";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Button } from '$lib/components/ui/button';
    import { Input } from "$lib/components/ui/input";
    import * as Select from "$lib/components/ui/select";

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
        // target_date.setTime(target_date.getTime() + 5 * 60 * 1000);
        let blockLimit = await time_to_block(target_date.getTime(), platform);

        if (minValuePrecise === undefined) {minValuePrecise = 0;}
        let minValueNano = minValuePrecise * Math.pow(10, 9);

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
                Math.round(exchangeRateRaw),
                projectContent, 
                Math.round(minimumTokenSold),
                projectTitle
            );

            transactionId = result;
        } catch (error) {
            console.log(error)
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
    <div class="container mx-auto h-[70vh] sm:h-auto;">
        <h2 class="title">Raise Funds for a new Project</h2>

        <div class="form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="form-group">
                <Label for="tokenId">Token</Label>
                <Select.Root bind:value={tokenId} required>
                    <Select.Trigger class="w-full">
                        <Select.Value placeholder="Select a token" />
                    </Select.Trigger>
                    <Select.Content>
                        {#each userTokens as token}
                            <Select.Item value={token.tokenId}>{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
                <p class="text-sm mt-1">
                    Don't have a token? <a href="https://tools.mewfinance.com/mint" target="_blank" rel="noopener noreferrer" class="text-orange-400 underline">Mint one here</a>.
                </p>
            </div>

            <div class="form-group">
                <Label for="tokenAmount">Token amount</Label>
                <Input 
                    type="number" 
                    id="tokenAmount" 
                    bind:value={tokenAmountPrecise} 
                    max={maxTokenAmountRaw}
                    step={1 / Math.pow(10, tokenDecimals)}
                    min={0}
                    placeholder="Max amount token"
                    on:input={() => updateExchangeRate()}
                    class="max-w-xs"
                />
            </div>

            <div class="form-group">
                <Label for="exchangeRate">Exchange Rate (ERGs per token)</Label>
                <Input 
                    type="number" 
                    id="exchangeRate" 
                    bind:value={exchangeRatePrecise}
                    min={0}
                    step="0.000000001"
                    placeholder="Exchange rate in ERG"
                    on:input={updateMaxValue}
                    class="max-w-xs"
                />
            </div>

            <div class="form-group">  
                <Label for="minValue">Min ERGs collected</Label>
                <Input 
                    type="number" 
                    id="minValue" 
                    bind:value={minValuePrecise} 
                    max={maxValuePrecise}
                    min={0}
                    placeholder="Min ERGs collected"
                    class="max-w-xs"
                />
            </div>

            <div class="form-group">
                <Label for="maxValue">Max ERGs collected</Label>
                <Input 
                    type="number" 
                    id="maxValue" 
                    bind:value={maxValuePrecise}
                    min={minValuePrecise}
                    placeholder="Max ERGs collected"
                    on:input={updateExchangeRate}
                    class="max-w-xs"
                />
            </div>

            <div class="form-group">
                <Label for="blockLimit">Days limit</Label>
                <Input
                    id="blockLimit"
                    type="number"
                    bind:value={daysLimit}
                    min="1"
                    placeholder="Enter days limit"
                    aria-label="Enter the limit in days"
                    class="max-w-xs"
                />
            </div>

            <div class="form-group">
                <Label for="projectTitle">Project Title</Label>
                <Input type="text" id="projectTitle" bind:value={projectTitle} placeholder="Enter project title" required class="max-w-xs" />
            </div>

            <div class="form-group">
                <Label for="projectImage">Project Image URL</Label>
                <Input type="text" id="projectImage" bind:value={projectImage} placeholder="Enter image URL" required class="max-w-xs" />
            </div>

            <div class="form-group">
                <Label for="projectLink">Project Link</Label>
                <Input type="text" id="projectLink" bind:value={projectLink} placeholder="Enter project link" required class="max-w-xs" />
            </div>

            <div class="form-group form-group-full lg:col-span-3">
                <Label for="projectDescription">Project Description</Label>
                <Textarea id="projectDescription" bind:value={projectDescription} placeholder="Enter project description" required class="w-full h-28 lg:h-32" />
            </div>
        </div>
        
        {#if transactionId}
            <div class="result">
                <p>
                    <strong>Transaction ID:</strong>
                    <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" class="text-orange-400 underline">
                        {transactionId}
                    </a>
                </p>
            </div>
        {:else}
            <Button on:click={handleSubmit} 
                disabled={isSubmitting || !tokenAmountRaw || !exchangeRateRaw || !maxValuePrecise || !projectTitle || !daysLimit} 
                class="bg-orange-500 text-black border-none py-1 px-4 text-lg"
            >
                {isSubmitting ? 'Waiting for confirmation of the project creation.' : 'Submit'}
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
        flex-direction: column;
        overflow-y: auto;
        scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
    }

    .title {
        text-align: center;
        font-size: 2rem;
        margin: 15px 0 20px;
        color: orange;
    }

    .form-group {
        margin-bottom: 1.8rem;
    }

    .result {
        margin-top: 1rem;
        padding: 1rem;
    }

    .error {
        color: red;
    }
</style>