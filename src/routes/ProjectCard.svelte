<script lang="ts">
    import { block_to_date, block_to_time } from "$lib/common/countdown";
    import { is_ended, min_raised, type Project } from "$lib/common/project";
    import { project_detail, connected, balance } from "$lib/common/store";
    import { badgeVariants } from "$lib/components/ui/badge";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { mode } from "mode-watcher";
    import { getBaseTokenDisplayInfo, formatBaseTokenAmount } from "$lib/ergo/token_utils";
    
    export let project: Project;

    let platform = new ErgoPlatform();

    let deadline_passed = false;
    let is_min_raised = false;
    let statusMessage = "";
    let statusColor = "";
    let baseSymbol = platform.main_token;
    let baseDecimals = 9;
    
    let showFullDescription = false;
    
    // Balance awareness for project cards
    let userErgBalance = 0;
    let canContribute = false;
    let minContributionAmount = 0;
    
    $: {
        userErgBalance = ($balance || 0) / Math.pow(10, 9);
        minContributionAmount = project.exchange_rate * Math.pow(10, project.token_details.decimals - 9);
        canContribute = $connected && userErgBalance >= minContributionAmount && project.sold_counter < project.total_pft_amount;
    }

    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);
        const limit_date = await block_to_date(project.block_limit, project.platform);
        
        // Determine base token display info (ERG or other token like SigUSD)
        const baseInfo = await getBaseTokenDisplayInfo(project.base_token_id);
        baseSymbol = baseInfo.symbol;
        baseDecimals = baseInfo.decimals;

        // Compute min/max in smallest base token units, then format for display
        const minBaseUnits = project.minimum_amount * project.exchange_rate;
        const maxBaseUnits = project.maximum_amount * project.exchange_rate;
        const minDisplay = formatBaseTokenAmount(minBaseUnits, baseDecimals, baseSymbol);
        const maxDisplay = formatBaseTokenAmount(maxBaseUnits, baseDecimals, baseSymbol);
        const isMaxReached = project.sold_counter >= project.total_pft_amount;

        if (isMaxReached) {
            statusMessage = `Reached maximum goal of ${maxDisplay}; currently closed for contributions.`;
            statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        } 
        else if (deadline_passed) {
            statusMessage = is_min_raised 
                ? `Reached minimum of ${minDisplay}; open for contributions up to ${maxDisplay}.`
                : `Did not raise minimum of ${minDisplay} before ${limit_date}; open for contributions up to ${maxDisplay}.`;
            statusColor = is_min_raised 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        } 
        else {
            statusMessage = is_min_raised
                ? `Reached minimum of ${minDisplay}; open for contributions up to ${maxDisplay}.`
                : `Aiming to raise a minimum of ${minDisplay} before ${limit_date}.`;
            statusColor = is_min_raised 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        }
    }
    load();
</script>

<Card.Root class="relative bg-[#1a1a1a] h-auto min-h-[380px] flex flex-col {$mode === 'dark' ? 'bg-opacity-90 border-orange-500/30 border' : 'bg-opacity-0 border-orange-500/20 border'} rounded-lg shadow-lg transition-all duration-300 hover:shadow-orange-500/20 hover:shadow-md">
    <!-- Balance Indicator Badge - Top Left -->
    {#if $connected}
        <div class="balance-indicator-badge">
            {#if canContribute}
                <div class="balance-badge success" title="You have sufficient funds to contribute to this project">
                    ✓ You can contribute
                </div>
            {:else if userErgBalance <= 0}
                <div class="balance-badge warning" title="You need ERG in your wallet to contribute">
                    ! Need {platform.main_token} in wallet
                </div>
            {:else if userErgBalance < minContributionAmount}
                <div class="balance-badge warning" title="You need more ERG to make the minimum contribution">
                    ! Need {minContributionAmount.toFixed(4)} {platform.main_token}
                </div>
            {:else}
                <div class="balance-badge neutral" title="This project has reached its maximum funding goal">
                    - Project fully funded
                </div>
            {/if}
        </div>
    {/if}

    <Card.Header class="p-4 pb-2 flex flex-row items-center justify-between {$mode === 'dark' ? 'bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a]' : 'bg-gradient-to-r from-white to-gray-100'} rounded-t-lg">
        <Card.Title class="text-xl font-bold line-clamp-1 text-orange-500">{project.content.title}</Card.Title>
        <div hidden>
        <a href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es" 
           target="_blank"
           class={badgeVariants({ variant: "outline" })}>
           Contract version: {project.version.replace("_", ".")}
        </a>
    </div>
    </Card.Header>
    
    <Card.Content class="p-4 flex-1 flex flex-col">
        <div class="description-container flex-1 overflow-hidden">
            {#if !showFullDescription}
                <div class="truncated-description">
                    <p class="text-sm opacity-90 transition-all duration-300">
                        {#if project.content.description.length > 150}
                            <span>{project.content.description.slice(0, 150).trim()}</span>
                            <span class="fade-text">...</span>
                            <button 
                                class="read-more-btn"
                                on:click|stopPropagation={() => showFullDescription = true}
                            >
                                Read More
                            </button>
                        {:else}
                            {project.content.description}
                        {/if}
                    </p>
                </div>
            {:else}
                <div class="full-description">
                    <p class="text-sm opacity-90 transition-all duration-300 scrollable-description">
                        {project.content.description}
                    </p>
                    <button 
                        class="read-less-btn mt-2"
                        on:click|stopPropagation={() => showFullDescription = false}
                    >
                        Show Less
                    </button>
                </div>
            {/if}
        </div>
    </Card.Content>

    <!-- Status Message Sticky Bottom -->
    <div class="absolute bottom-16 left-0 w-full px-4">
        <div class={`${statusColor} p-2 rounded-md text-sm transition-all shadow-sm break-words`}>
            <p class="leading-relaxed">{statusMessage}</p>
        </div>
    </div>

    <Card.Footer class="p-4 pt-2 mt-auto">
        <Button
            class="w-full transition-all duration-300 hover:scale-[1.02] hover:brightness-110"
            on:click={() => project_detail.set(project)}
            style="background-color: orange; color: black; font-weight: 600;"
        >
            View Project
        </Button>
    </Card.Footer>
</Card.Root>

<style>
    .description-container {
        position: relative;
        margin-bottom: 1rem;
    }

    .truncated-description, .full-description {
        position: relative;
        width: 100%;
    }

    .fade-text {
        opacity: 0.5;
    }

    .read-more-btn, .read-less-btn {
        color: orange;
        background: none;
        border: none;
        padding: 0;
        font-size: 0.875rem;
        cursor: pointer;
        margin-top: 0.5rem;
        display: block;
        width: 100%;
        text-align: left;
        transition: color 0.2s ease;
    }

    .read-more-btn:hover, .read-less-btn:hover {
        color: #ff8c00;
    }

    .scrollable-description {
        max-height: 200px;
        overflow-y: auto;
    }

    .scrollable-description::-webkit-scrollbar {
        width: 6px;
    }

    .scrollable-description::-webkit-scrollbar-track {
        background: rgba(255, 165, 0, 0.1);
        border-radius: 3px;
    }

    .scrollable-description::-webkit-scrollbar-thumb {
        background: rgba(255, 165, 0, 0.3);
        border-radius: 3px;
    }

    .scrollable-description::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 165, 0, 0.5);
    }

    /* Ensure proper text wrapping for status messages */
    .break-words {
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
    }

    /* Balance Indicator Badge Styles */
    .balance-indicator-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 10;
    }

    .balance-badge {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        backdrop-filter: blur(8px);
        border: 1px solid;
        cursor: help;
        transition: all 0.2s ease;
    }

    .balance-badge:hover {
        transform: scale(1.05);
    }

    .balance-badge.success {
        background: rgba(34, 197, 94, 0.2);
        color: #22c55e;
        border-color: rgba(34, 197, 94, 0.3);
    }

    .balance-badge.warning {
        background: rgba(251, 146, 60, 0.2);
        color: #fb923c;
        border-color: rgba(251, 146, 60, 0.3);
    }

    .balance-badge.neutral {
        background: rgba(156, 163, 175, 0.2);
        color: #9ca3af;
        border-color: rgba(156, 163, 175, 0.3);
    }
</style>