<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { projects } from '$lib/common/store';
    import { analyticsCollector } from '$lib/analytics/datacollector';
    import type { ProjectMetrics, TimeSeriesData, TrendAnalysis, ContributorAnalytics } from '$lib/analytics/data-collector';
    
    import FundingProgressChart from '$lib/components/analytics/FundingProgressChart.svelte';
    import TimeSeriesChart from '$lib/components/analytics/TimeSeriesChart.svelte';
    import ContributorStats from '$lib/components/analytics/ContributorStats.svelte';
    import TrendIndicator from '$lib/components/analytics/TrendIndicator.svelte';
    import ExportReports from '$lib/components/analytics/ExportReports.svelte';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Badge } from '$lib/components/ui/badge';
    import { RefreshCw, BarChart3, TrendingUp, Users, DollarSign } from 'lucide-svelte';
    import { fade, fly } from 'svelte/transition';

    let allMetrics: ProjectMetrics[] = [];
    let timeSeriesData: TimeSeriesData[] = [];
    let trends: TrendAnalysis | null = null;
    let contributorAnalytics: ContributorAnalytics | null = null;
    let loading = true;
    let refreshing = false;
    let selectedMetric: 'totalRaised' | 'activeProjects' | 'newProjects' | 'totalContributors' = 'totalRaised';
    let refreshInterval: ReturnType<typeof setInterval>;

    const metricOptions = [
        { value: 'totalRaised', label: 'Total Raised', icon: DollarSign },
        { value: 'activeProjects', label: 'Active Projects', icon: BarChart3 },
        { value: 'newProjects', label: 'New Projects', icon: TrendingUp },
        { value: 'totalContributors', label: 'Contributors', icon: Users },
    ] as const;

    async function loadAnalytics() {
        try {
            refreshing = true;
            
            // Collect all metrics
            allMetrics = analyticsCollector.collectAllMetrics();
            
            // Generate time series data
            timeSeriesData = analyticsCollector.generateTimeSeriesData(30);
            
            // Analyze trends
            trends = analyticsCollector.analyzeTrends(timeSeriesData);
            
            // Get contributor analytics
            contributorAnalytics = analyticsCollector.generateContributorAnalytics();
            
            loading = false;
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            refreshing = false;
        }
    }

    function handleRefresh() {
        analyticsCollector.clearCache();
        loadAnalytics();
    }

    onMount(() => {
        loadAnalytics();
        
        // Auto-refresh every 5 minutes
        refreshInterval = setInterval(() => {
            loadAnalytics();
        }, 5 * 60 * 1000);
    });

    onDestroy(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    $: totalProjects = allMetrics.length;
    $: activeProjects = allMetrics.filter(m => m.isActive).length;
    $: successfulProjects = allMetrics.filter(m => m.isSuccessful).length;
    $: totalFundsRaised = allMetrics.reduce((sum, m) => sum + m.currentRaised, 0);
</script>

<div class="min-h-screen bg-background p-4 md:p-8 space-y-8">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4" in:fade>
        <div>
            <h1 class="text-4xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p class="text-muted-foreground mt-2">
                Comprehensive insights into platform performance and funding trends
            </p>
        </div>
        
        <Button 
            on:click={handleRefresh} 
            disabled={refreshing}
            variant="outline"
        >
            <div class="flex items-center gap-2">
                <div class:animate-spin={refreshing}>
                    <RefreshCw size={16} />
                </div>
                <span>Refresh Data</span>
            </div>
        </Button>
    </div>

    {#if loading}
        <div class="flex items-center justify-center h-64">
            <div class="flex flex-col items-center gap-4">
                <div class="animate-spin text-primary">
                    <RefreshCw size={32} />
                </div>
                <p class="text-muted-foreground">Loading analytics...</p>
            </div>
        </div>
    {:else}
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div in:fly={{ y: 20, delay: 0, duration: 400 }}>
                <Card>
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div class="space-y-2">
                                <p class="text-sm font-medium text-muted-foreground">Total Projects</p>
                                <p class="text-3xl font-bold">{totalProjects}</p>
                                <Badge variant="secondary">{activeProjects} active</Badge>
                            </div>
                            <div class="bg-blue-500/10 p-3 rounded-lg text-blue-500">
                                <BarChart3 size={24} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div in:fly={{ y: 20, delay: 100, duration: 400 }}>
                <Card>
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div class="space-y-2">
                                <p class="text-sm font-medium text-muted-foreground">Total Raised</p>
                                <p class="text-3xl font-bold">{(totalFundsRaised / 1000).toFixed(1)}K</p>
                                <p class="text-xs text-muted-foreground">ERG</p>
                            </div>
                            <div class="bg-green-500/10 p-3 rounded-lg text-green-500">
                                <DollarSign size={24} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div in:fly={{ y: 20, delay: 200, duration: 400 }}>
                <Card>
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div class="space-y-2">
                                <p class="text-sm font-medium text-muted-foreground">Success Rate</p>
                                <p class="text-3xl font-bold">{trends?.successRate.toFixed(1) || 0}%</p>
                                <p class="text-xs text-muted-foreground">{successfulProjects} successful</p>
                            </div>
                            <div class="bg-purple-500/10 p-3 rounded-lg text-purple-500">
                                <TrendingUp size={24} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div in:fly={{ y: 20, delay: 300, duration: 400 }}>
                <Card>
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div class="space-y-2">
                                <p class="text-sm font-medium text-muted-foreground">Contributors</p>
                                <p class="text-3xl font-bold">{contributorAnalytics?.totalContributors || 0}</p>
                                <p class="text-xs text-muted-foreground">platform-wide</p>
                            </div>
                            <div class="bg-orange-500/10 p-3 rounded-lg text-orange-500">
                                <Users size={24} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        <!-- Contributor Statistics -->
        {#if contributorAnalytics}
            <div in:fade={{ delay: 200 }}>
                <ContributorStats analytics={contributorAnalytics} />
            </div>
        {/if}

        <!-- Funding Progress -->
        <div in:fade={{ delay: 300 }}>
            <FundingProgressChart metrics={allMetrics} />
        </div>

        <!-- Time Series Chart with Metric Selector -->
        <div class="space-y-4" in:fade={{ delay: 400 }}>
            <div class="flex flex-wrap gap-2">
                {#each metricOptions as option}
                    <Button
                        variant={selectedMetric === option.value ? 'default' : 'outline'}
                        size="sm"
                        on:click={() => selectedMetric = option.value}
                    >
                        <div class="flex items-center gap-2">
                            <svelte:component this={option.icon} size={16} />
                            <span>{option.label}</span>
                        </div>
                    </Button>
                {/each}
            </div>

            <TimeSeriesChart 
                data={timeSeriesData} 
                metric={selectedMetric}
                title="30-Day Trend Analysis"
            />
        </div>

        <!-- Trend Indicators -->
        {#if trends}
            <div in:fade={{ delay: 500 }}>
                <TrendIndicator trends={trends} />
            </div>
        {/if}

        <!-- Export Section -->
        <div in:fade={{ delay: 600 }}>
            <ExportReports />
        </div>
    {/if}
</div>

<style>
    @media print {
        :global(button), :global(.no-print) {
            display: none !important;
        }
        
        :global(.print\\:block) {
            display: block !important;
        }
    }
</style>