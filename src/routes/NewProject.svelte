<script lang="ts">
    import { block_to_date, time_to_block } from '$lib/common/countdown';
    import { explorer_uri, web_explorer_uri_tx } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Label } from "$lib/components/ui/label/index.js";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Button } from '$lib/components/ui/button';
    import { Input } from "$lib/components/ui/input";
    import * as Select from "$lib/components/ui/select";
    import { get } from 'svelte/store';
    import { user_tokens } from '$lib/common/store';

    let platform = new ErgoPlatform();

    let tokenOption: object|null = null;
    let tokenId: string|null = null;
    let tokenDecimals: number = 0;

    // Base token selection for multi-token support
    let baseTokenOption: object|null = null;
    let baseTokenId: string = "";  // Empty string means ERG
    let baseTokenDecimals: number = 9;  // ERG has 9 decimals
    let baseTokenName: string = "ERG";

    let tokenAmountRaw: number;
    let tokenAmountPrecise: number;
    let maxTokenAmountRaw: number;
    
    let daysLimit: number;
    let daysLimitBlock: number;
    let daysLimitText: string;
    
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

    $: {
        if (tokenOption) {
            tokenId = tokenOption.value;
        } else {
            tokenId = null;
        }
    }

    $: {
        if (baseTokenOption) {
            baseTokenId = baseTokenOption.value;
            const baseToken = userTokens.find(t => t.tokenId === baseTokenId);
            baseTokenDecimals = baseToken?.decimals || 0;
            baseTokenName = baseToken?.title || "Unknown Token";
        } else {
            baseTokenId = "";  // ERG
            baseTokenDecimals = 9;
            baseTokenName = "ERG";
        }
    }

    $: tokenDecimals = userTokens.find(t => t.tokenId === tokenId)?.decimals || 0;

    $: {
        const token = userTokens.find(t => t.tokenId === tokenId);
        maxTokenAmountRaw = token ? Number(token.balance) / Math.pow(10, token.decimals) : 0;
    }

    $: {
        tokenAmountRaw = tokenAmountPrecise * Math.pow(10, tokenDecimals);
    }

    $: {
        exchangeRateRaw = exchangeRatePrecise * Math.pow(10, baseTokenDecimals-tokenDecimals);
    }

    $: {
        calculateBlockLimit(daysLimit);
    }

    async function calculateBlockLimit(days: number) {
        let target_date = new Date();
        target_date.setTime(target_date.getTime() + days * 24 * 60 * 60 * 1000);
        daysLimitBlock = await time_to_block(target_date.getTime(), platform);
        daysLimitText = await block_to_date(daysLimitBlock, platform);
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
        if (tokenId === null) return

        isSubmitting = true;
        errorMessage = null;
        transactionId = null;

        if (minValuePrecise === undefined) {minValuePrecise = 0;}
        let minValueNano = minValuePrecise * Math.pow(10, baseTokenDecimals);

        let minimumTokenSold = minValueNano / exchangeRateRaw;

        let projectContent = JSON.stringify({
            title: projectTitle,
            description: projectDescription,
            image: projectImage,
            link: projectLink
        });

        try {
            console.log("Base token ID:", baseTokenId);
            const result = await platform.submit(
                platform.last_version,
                tokenId,
                tokenAmountRaw,
                daysLimitBlock,
                Math.round(exchangeRateRaw),
                projectContent,
                Math.round(minimumTokenSold),
                projectTitle,
                baseTokenId  // Pass the base token ID for multi-token support
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
            let tokens: Map<string, number> = get(user_tokens);
            if (tokens.size === 0) {
                tokens = await platform.get_balance();
                user_tokens.set(tokens);
            }
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
    <div class="container mx-auto py-4">
        <h2 class="project-title">Raise Funds for a New Project</h2>

       <!-- <div class="form-container bg-background/80 backdrop-blur-lg border border-orange-500/20 rounded-xl p-6 mb-6">  -->
       <div class="form-container bg-background/80 backdrop-blur-lg rounded-xl p-6 mb-6">
            <div class="form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="form-group">
                    <Label for="baseTokenId" class="text-sm font-medium mb-2 block">Base Token (for contributions)</Label>
                    <Select.Root bind:selected={baseTokenOption}>
                        <Select.Trigger class="w-full border-orange-500/20 focus:border-orange-500/40">
                            <Select.Value placeholder="ERG (default)" />
                        </Select.Trigger>
                        <Select.Content>
                            <Select.Item value="">ERG (Ergo native token)</Select.Item>
                            {#each userTokens as token}
                                <Select.Item value={token.tokenId}>{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-sm mt-2 text-muted-foreground">
                        Contributors will use {baseTokenName} to fund this project.
                    </p>
                </div>

                <div class="form-group">
                    <Label for="tokenId" class="text-sm font-medium mb-2 block">Reward Token</Label>
                    <Select.Root bind:selected={tokenOption} required>
                        <Select.Trigger class="w-full border-orange-500/20 focus:border-orange-500/40">
                            <Select.Value placeholder="Select a reward token" />
                        </Select.Trigger>
                        <Select.Content>
                            {#each userTokens as token}
                                <Select.Item value={token.tokenId}>{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-sm mt-2 text-muted-foreground">
                        Don't have a token? <a href="https://tools.mewfinance.com/mint" target="_blank" rel="noopener noreferrer" class="text-orange-400 underline hover:text-orange-300 transition-colors">Mint one here</a>.
                    </p>
                </div>

                <div class="form-group">
                    <Label for="tokenAmount" class="text-sm font-medium mb-2 block">Token amount</Label>
                    <Input 
                        type="number" 
                        id="tokenAmount" 
                        bind:value={tokenAmountPrecise} 
                        max={maxTokenAmountRaw}
                        step={1 / Math.pow(10, tokenDecimals)}
                        min={0}
                        placeholder="Max amount token"
                        on:input={() => updateExchangeRate()}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="exchangeRate" class="text-sm font-medium mb-2 block">Exchange Rate ({baseTokenName} per token)</Label>
                    <Input
                        type="number"
                        id="exchangeRate"
                        bind:value={exchangeRatePrecise}
                        min={0}
                        step="0.000000001"
                        placeholder="Exchange rate in {baseTokenName}"
                        on:input={updateMaxValue}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="minValue" class="text-sm font-medium mb-2 block">Min {baseTokenName} collected</Label>
                    <Input
                        type="number"
                        id="minValue"
                        bind:value={minValuePrecise}
                        max={maxValuePrecise}
                        min={0}
                        placeholder="Min {baseTokenName} collected"
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="maxValue" class="text-sm font-medium mb-2 block">Max {baseTokenName} collected</Label>
                    <Input
                        type="number"
                        id="maxValue"
                        bind:value={maxValuePrecise}
                        min={minValuePrecise}
                        placeholder="Max {baseTokenName} collected"
                        on:input={updateExchangeRate}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="blockLimit" class="text-sm font-medium mb-2 block">Days limit</Label>
                    <Input
                        id="blockLimit"
                        type="number"
                        bind:value={daysLimit}
                        min="1"
                        placeholder="Enter days limit"
                        aria-label="Enter the limit in days"
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                        autocomplete="off"
                    />
                    <!-- svelte-ignore a11y-missing-attribute -->
                    <div hidden> <!-- Only for development purpose -->
                        {#if (daysLimitBlock)}
                            <a>On block: {daysLimitBlock}</a>
                            <br>
                            <a>Date limit: {daysLimitText}</a>
                        {/if}
                    </div>
                </div>

                <div class="form-group">
                    <Label for="projectTitle" class="text-sm font-medium mb-2 block">Project Title</Label>
                    <Input 
                        type="text" 
                        id="projectTitle" 
                        bind:value={projectTitle} 
                        placeholder="Enter project title" 
                        required 
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1" 
                    />
                </div>

                <div class="form-group">
                    <Label for="projectImage" class="text-sm font-medium mb-2 block">Project Image URL</Label>
                    <Input 
                        type="text" 
                        id="projectImage" 
                        bind:value={projectImage} 
                        placeholder="Enter image URL" 
                        required 
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1" 
                    />
                </div>

                <div class="form-group">
                    <Label for="projectLink" class="text-sm font-medium mb-2 block">Project Link</Label>
                    <Input 
                        type="text" 
                        id="projectLink" 
                        bind:value={projectLink} 
                        placeholder="Enter project link" 
                        required 
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1" 
                    />
                </div>

                <div class="form-group form-group-full lg:col-span-3">
                    <Label for="projectDescription" class="text-sm font-medium mb-2 block">Project Description</Label>
                    <Textarea 
                        id="projectDescription" 
                        bind:value={projectDescription} 
                        placeholder="Enter project description" 
                        required 
                        class="w-full h-28 lg:h-32 border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1" 
                    />
                </div>
            </div>

            <div class="form-actions mt-6 flex justify-center">
                {#if transactionId}
                    <div class="result bg-background/80 backdrop-blur-lg border border-orange-500/20 rounded-lg p-4 w-full max-w-xl">
                        <p class="text-center">
                            <strong>Transaction ID:</strong>
                            <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline transition-colors">
                                {transactionId}
                            </a>
                        </p>
                    </div>
                {:else}
                    <Button on:click={handleSubmit} 
                        disabled={isSubmitting || !tokenAmountRaw || !exchangeRateRaw || !maxValuePrecise || !projectTitle || !daysLimitBlock} 
                        class="bg-orange-500 hover:bg-orange-600 text-black border-none py-2 px-6 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                        {isSubmitting ? 'Waiting for confirmation of the project creation...' : 'Submit Project'}
                    </Button>  
                {/if}
            </div>
            
            {#if errorMessage}
                <div class="error mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                    <p class="text-red-500">{errorMessage}</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 10px 15px;
        overflow-y: auto;
        scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
    }

    .project-title {
        text-align: center;
        font-size: 2.2rem;
        margin: 20px 0 30px;
        color: orange;
        font-family: 'Russo One', sans-serif;
        letter-spacing: 0.02em;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        position: relative;
    }

    .project-title::after {
        content: '';
        position: absolute;
        bottom: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 3px;
        background: linear-gradient(90deg, rgba(255, 165, 0, 0), rgba(255, 165, 0, 1), rgba(255, 165, 0, 0));
    }

    .form-container {
        animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    @media (max-width: 768px) {
        .project-title {
            font-size: 1.8rem;
            margin: 15px 0 25px;
        }
    }
</style>