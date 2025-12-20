<script lang="ts">
    import type { ContributorStat } from '$lib/ergo/analytics';
    import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";

    export let contributors: ContributorStat[] = [];
    export let totalUnique: number = 0;
    export let averageContribution: number = 0;
    export let tokenName: string = "Tokens";

    $: sortedContributors = [...contributors].sort((a, b) => b.totalContributed - a.totalContributed).slice(0, 10);
</script>

<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
    <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Unique Contributors</CardTitle>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                class="h-4 w-4 text-muted-foreground"
            >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        </CardHeader>
        <CardContent>
            <div class="text-2xl font-bold">{totalUnique}</div>
        </CardContent>
    </Card>
    <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Avg. Contribution</CardTitle>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                class="h-4 w-4 text-muted-foreground"
            >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <path d="M2 10h20" />
            </svg>
        </CardHeader>
        <CardContent>
            <div class="text-2xl font-bold">{averageContribution.toFixed(2)} {tokenName}</div>
        </CardContent>
    </Card>
</div>

{#if contributors.length > 0}
    <div class="space-y-8">
        <div class="rounded-md border">
            <div class="p-4">
                <h4 class="text-base font-medium mb-4">Top Contributors</h4>
                <div class="space-y-4">
                    {#each sortedContributors as contributor, i}
                        <div class="flex items-center">
                             <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted mr-4 text-sm font-bold">
                                {i + 1}
                            </div>
                            <div class="space-y-1">
                                <p class="text-sm font-medium leading-none">
                                    {contributor.address.slice(0, 8)}...{contributor.address.slice(-6)}
                                </p>
                                <p class="text-xs text-muted-foreground">
                                    {contributor.transactionCount} transactions
                                </p>
                            </div>
                            <div class="ml-auto font-medium">
                                +{contributor.totalContributed.toLocaleString()} {tokenName}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}
