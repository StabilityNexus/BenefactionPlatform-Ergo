<script lang="ts">
    import { onMount } from 'svelte';
    import type { ProjectMetrics } from '$lib/analytics/datacollector';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { fade } from 'svelte/transition';

    export let metrics: ProjectMetrics[] = [];
    export let title = "Funding Progress Overview";

    let chartContainer: HTMLDivElement;
    let hoveredBar: number | null = null;

    $: chartData = metrics
        .filter(m => m.isActive)
        .slice(0, 10)
        .sort((a, b) => b.goalPercentage - a.goalPercentage);

    $: maxValue = Math.max(...chartData.map(d => d.currentRaised), 1);

    function formatCurrency(value: number): string {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toFixed(2);
    }

    function getBarColor(percentage: number): string {
        if (percentage >= 100) return 'hsl(142, 76%, 36%)'; // green
        if (percentage >= 75) return 'hsl(173, 58%, 39%)'; // teal
        if (percentage >= 50) return 'hsl(48, 96%, 53%)'; // yellow
        if (percentage >= 25) return 'hsl(25, 95%, 53%)'; // orange
        return 'hsl(0, 84%, 60%)'; // red
    }
</script>

<Card class="w-full">
    <CardHeader>
        <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
        {#if chartData.length === 0}
            <div class="flex items-center justify-center h-64 text-muted-foreground">
                No active projects to display
            </div>
        {:else}
            <div class="space-y-4" bind:this={chartContainer}>
                {#each chartData as project, index}
                    <div 
                        class="relative"
                        on:mouseenter={() => hoveredBar = index}
                        on:mouseleave={() => hoveredBar = null}
                        role="button"
                        tabindex="0"
                    >
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-medium truncate max-w-[60%]">
                                {project.projectTitle}
                            </span>
                            <span class="text-sm text-muted-foreground">
                                {project.goalPercentage.toFixed(1)}%
                            </span>
                        </div>
                        
                        <div class="w-full bg-muted rounded-full h-8 relative overflow-hidden">
                            <div 
                                class="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                                style="width: {Math.min(project.goalPercentage, 100)}%; background-color: {getBarColor(project.goalPercentage)}"
                                in:fade={{ delay: index * 50 }}
                            >
                                {#if project.goalPercentage > 15}
                                    <span class="text-xs font-semibold text-white">
                                        {formatCurrency(project.currentRaised)} {project.baseTokenName}
                                    </span>
                                {/if}
                            </div>
                        </div>

                        {#if hoveredBar === index}
                            <div 
                                class="absolute z-10 bg-popover border rounded-lg shadow-lg p-3 -top-24 left-0 w-64"
                                transition:fade={{ duration: 150 }}
                            >
                                <div class="space-y-1 text-sm">
                                    <p class="font-semibold">{project.projectTitle}</p>
                                    <p>Raised: {formatCurrency(project.currentRaised)} {project.baseTokenName}</p>
                                    <p>Goal: {formatCurrency(project.minimumGoal * project.exchangeRate)} {project.baseTokenName}</p>
                                    <p>Contributors: ~{project.contributorCount}</p>
                                    <p>Tokens Sold: {project.soldTokens}</p>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </CardContent>
</Card>