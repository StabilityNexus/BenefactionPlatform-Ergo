<script lang="ts">
    import { block_to_date, time_to_block } from '$lib/common/countdown';
    import { explorer_uri, web_explorer_uri_tx } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Label } from '$lib/components/ui/label/index.js';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import * as Select from '$lib/components/ui/select';
    import { get } from 'svelte/store';
    import { user_tokens } from '$lib/common/store';
    import { walletConnected } from '$lib/wallet/wallet-manager';

    let platform = new ErgoPlatform();

    // Token being sold/offered as a reward
    let rewardTokenOption: object | null = null;
    let rewardTokenId: string | null = null;
    let rewardTokenDecimals: number = 0;
    let rewardTokenName: string = 'Token'; // For the dynamic label

    // Token used for contributions
    let baseTokenOption: object | null = null;
    let baseTokenId: string = ''; // Empty string means ERG (default)
    let baseTokenDecimals: number = 9; // ERG has 9 decimals
    let baseTokenName: string = 'ERG';

    let tokenAmountToSellRaw: number;
    let tokenAmountToSellPrecise: number;
    let maxTokenAmountToSell: number;

    let daysLimit: number;
    let daysLimitBlock: number;
    let daysLimitText: string;

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

    // Centralized object for form validation errors
    let formErrors = {
        tokenConflict: null,
        goalOrder: null
    };

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
        if (baseTokenOption) {
            baseTokenId = baseTokenOption.value;
            const baseToken = userTokens.find((t) => t.tokenId === baseTokenId);
            baseTokenDecimals = baseToken?.decimals || 0;
            baseTokenName = baseToken?.title || 'Unknown';
        } else {
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

    $: rewardTokenDecimals = userTokens.find((t) => t.tokenId === rewardTokenId)?.decimals || 0;

    $: {
        const token = userTokens.find((t) => t.tokenId === rewardTokenId);
        maxTokenAmountToSell = token ? Number(token.balance) / Math.pow(10, token.decimals) : 0;
    }

    $: {
        tokenAmountToSellRaw = tokenAmountToSellPrecise * Math.pow(10, rewardTokenDecimals);
    }

    $: {
        exchangeRateRaw = exchangeRatePrecise * Math.pow(10, baseTokenDecimals - rewardTokenDecimals);
    }

    $: {
        calculateBlockLimit(daysLimit);
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

    async function calculateBlockLimit(days: number) {
        if (!days || days <= 0) {
            daysLimitBlock = 0;
            daysLimitText = '';
            return;
        }
        let target_date = new Date();
        target_date.setTime(target_date.getTime() + days * 24 * 60 * 60 * 1000);
        daysLimitBlock = await time_to_block(target_date.getTime(), platform);
        daysLimitText = await block_to_date(daysLimitBlock, platform);
    }

    function updateExchangeRate() {
        if (maxGoalPrecise && tokenAmountToSellPrecise) {
            exchangeRatePrecise = maxGoalPrecise / tokenAmountToSellPrecise;
        }
        validateGoalOrder();
    }

    function updateMaxValue() {
        if (tokenAmountToSellPrecise && exchangeRatePrecise) {
            maxGoalPrecise = exchangeRatePrecise * tokenAmountToSellPrecise;
        }
        validateGoalOrder();
    }

    async function handleSubmit() {
        if (rewardTokenId === null || formErrors.tokenConflict || formErrors.goalOrder) {
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

        try {
            const result = await platform.submit(
                platform.last_version,
                rewardTokenId,
                tokenAmountToSellRaw,
                daysLimitBlock,
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
        const url = `${explorer_uri}/api/v1/tokens/${id}`;
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

    // --- Lifecycle and Subscriptions ---

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
                            {#each userTokens as token}
                                <Select.Item value={token.tokenId}
                                    >{token.title} (Balance: {token.balance / Math.pow(10, token.decimals)})</Select.Item
                                >
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-sm mt-2 text-muted-foreground">
                        Don't have a token? <a
                            href="https://tools.mewfinance.com/mint"
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
                            {#each userTokens as token}
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
                        on:input={updateMaxValue}
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
                </div>

                <div class="form-group">
                    <Label for="daysLimit" class="text-sm font-medium mb-2 block"
                        >Duration (Days)</Label
                    >
                    <Input
                        id="daysLimit"
                        type="number"
                        bind:value={daysLimit}
                        min="1"
                        placeholder="e.g., 30"
                        class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
                    />
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
                        on:input={updateExchangeRate}
                        on:blur={validateGoalOrder}
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
                            !daysLimitBlock ||
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