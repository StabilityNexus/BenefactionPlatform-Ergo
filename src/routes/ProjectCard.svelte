<script lang="ts">
    import { block_to_date } from "$lib/common/countdown";
    import { is_ended, min_raised, type Project, CampaignPhase } from "$lib/common/project";
    import { project_detail, connected, balance } from "$lib/common/store";
    import { badgeVariants } from "$lib/components/ui/badge";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { mode } from "mode-watcher";
    import {
        getBaseTokenDisplayInfo,
        formatBaseTokenAmount,
    } from "$lib/ergo/token_utils";

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
        minContributionAmount =
            project.exchange_rate *
            Math.pow(10, project.token_details.decimals - 9);
        canContribute =
            $connected &&
            userErgBalance >= minContributionAmount &&
            project.sold_counter < project.total_pft_amount;
    }

    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);

        // Handle both timestamp and block height modes
        let limit_date: string;
        if (project.is_timestamp_limit) {
            // In timestamp mode, block_limit is already a timestamp
            // Display in local time for better user experience
            limit_date = new Date(project.block_limit).toLocaleString();
        } else {
            // In block height mode, convert block to date
            limit_date = await block_to_date(
                project.block_limit,
                project.platform,
            );
        }

        const baseInfo = await getBaseTokenDisplayInfo(project.base_token_id);
        baseSymbol = baseInfo.symbol;
        baseDecimals = baseInfo.decimals;

        // Compute min/max in smallest base token units, then format for display
        const minBaseUnits = project.minimum_amount * project.exchange_rate;
        const maxBaseUnits = project.maximum_amount * project.exchange_rate;
        const minDisplay = formatBaseTokenAmount(
            minBaseUnits,
            baseDecimals,
            baseSymbol,
        );
        const maxDisplay = formatBaseTokenAmount(
            maxBaseUnits,
            baseDecimals,
            baseSymbol,
        );
        const isMaxReached = project.sold_counter >= project.total_pft_amount;

        if (isMaxReached) {
            statusMessage = `Reached maximum goal of ${maxDisplay}; currently closed for contributions.`;
            statusColor =
                "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20";
        } else if (deadline_passed) {
            statusMessage = is_min_raised
                ? `Reached minimum of ${minDisplay}; open for contributions up to ${maxDisplay}.`
                : `Did not raise minimum of ${minDisplay} before ${limit_date}; open for contributions up to ${maxDisplay}.`;
            statusColor = is_min_raised
                ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20"
                : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
        } else {
            statusMessage = is_min_raised
                ? `Reached minimum of ${minDisplay}; open for contributions up to ${maxDisplay}.`
                : `Aiming to raise a minimum of ${minDisplay} before ${limit_date}.`;
            statusColor = is_min_raised
                ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20"
                : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
        }
    }
    load();
</script>

<Card.Root
    class="relative group h-full flex flex-col {$mode === 'dark'
        ? 'bg-[#1a1a1a]'
        : 'bg-[#f9f9f9]'} {$mode === 'dark'
        ? 'border-orange-500/30'
        : 'border-orange-500/20'} border rounded-xl shadow-lg overflow-hidden hover:shadow-orange-500/10 transition-all duration-300"
>
    <Card.Header
        class="p-5 pb-3 flex flex-row items-start justify-between gap-4 {$mode ===
        'dark'
            ? 'bg-gradient-to-b from-white/5 to-transparent'
            : 'bg-gradient-to-b from-black/5 to-transparent'}"
    >
        <div class="flex-1 min-w-0">
            {#if project.content.emergency}
                <div class="mb-2 flex items-center gap-2 flex-wrap">
                    {#if project.content.emergency.phase === CampaignPhase.PENDING_VERIFICATION}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            ⏳ Pending Verification
                        </span>
                    {:else if project.content.emergency.phase === CampaignPhase.UNDER_REVIEW}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            👥 Under Community Review
                        </span>
                    {:else if project.content.emergency.phase === CampaignPhase.APPROVED}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                            ✓ Approved - Accepting Donations
                        </span>
                    {:else if project.content.emergency.phase === CampaignPhase.REJECTED}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                            ✕ Verification Failed
                        </span>
                    {:else if project.content.emergency.phase === CampaignPhase.COMPLETED}
                        <span class="px-2 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            ✓ Completed
                        </span>
                    {/if}
                    
                    {#if project.content.emergency.emergencyType}
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                            {#if project.content.emergency.emergencyType === 'medical'}
                                🏥 Medical
                            {:else if project.content.emergency.emergencyType === 'accident'}
                                🚑 Accident
                            {:else if project.content.emergency.emergencyType === 'natural_disaster'}
                                🌪️ Disaster
                            {:else if project.content.emergency.emergencyType === 'financial_crisis'}
                                💸 Crisis
                            {/if}
                        </span>
                    {/if}
                </div>
            {/if}
            
            <Card.Title
                class="text-xl font-bold text-orange-500 leading-tight break-words"
            >
                {project.content.title}
            </Card.Title>
            <div hidden>
                <a
                    href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es"
                    target="_blank"
                    class={badgeVariants({ variant: "outline" })}
                >
                    Contract version: {project.version.replace("_", ".")}
                </a>
                <!-- svelte-ignore a11y-missing-attribute -->
                <a class={badgeVariants({ variant: "outline" })}
                    >Creation height: {project.box.creationHeight}</a
                >
            </div>
        </div>

        {#if $connected}
            <div class="flex-shrink-0 pt-1">
                {#if canContribute}
                    <div
                        class="balance-badge success"
                        title="You have sufficient funds to contribute to this campaign"
                    >
                        ✓ You can contribute
                    </div>
                {:else if userErgBalance <= 0}
                    <div
                        class="balance-badge warning"
                        title="You need ERG in your wallet to contribute"
                    >
                        Need {platform.main_token}
                    </div>
                {:else if userErgBalance < minContributionAmount}
                    <div
                        class="balance-badge warning"
                        title="You need more ERG to make the minimum contribution"
                    >
                        Need {minContributionAmount.toFixed(4)}
                        {platform.main_token}
                    </div>
                {:else}
                    <div
                        class="balance-badge neutral"
                        title="This campaign has reached its maximum funding goal"
                    >
                        Fully funded
                    </div>
                {/if}
            </div>
        {/if}
    </Card.Header>

    <Card.Content class="p-5 pt-2 flex-1 flex flex-col">
        <div class="description-container mb-6">
            {#if !showFullDescription}
                <div class="relative">
                    <p
                        class="text-sm leading-relaxed opacity-80 text-primary/90"
                    >
                        {#if project.content.description.length > 150}
                            {project.content.description.slice(0, 150).trim()}
                            <span class="opacity-50">...</span>
                        {:else}
                            {project.content.description}
                        {/if}
                    </p>
                    {#if project.content.description.length > 150}
                        <button
                            class="text-xs font-semibold text-orange-500 hover:text-orange-400 mt-1 transition-colors"
                            on:click|stopPropagation={() =>
                                (showFullDescription = true)}
                        >
                            Read More
                        </button>
                    {/if}
                </div>
            {:else}
                <div class="full-description">
                    <p
                        class="text-sm leading-relaxed opacity-80 text-primary/90 scrollable-description pr-2"
                    >
                        {project.content.description}
                    </p>
                    <button
                        class="text-xs font-semibold text-orange-500 hover:text-orange-400 mt-2 transition-colors"
                        on:click|stopPropagation={() =>
                            (showFullDescription = false)}
                    >
                        Show Less
                    </button>
                </div>
            {/if}
        </div>

        <!-- Emergency Donation Status Indicator -->
        {#if project.content.emergency && (project.content.emergency.phase === CampaignPhase.PENDING_VERIFICATION || project.content.emergency.phase === CampaignPhase.UNDER_REVIEW || project.content.emergency.phase === CampaignPhase.REJECTED)}
            <div class="donation-status-alert {project.content.emergency.phase === CampaignPhase.REJECTED ? 'rejected' : 'pending'}">
                {#if project.content.emergency.phase === CampaignPhase.REJECTED}
                    <span class="status-icon">❌</span>
                    <span class="status-text">Donations Blocked - Verification Failed</span>
                {:else if project.content.emergency.phase === CampaignPhase.UNDER_REVIEW}
                    <span class="status-icon">🔍</span>
                    <span class="status-text">Donations Blocked - Under Community Review</span>
                {:else}
                    <span class="status-icon">⏳</span>
                    <span class="status-text">Donations Blocked - Awaiting Verification</span>
                {/if}
            </div>
        {/if}

        <div class="mt-auto pt-4">
            <div
                class={`p-3 rounded-lg text-xs font-medium border ${statusColor}`}
            >
                <p class="leading-relaxed">{statusMessage}</p>
            </div>
        </div>
    </Card.Content>

    <Card.Footer class="p-5 pt-0">
        <Button
            class="w-full font-bold shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all duration-200"
            on:click={() => project_detail.set(project)}
            style="background-color: orange; color: black;"
        >
            View Campaign
        </Button>
    </Card.Footer>
</Card.Root>

<style>
    .scrollable-description {
        max-height: 160px;
        overflow-y: auto;
    }

    /* Custom Scrollbar for description */
    .scrollable-description::-webkit-scrollbar {
        width: 4px;
    }
    .scrollable-description::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
    }
    .scrollable-description::-webkit-scrollbar-thumb {
        background: rgba(255, 165, 0, 0.3);
        border-radius: 4px;
    }
    .scrollable-description::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 165, 0, 0.5);
    }

    /* Badge Styles */
    .balance-badge {
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        white-space: nowrap;
        border: 1px solid;
        cursor: help;
        transition: all 0.2s ease;
    }

    .balance-badge.success {
        background: rgba(34, 197, 94, 0.1);
        color: #4ade80;
        border-color: rgba(34, 197, 94, 0.2);
    }

    .balance-badge.warning {
        background: rgba(251, 146, 60, 0.1);
        color: #fb923c;
        border-color: rgba(251, 146, 60, 0.2);
    }

    .balance-badge.neutral {
        background: rgba(156, 163, 175, 0.1);
        color: #9ca3af;
        border-color: rgba(156, 163, 175, 0.2);
    }

    /* Donation Status Alert */
    .donation-status-alert {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: 8px;
        margin-top: 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid;
    }

    .donation-status-alert.pending {
        background: rgba(251, 191, 36, 0.1);
        border-color: rgba(251, 191, 36, 0.3);
        color: #fbbf24;
    }

    .donation-status-alert.rejected {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }

    .status-icon {
        font-size: 1rem;
        flex-shrink: 0;
    }

    .status-text {
        flex: 1;
        line-height: 1.4;
    }
</style>
