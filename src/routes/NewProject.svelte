<script lang="ts">
    import { block_to_date, time_to_block } from '$lib/common/countdown';
    import { web_explorer_uri_tx } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Label } from '$lib/components/ui/label/index.js';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import * as Select from '$lib/components/ui/select';
    import { get } from 'svelte/store';
    import { explorer_uri, user_tokens } from '$lib/common/store';
    import { walletConnected } from '$lib/wallet/wallet-manager';
    import { fetch_projects } from '$lib/ergo/fetch';

    let platform = new ErgoPlatform();

    // Token being sold/offered as a reward
    let rewardTokenOption: object | null = null;
    let rewardTokenId: string | null = null;
    let rewardTokenDecimals: number = 0;
    let rewardTokenName: string = 'Token'; // For the dynamic label

    // Token used for contributions - Initialize with ERG as default
    let baseTokenOption: object | null = null; // null means ERG
    let baseTokenId: string = ''; // Empty string means ERG (default)
    let baseTokenDecimals: number = 9; // ERG has 9 decimals - DEFAULT
    let baseTokenName: string = 'ERG';
    
    // Ensure ERG is default on load
    $: if (baseTokenOption === undefined) {
        baseTokenOption = null;
        baseTokenDecimals = 9;
        baseTokenName = 'ERG';
    }

    let tokenAmountToSellRaw: number;
    let tokenAmountToSellPrecise: number;
    let maxTokenAmountToSell: number;

    let deadlineValue: number;
    let deadlineUnit: 'days' | 'minutes' = 'days';
    let deadlineValueBlock: number;
    let deadlineValueText: string;

    let exchangeRateRaw: number;
    let exchangeRatePrecise: number;

    // Fundraising goals in the base currency
    let maxGoalPrecise: number;
    let minGoalPrecise: number;

    let projectTitle: string = '';
    let projectDescription: string = '';
    let projectImage: string = '';
    let projectLink: string = '';

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let userTokens: Array<{ tokenId: string; title: string; balance: number; decimals: number }> = [];
    let existingAPTTokens: Set<string> = new Set(); // APT tokens (project_ids) from existing projects
    let existingPFTTokens: Set<string> = new Set(); // PFT tokens (token_ids) from existing projects
    
    // Filtered tokens that exclude problematic tokens
    let availableRewardTokens: Array<{ tokenId: string; title: string; balance: number; decimals: number }> = [];
    let availableBaseTokens: Array<{ tokenId: string; title: string; balance: number; decimals: number }> = [];

    // Centralized object for form validation errors
    let formErrors = {
        tokenConflict: null,
        goalOrder: null,
        invalidBaseToken: null,
        invalidToken: null,
        exchangeRate: null
    };
    
    // Exchange rate validation
    let minViablePrice = 0;
    let exchangeRateWarning = '';

    // --- Reactive Declarations ---

    $: {
        if (rewardTokenOption) {
            rewardTokenId = rewardTokenOption.value;
        } else {
            rewardTokenId = null;
        }
    }

    // Reactively updates the reward token name
    $: {
        if (rewardTokenId) {
            const token = userTokens.find((t) => t.tokenId === rewardTokenId);
            rewardTokenName = token ? token.title : 'Token';
        } else {
            rewardTokenName = 'Token';
        }
    }

    $: {
        if (baseTokenOption && baseTokenOption.value !== null) {
            // A non-ERG token is selected
            baseTokenId = baseTokenOption.value;
            const baseToken = userTokens.find((t) => t.tokenId === baseTokenId);
            baseTokenDecimals = baseToken?.decimals || 0;
            baseTokenName = baseToken?.title || 'Unknown';
        } else {
            // ERG is selected (null value) or nothing is selected
            baseTokenId = ''; // ERG
            baseTokenDecimals = 9;
            baseTokenName = 'ERG';
        }
    }

    // Validation for token conflict
    $: {
        if (rewardTokenId && baseTokenId && rewardTokenId === baseTokenId) {
            formErrors.tokenConflict = 'The Project Token and Contribution Currency cannot be the same.';
        } else {
            formErrors.tokenConflict = null;
        }
    }

    // Filter tokens for proper usage
    $: {
        // Create comprehensive APT token blacklist
        const allAPTTokens = new Set([...existingAPTTokens]);
        
        // Add tokens with "APT" in their name as additional safety
        for (const token of userTokens) {
            if (token.title && token.title.includes('APT')) {
                allAPTTokens.add(token.tokenId);
            }
        }
        
        // For reward tokens: Exclude all APT tokens, allow PFT tokens
        availableRewardTokens = userTokens.filter(token => !allAPTTokens.has(token.tokenId));
        
        // For base tokens: Exclude both APT and PFT tokens
        availableBaseTokens = userTokens.filter(token => 
            !allAPTTokens.has(token.tokenId) && !existingPFTTokens.has(token.tokenId)
        );
    }

    // Validation for token usage
    $: {
        let tokenError = null;
        
        if (rewardTokenId && existingAPTTokens.has(rewardTokenId)) {
            tokenError = 'Cannot use APT tokens from existing projects as reward tokens.';
        }
        
        if (baseTokenId && (existingAPTTokens.has(baseTokenId) || existingPFTTokens.has(baseTokenId))) {
            tokenError = 'Cannot use APT/PFT tokens from existing projects as contribution currency.';
        }
        
        formErrors.invalidToken = tokenError;
    }

    $: rewardTokenDecimals = userTokens.find((t) => t.tokenId === rewardTokenId)?.decimals || 0;

    $: {
        const token = userTokens.find((t) => t.tokenId === rewardTokenId);
        maxTokenAmountToSell = token ? Number(token.balance) / Math.pow(10, token.decimals) : 0;
        tokenAmountToSellRaw = tokenAmountToSellPrecise * Math.pow(10, rewardTokenDecimals);
    }

    $: {
        // Use proper decimal calculation to avoid precision loss
        // Convert string to number if needed
        const exchangeRateNum = typeof exchangeRatePrecise === 'string' ? parseFloat(exchangeRatePrecise) : exchangeRatePrecise;
        
        // Calculate minimum viable price
        // The stored rate must be >= 1, so: price * 10^(baseDecimals - tokenDecimals) >= 1
        // Therefore: price >= 10^(tokenDecimals - baseDecimals)
        minViablePrice = Math.pow(10, rewardTokenDecimals - baseTokenDecimals);
        
        // The contract expects: base_amount = token_amount * exchange_rate
        // Where both amounts are in smallest units
        // So exchange_rate = smallest_base_units per smallest_token_unit
        
        // Calculate the raw exchange rate
        exchangeRateRaw = exchangeRateNum * Math.pow(10, baseTokenDecimals - rewardTokenDecimals);
        
        // Validation
        if (exchangeRateNum > 0 && exchangeRateRaw < 1) {
            formErrors.exchangeRate = `Price too low. Minimum viable price is ${minViablePrice.toFixed(Math.max(0, baseTokenDecimals))} ${baseTokenName} per ${rewardTokenName}`;
            exchangeRateWarning = `⚠️ Due to smart contract limitations, the minimum price for these tokens is ${minViablePrice.toFixed(Math.max(0, baseTokenDecimals))} ${baseTokenName} per ${rewardTokenName}`;
            exchangeRateRaw = 0; // Prevent submission with invalid rate
        } else {
            formErrors.exchangeRate = null;
            exchangeRateWarning = '';
        }
    }

    $: {
        if (deadlineValue && deadlineValue > 0) {
            calculateBlockLimit(deadlineValue, deadlineUnit);
        } else {
            deadlineValueBlock = undefined;
            deadlineValueText = "";
        }
    }

    // --- Functions ---

    function validateGoalOrder() {
        if (
            minGoalPrecise !== undefined &&
            maxGoalPrecise !== undefined &&
            minGoalPrecise > maxGoalPrecise
        ) {
            formErrors.goalOrder = 'The minimum goal cannot be greater than the maximum goal.';
        } else {
            formErrors.goalOrder = null;
        }
    }

    async function calculateBlockLimit(value: number, unit: 'days' | 'minutes') {
        if (!platform || !value || value <=0) {
            deadlineValueBlock = undefined;
            deadlineValueText = "";
            return;
        }
        try {
            let target_date = new Date();
            let milliseconds;
            if (unit === 'days') {
                milliseconds = value * 24 * 60 * 60 * 1000;
            } else { // minutes
                milliseconds = value * 60 * 1000;
            }
            target_date.setTime(target_date.getTime() + milliseconds); 
            deadlineValueBlock = await time_to_block(target_date.getTime(), platform);
            deadlineValueText = await block_to_date(deadlineValueBlock, platform);
        } catch (error) {
            console.error("Error calculating block limit:", error);
            deadlineValueBlock = undefined;
            deadlineValueText = "Error calculating deadline";
        }
    }

    // Flag to prevent circular updates between price and max goal
    let isUpdating = false;

    function updateExchangeRate() {
        if (isUpdating) return;
        if (maxGoalPrecise && tokenAmountToSellPrecise) {
            isUpdating = true;
            exchangeRatePrecise = maxGoalPrecise / tokenAmountToSellPrecise;
            isUpdating = false;
        }
        validateGoalOrder();
    }

    function updateMaxValue() {
        if (isUpdating) return;
        if (tokenAmountToSellPrecise && exchangeRatePrecise) {
            isUpdating = true;
            maxGoalPrecise = exchangeRatePrecise * tokenAmountToSellPrecise;
            isUpdating = false;
        }
        validateGoalOrder();
    }

    async function handleSubmit() {
        if (rewardTokenId === null || formErrors.tokenConflict || formErrors.goalOrder || formErrors.invalidToken) {
            errorMessage = 'Please correct the errors before submitting.';
            return;
        }

        isSubmitting = true;
        errorMessage = null;
        transactionId = null;

        if (minGoalPrecise === undefined) {
            minGoalPrecise = 0;
        }
        let minValueNano = minGoalPrecise * Math.pow(10, baseTokenDecimals);
        let minimumTokenSold = exchangeRateRaw > 0 ? minValueNano / exchangeRateRaw : 0;

        let projectContent = JSON.stringify({
            title: projectTitle,
            description: projectDescription,
            image: projectImage,
            link: projectLink
        });

        // 🔍 DEBUG: Log what we're about to submit
        console.log(' SUBMITTING PROJECT TO BLOCKCHAIN:', {
            'minGoalPrecise (user entered)': minGoalPrecise,
            'minValueNano (in smallest base units)': minValueNano,
            'exchangeRateRaw': exchangeRateRaw,
            'exchangeRateRaw (rounded)': Math.round(exchangeRateRaw),
            'minimumTokenSold (calculated)': minimumTokenSold,
            'minimumTokenSold (rounded - SUBMITTED)': Math.round(minimumTokenSold),
            'tokenAmountToSellRaw': tokenAmountToSellRaw,
            'baseTokenDecimals': baseTokenDecimals,
            'rewardTokenDecimals': rewardTokenDecimals,
            'baseTokenId': baseTokenId,
            'baseTokenName': baseTokenName
        });

        try {
            const result = await platform.submit(
                platform.last_version,
                rewardTokenId,
                tokenAmountToSellRaw,
                deadlineValueBlock,
                Math.round(exchangeRateRaw),
                projectContent,
                Math.round(minimumTokenSold),
                projectTitle,
                baseTokenId
            );
            transactionId = result;
        } catch (error) {
            console.error(error);
            errorMessage = error.message || 'An unexpected error occurred.';
        } finally {
            isSubmitting = false;
        }
    }

    async function fetchTokenDetails(id: string) {
        const url = `${get(explorer_uri)}/api/v1/tokens/${id}`;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                return {
                    name: data.name || id.slice(0, 6) + '...' + id.slice(-4),
                    decimals: data.decimals !== null ? data.decimals : 0
                };
            }
        } catch (error) {
            console.error(`Error fetching token details for ${id}:`, error);
        }
        return { name: id.slice(0, 6) + '...' + id.slice(-4), decimals: 0 };
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
                    .filter(([tokenId, _]) => tokenId !== 'ERG')
                    .map(async ([tokenId, balance]) => {
                        const { name, decimals } = await fetchTokenDetails(tokenId);
                        return {
                            tokenId,
                            title: name,
                            balance,
                            decimals
                        };
                    })
            );
        } catch (error) {
            console.error('Error fetching user tokens:', error);
        }
    }

    async function loadExistingProjectTokens() {
        try {
            const projects = await fetch_projects(0);
            const aptTokens = new Set<string>();
            const pftTokens = new Set<string>();
            
            for (const [projectId, project] of projects) {
                // Add APT token (project_id) - these should be blocked from reward selection
                aptTokens.add(projectId);
                // Add PFT token (token_id) - these should be blocked from base currency selection only
                pftTokens.add(project.token_id);
            }
            
            existingAPTTokens = aptTokens;
            existingPFTTokens = pftTokens;
        } catch (error) {
            console.error('Error loading existing project tokens:', error);
        }
    }

    // --- Lifecycle and Subscriptions ---

    // Load existing project tokens on component mount
    loadExistingProjectTokens();

    walletConnected.subscribe((isConnected) => {
        if (isConnected) {
            getUserTokens();
        } else {
            userTokens = [];
            rewardTokenOption = null;
            baseTokenOption = null;
        }
    });
</script>

<div>
    <div class="container mx-auto py-4">
        <h2 class="project-title">Raise Funds for a New Project</h2>

        <div class="form-container bg-background/80 backdrop-blur-lg rounded-xl p-6 mb-6">
            <div class="form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-3">
                    <h3 class="text-xl font-semibold mb-4 text-orange-400">
                        Step 1: Configure the Token You Will Sell
                    </h3>
                </div>

                <div class="form-group">
                    <Label for="rewardToken" class="text-sm font-medium mb-2 block"
                        >Project Token (for rewards)</Label
                    >
                    <Select.Root bind:selected={rewardTokenOption} required>
                        <Select.Trigger class="w-full border-orange-500/20 focus:border-orange-500/40">
                            <Select.Value placeholder="Select a token to sell" />
                        </Select.Trigger>
                        <Select.Content>
                            {#each availableRewardTokens as token}
                                <Select.Item value={token.tokenId}
                                    >{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</Select.Item
                                >
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-sm mt-2 text-muted-foreground">
                        Don't have a token? <a
                            href="https://ergo-basics.github.io/token-minter"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-orange-400 underline hover:text-orange-300 transition-colors"
                            >Create one here</a
                        >.
                    </p>
                </div>

                <div class="form-group">
                    <Label for="tokenAmountToSell" class="text-sm font-medium mb-2 block"
                        >Total Amount for Sale</Label
                    >
                    <Input
                        type="number"
                        id="tokenAmountToSell"
                        bind:value={tokenAmountToSellPrecise}
                        max={maxTokenAmountToSell}
                        step={1 / Math.pow(10, rewardTokenDecimals)}
                        min={0}
                        placeholder="e.g., 1,000,000"
                        on:input={updateMaxValue}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="lg:col-span-3" />
                <hr class="lg:col-span-3 my-6 border-orange-500/20" />

                <div class="lg:col-span-3">
                    <h3 class="text-xl font-semibold mb-4 text-orange-400">
                        Step 2: Define the Fundraising Terms
                    </h3>
                    {#if formErrors.tokenConflict}
                        <p class="text-red-500 text-sm mb-4">{formErrors.tokenConflict}</p>
                    {/if}
                    {#if formErrors.invalidToken}
                        <p class="text-red-500 text-sm mb-4">{formErrors.invalidToken}</p>
                    {/if}
                </div>
                <div class="form-group">
                    <Label for="baseToken" class="text-sm font-medium mb-2 block"
                        >Contribution Currency</Label
                    >
                    <Select.Root bind:selected={baseTokenOption}>
                        <Select.Trigger class="w-full border-orange-500/20 focus:border-orange-500/40">
                            <Select.Value placeholder="Select currency" />
                        </Select.Trigger>
                        <Select.Content>
                            <Select.Item value={null}>ERG (default)</Select.Item>
                            {#each availableBaseTokens as token}
                                <Select.Item value={token.tokenId}>{token.title}</Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-sm mt-2 text-muted-foreground">
                        Contributors will pay with this currency.
                    </p>
                </div>

                <div class="form-group">
                    <Label for="exchangeRate" class="text-sm font-medium mb-2 block"
                        >Price ({baseTokenName} per {rewardTokenName})</Label
                    >
                    <Input
                        type="number"
                        id="exchangeRate"
                        bind:value={exchangeRatePrecise}
                        min={0}
                        step="0.000000001"
                        placeholder="Price in {baseTokenName}"
                        on:blur={updateMaxValue}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1 {formErrors.exchangeRate ? 'border-red-500' : ''}"
                    />
                    {#if exchangeRateWarning}
                        <div class="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md">
                            <p class="text-sm text-yellow-800 dark:text-yellow-200">{exchangeRateWarning}</p>
                        </div>
                    {/if}
                </div>

                <div class="form-group">
                    <Label for="deadlineValue" class="text-sm font-medium mb-2 block">
                        Duration
                    </Label>
                    <div class="flex space-x-2">
                        <Input
                            id="deadlineValue"
                            type="number"
                            bind:value={deadlineValue}
                            min="1"
                            placeholder="e.g., 30"
                            class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                        />
                        <select 
                                bind:value={deadlineUnit} 
                                class="p-2 border border-orange-500/20 rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                            >
                                <option value="days">Days</option>
                                <option value="minutes">Minutes</option>
                            </select>
                    </div>
                </div>

                <div class="form-group">
                    <Label for="minGoal" class="text-sm font-medium mb-2 block"
                        >Minimum Goal (in {baseTokenName})</Label
                    >
                    <Input
                        type="number"
                        id="minGoal"
                        bind:value={minGoalPrecise}
                        max={maxGoalPrecise}
                        min={0}
                        placeholder="Minimum amount in {baseTokenName}"
                        on:blur={validateGoalOrder}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="maxGoal" class="text-sm font-medium mb-2 block"
                        >Maximum Goal (in {baseTokenName})</Label
                    >
                    <Input
                        type="number"
                        id="maxGoal"
                        bind:value={maxGoalPrecise}
                        min={minGoalPrecise || 0}
                        placeholder="Maximum amount in {baseTokenName}"
                        on:blur={updateExchangeRate}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="lg:col-span-3">
                    {#if formErrors.goalOrder}
                        <p class="text-red-500 text-sm -mt-4">{formErrors.goalOrder}</p>
                    {/if}
                </div>

                <hr class="lg:col-span-3 my-6 border-orange-500/20" />

                <div class="lg:col-span-3">
                    <h3 class="text-xl font-semibold mb-4 text-orange-400">
                        Step 3: Describe Your Project
                    </h3>
                </div>

                <div class="form-group">
                    <Label for="projectTitle" class="text-sm font-medium mb-2 block">Project Title</Label
                    >
                    <Input
                        type="text"
                        id="projectTitle"
                        bind:value={projectTitle}
                        placeholder="Enter the project title"
                        required
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="projectImage" class="text-sm font-medium mb-2 block"
                        >Project Image URL</Label
                    >
                    <Input
                        type="text"
                        id="projectImage"
                        bind:value={projectImage}
                        placeholder="https://..."
                        required
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="projectLink" class="text-sm font-medium mb-2 block"
                        >Project Link</Label
                    >
                    <Input
                        type="text"
                        id="projectLink"
                        bind:value={projectLink}
                        placeholder="https://..."
                        required
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group lg:col-span-3">
                    <Label for="projectDescription" class="text-sm font-medium mb-2 block"
                        >Project Description</Label
                    >
                    <Textarea
                        id="projectDescription"
                        bind:value={projectDescription}
                        placeholder="Tell about your project..."
                        required
                        class="w-full h-28 lg:h-32 border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>
            </div>

            <div class="form-actions mt-6 flex justify-center">
                {#if transactionId}
                    <div
                        class="result bg-background/80 backdrop-blur-lg border border-orange-500/20 rounded-lg p-4 w-full max-w-xl"
                    >
                        <p class="text-center">
                            <strong>Transaction ID:</strong>
                            <a
                                href="{web_explorer_uri_tx + transactionId}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-orange-400 hover:text-orange-300 underline transition-colors"
                            >
                                {transactionId}
                            </a>
                        </p>
                    </div>
                {:else}
                    <Button
                        on:click={handleSubmit}
                        disabled={isSubmitting ||
                            !tokenAmountToSellRaw ||
                            !exchangeRateRaw ||
                            !maxGoalPrecise ||
                            !projectTitle ||
                            !deadlineValueBlock ||
                            formErrors.tokenConflict ||
                            formErrors.goalOrder}
                        class="bg-orange-500 hover:bg-orange-600 text-black border-none py-2 px-6 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                        {isSubmitting ? 'Submitting Project...' : 'Submit Project'}
                    </Button>
                {/if}
            </div>

            {#if errorMessage && !transactionId}
                <div
                    class="error mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center"
                >
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
        background: linear-gradient(
            90deg,
            rgba(255, 165, 0, 0),
            rgba(255, 165, 0, 1),
            rgba(255, 165, 0, 0)
        );
    }
    .form-container {
        animation: fadeIn 0.5s ease-in;
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .form-group {
        margin-bottom: 0;
    }
    @media (max-width: 768px) {
        .project-title {
            font-size: 1.8rem;
            margin: 15px 0 25px;
        }
    }
</style>