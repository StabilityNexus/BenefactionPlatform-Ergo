<script lang="ts">
    import type { TrendAnalysis } from '$lib/analytics/datacollector';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Badge } from '$lib/components/ui/badge';
    import { TrendingUp, TrendingDown, Minus, Clock, Trophy, Calendar } from 'lucide-svelte';
    import { fade } from 'svelte/transition';

    export let trends: TrendAnalysis;

    function getTrendIcon(trend: string) {
        if (trend === 'increasing') return TrendingUp;
        if (trend === 'decreasing') return TrendingDown;
        return Minus;
    }

    function getTrendColor(trend: string) {
        if (trend === 'increasing') return 'text-green-500';
        if (trend === 'decreasing') return 'text-red-500';
        return 'text-gray-500';
    }

    function getTrendBadgeVariant(trend: string): "default" | "secondary" | "destructive" | "outline" {
        if (trend === 'increasing') return 'default';
        if (trend === 'decreasing') return 'destructive';
        return 'secondary';
    }
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- Funding Trend -->
    <div transition:fade>
        <Card>
            <CardHeader>
                <CardTitle>
                    <div class="flex items-center gap-2">
                        <div class="{getTrendColor(trends.fundingTrend)}">
                            <svelte:component 
                                this={getTrendIcon(trends.fundingTrend)} 
                                size={20}
                            />
                        </div>
                        <span>Funding Trend</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-4">
                    <div>
                        <Badge variant={getTrendBadgeVariant(trends.fundingTrend)} class="text-sm">
                            {trends.fundingTrend.toUpperCase()}
                        </Badge>
                    </div>
                    <p class="text-sm text-muted-foreground">
                        {#if trends.fundingTrend === 'increasing'}
                            Funding activity is growing! Projects are attracting more contributions.
                        {:else if trends.fundingTrend === 'decreasing'}
                            Funding activity has decreased. Consider promoting active campaigns.
                        {:else}
                            Funding activity remains stable with consistent contributions.
                        {/if}
                    </p>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Success Rate -->
    <div transition:fade={{ delay: 100 }}>
        <Card>
            <CardHeader>
                <CardTitle>
                    <div class="flex items-center gap-2">
                        <div class="text-yellow-500">
                            <Trophy size={20} />
                        </div>
                        <span>Success Rate</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-4">
                    <div class="flex items-baseline gap-2">
                        <span class="text-3xl font-bold">{trends.successRate.toFixed(1)}%</span>
                        <span class="text-sm text-muted-foreground">of completed projects</span>
                    </div>
                    <div class="w-full bg-muted rounded-full h-2">
                        <div 
                            class="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-700"
                            style="width: {trends.successRate}%"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Average Time to Goal -->
    <div transition:fade={{ delay: 200 }}>
        <Card>
            <CardHeader>
                <CardTitle>
                    <div class="flex items-center gap-2">
                        <div class="text-blue-500">
                            <Clock size={20} />
                        </div>
                        <span>Avg. Time to Goal</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-2">
                    <div class="flex items-baseline gap-2">
                        <span class="text-3xl font-bold">{Math.round(trends.averageTimeToGoal)}</span>
                        <span class="text-sm text-muted-foreground">days</span>
                    </div>
                    <p class="text-sm text-muted-foreground">
                        Average duration for successful projects to reach their funding goal.
                    </p>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Peak Funding Periods -->
    <div transition:fade={{ delay: 300 }}>
        <Card>
            <CardHeader>
                <CardTitle>
                    <div class="flex items-center gap-2">
                        <div class="text-purple-500">
                            <Calendar size={20} />
                        </div>
                        <span>Peak Funding Days</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-2">
                    {#if trends.peakFundingPeriods.length > 0}
                        {#each trends.peakFundingPeriods.slice(0, 3) as period, index}
                            <div class="flex justify-between items-center py-2 border-b last:border-b-0">
                                <span class="text-sm font-medium">#{index + 1} {period.period}</span>
                                <span class="text-sm text-muted-foreground">
                                    {(period.amount / 1000).toFixed(1)}K ERG
                                </span>
                            </div>
                        {/each}
                    {:else}
                        <p class="text-sm text-muted-foreground">Not enough data yet</p>
                    {/if}
                </div>
            </CardContent>
        </Card>
    </div>
</div>