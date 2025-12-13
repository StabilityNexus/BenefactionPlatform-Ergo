<script lang="ts">
    import type { ContributorAnalytics } from '$lib/analytics/datacollector';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Badge } from '$lib/components/ui/badge';
    import { Users, TrendingUp, Activity, Award } from 'lucide-svelte';
    import { fade, fly } from 'svelte/transition';

    export let analytics: ContributorAnalytics;

    function formatNumber(value: number): string {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toFixed(2);
    }

    $: stats = [
        {
            icon: Users,
            label: 'Total Contributors',
            value: analytics.totalContributors,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
        },
        {
            icon: Activity,
            label: 'Active Projects',
            value: analytics.activeProjects,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10',
        },
        {
            icon: TrendingUp,
            label: 'Total Contributions',
            value: formatNumber(analytics.totalContributions) + ' ERG',
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            raw: analytics.totalContributions,
        },
        {
            icon: Award,
            label: 'Avg. Contribution',
            value: formatNumber(analytics.averageContribution) + ' ERG',
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            raw: analytics.averageContribution,
        },
    ];
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each stats as stat, index}
        <div in:fly={{ y: 20, delay: index * 100, duration: 400 }}>
            <Card class="hover:shadow-lg transition-shadow duration-300">
                <CardContent class="p-6">
                    <div class="flex items-start justify-between">
                        <div class="space-y-2 flex-1">
                            <p class="text-sm font-medium text-muted-foreground">
                                {stat.label}
                            </p>
                            <p class="text-2xl font-bold">
                                {typeof stat.value === 'number' ? stat.value : stat.value}
                            </p>
                        </div>
                        <div class="{stat.bgColor} {stat.color} p-3 rounded-lg">
                            <svelte:component this={stat.icon} size={24} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    {/each}
</div>