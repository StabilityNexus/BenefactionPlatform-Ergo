<script lang="ts">
    import type { Project } from "$lib/common/project";
    import { project_detail } from "$lib/common/store";
    import { get } from "svelte/store";
    import { onMount } from "svelte";
    import { 
        updateAnalyticsData, 
        getAnalyticsData,
        getKeyMetrics,
        type AnalyticsData
    } from "$lib/analytics/metrics-collector";
    import { exportReport } from "$lib/analytics/report-generator";
    import FundingProgressChart from "$lib/components/analytics/FundingProgressChart.svelte";
    import ContributionChart from "$lib/components/analytics/ContributionChart.svelte";
    import ContributorBarChart from "$lib/components/analytics/ContributorBarChart.svelte";
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import { Download, RefreshCw, TrendingUp, Users, DollarSign, Target } from "lucide-svelte";

    let project: Project | null = $project_detail;
    let analytics: AnalyticsData | null = null;
    let loading = false;
    let error: string | null = null;
    let keyMetrics = {
        totalRaised: 0,
        totalContributors: 0,
        averageContribution: 0,
        fundingProgress: 0,
        daysRemaining: 0
    };

    async function loadAnalytics() {
        if (!project) return;

        loading = true;
        error = null;

        try {
            analytics = await updateAnalyticsData(project);
            keyMetrics = getKeyMetrics(project);
            
            // Update with actual contributor data if available
            if (analytics && analytics.contributors.length > 0) {
                keyMetrics.totalContributors = analytics.contributors.length;
                const totalContributions = analytics.contributors.reduce(
                    (sum, c) => sum + c.contributionAmount, 
                    0
                );
                keyMetrics.averageContribution = totalContributions / analytics.contributors.length;
            }
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to load analytics";
            console.error("Error loading analytics:", err);
        } finally {
            loading = false;
        }
    }

    async function handleExport(format: 'json' | 'csv' = 'csv') {
        if (!project || !analytics) return;

        try {
            await exportReport(project, analytics, { format });
        } catch (err) {
            console.error("Error exporting report:", err);
            alert("Failed to export report. Please try again.");
        }
    }

    $: {
        project = $project_detail;
        if (project) {
            loadAnalytics();
        }
    }

    onMount(() => {
        if (project) {
            loadAnalytics();
        }
    });
</script>

{#if !project}
    <div class="empty-state">
        <p>No project selected. Please select a project to view analytics.</p>
    </div>
{:else if loading}
    <div class="loading-state">
        <RefreshCw class="spinner" size={32} />
        <p>Loading analytics data...</p>
    </div>
{:else if error}
    <div class="error-state">
        <p class="error-message">{error}</p>
        <Button on:click={loadAnalytics}>
            <RefreshCw size={16} />
            Retry
        </Button>
    </div>
{:else if analytics}
    <div class="analytics-dashboard">
        <div class="dashboard-header">
            <div>
                <h1>Analytics Dashboard</h1>
                <p class="project-title">{project.content.title}</p>
            </div>
            <div class="header-actions">
                <Button variant="outline" on:click={loadAnalytics}>
                    <RefreshCw size={16} />
                    Refresh
                </Button>
                <Button variant="outline" on:click={() => handleExport('csv')}>
                    <Download size={16} />
                    Export CSV
                </Button>
                <Button variant="outline" on:click={() => handleExport('json')}>
                    <Download size={16} />
                    Export JSON
                </Button>
            </div>
        </div>

        <!-- Key Metrics Cards -->
        <div class="metrics-grid">
            <Card>
                <CardHeader>
                    <CardTitle>Total Raised</CardTitle>
                    <CardDescription>Current funding amount</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="metric-value">
                        <DollarSign size={24} />
                        <span>{keyMetrics.totalRaised.toLocaleString()}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contributors</CardTitle>
                    <CardDescription>Total number of contributors</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="metric-value">
                        <Users size={24} />
                        <span>{keyMetrics.totalContributors}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Average Contribution</CardTitle>
                    <CardDescription>Mean contribution amount</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="metric-value">
                        <TrendingUp size={24} />
                        <span>{keyMetrics.averageContribution.toFixed(2)}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Funding Progress</CardTitle>
                    <CardDescription>Percentage of goal reached</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="metric-value">
                        <Target size={24} />
                        <span>{keyMetrics.fundingProgress.toFixed(1)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div 
                            class="progress-fill" 
                            style="width: {Math.min(100, keyMetrics.fundingProgress)}%"
                        ></div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
            <div class="chart-card">
                <FundingProgressChart 
                    data={analytics.fundingHistory} 
                    width={550} 
                    height={280}
                />
            </div>

            <div class="chart-card">
                <ContributionChart 
                    data={analytics.contributionHistory} 
                    width={550} 
                    height={280}
                />
            </div>

            <div class="chart-card full-width">
                <ContributorBarChart 
                    contributors={analytics.contributors} 
                    width={700} 
                    height={280}
                />
            </div>
        </div>

        <!-- Contributor Table -->
        {#if analytics.contributors.length > 0}
            <Card class="contributors-table-card">
                <CardHeader>
                    <CardTitle>Contributors</CardTitle>
                    <CardDescription>Detailed contributor information</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="table-container">
                        <table class="contributors-table">
                            <thead>
                                <tr>
                                    <th>Address</th>
                                    <th>Total Contribution</th>
                                    <th>Contributions</th>
                                    <th>First Contribution</th>
                                    <th>Last Contribution</th>
                                    <th>Tokens Received</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each analytics.contributors
                                    .sort((a, b) => b.contributionAmount - a.contributionAmount)
                                    .slice(0, 20) as contributor}
                                    <tr>
                                        <td class="address-cell">
                                            <code>{contributor.address.slice(0, 20)}...</code>
                                        </td>
                                        <td>{contributor.contributionAmount.toFixed(2)}</td>
                                        <td>{contributor.contributionCount}</td>
                                        <td>{new Date(contributor.firstContribution).toLocaleDateString()}</td>
                                        <td>{new Date(contributor.lastContribution).toLocaleDateString()}</td>
                                        <td>{contributor.totalTokensReceived.toFixed(2)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        {/if}
    </div>
{/if}

<style>
    .analytics-dashboard {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem;
    }

    .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2rem;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .dashboard-header h1 {
        margin: 0 0 0.5rem 0;
        font-size: 2rem;
        font-weight: 700;
    }

    .project-title {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 1rem;
    }

    .header-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    .metric-value {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 2rem;
        font-weight: 700;
    }

    .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--muted);
        border-radius: 4px;
        margin-top: 0.5rem;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #10b981);
        transition: width 0.3s ease;
    }

    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    .chart-card {
        min-width: 0;
    }

    .chart-card.full-width {
        grid-column: 1 / -1;
    }

    .contributors-table-card {
        margin-top: 2rem;
    }

    .table-container {
        overflow-x: auto;
    }

    .contributors-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
    }

    .contributors-table thead {
        background: var(--muted);
    }

    .contributors-table th {
        padding: 0.75rem;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid var(--border);
    }

    .contributors-table td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border);
    }

    .contributors-table tbody tr:hover {
        background: var(--muted);
    }

    .address-cell code {
        font-family: monospace;
        font-size: 0.8rem;
        background: var(--muted);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }

    .empty-state,
    .loading-state,
    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        text-align: center;
        padding: 2rem;
    }

    .spinner {
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .error-message {
        color: var(--destructive);
        margin-bottom: 1rem;
    }

    @media (max-width: 768px) {
        .analytics-dashboard {
            padding: 1rem;
        }

        .charts-grid {
            grid-template-columns: 1fr;
        }

        .chart-card {
            width: 100%;
        }

        .header-actions {
            width: 100%;
        }

        .header-actions button {
            flex: 1;
        }
    }
</style>

