<script lang="ts">
    import type { Project } from "$lib/common/project";
    import type { TimeSeriesDataPoint } from "$lib/analytics/metrics";
    import { generateFundingTimeSeries, generateContributorTimeSeries } from "$lib/analytics/metrics";
    import Chart from "./Chart.svelte";
    import { TrendingUp, Users, Calendar } from "lucide-svelte";
    
    export let project: Project;
    export let dataPoints: number = 10;
    
    $: fundingTimeSeries = generateFundingTimeSeries(project, dataPoints);
    $: contributorTimeSeries = generateContributorTimeSeries(project, dataPoints);
    
    // Calculate trends
    $: fundingTrend = calculateTrend(fundingTimeSeries);
    $: contributorTrend = calculateTrend(contributorTimeSeries);
    
    function calculateTrend(data: TimeSeriesDataPoint[]): { direction: "up" | "down" | "stable", percentage: number } {
        if (data.length < 2) {
            return { direction: "stable", percentage: 0 };
        }
        
        const firstValue = data[0].value;
        const lastValue = data[data.length - 1].value;
        
        if (firstValue === 0) {
            return { direction: "up", percentage: 100 };
        }
        
        const change = ((lastValue - firstValue) / firstValue) * 100;
        
        if (Math.abs(change) < 5) {
            return { direction: "stable", percentage: change };
        }
        
        return {
            direction: change > 0 ? "up" : "down",
            percentage: Math.abs(change)
        };
    }
    
    function formatCurrency(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
        }
        return value.toFixed(2);
    }
    
    $: latestFunding = fundingTimeSeries[fundingTimeSeries.length - 1]?.value || 0;
    $: latestContributors = contributorTimeSeries[contributorTimeSeries.length - 1]?.value || 0;
</script>

<div class="time-series-analytics">
    <div class="analytics-header">
        <h2 class="analytics-title">
            <Calendar size={28} />
            Trend Analysis
        </h2>
        <p class="analytics-subtitle">Historical performance and projections for {project.content.title}</p>
    </div>
    
    <div class="charts-container">
        <!-- Funding Time Series -->
        <div class="chart-section">
            <div class="chart-header">
                <div class="chart-info">
                    <h3 class="chart-title">
                        <TrendingUp size={20} />
                        Funding Progress Over Time
                    </h3>
                    <div class="chart-stats">
                        <span class="current-value">Current: {formatCurrency(latestFunding)}</span>
                        <span 
                            class="trend-indicator" 
                            class:positive={fundingTrend.direction === "up"}
                            class:negative={fundingTrend.direction === "down"}
                            class:neutral={fundingTrend.direction === "stable"}
                        >
                            {#if fundingTrend.direction === "up"}
                                ↑ {fundingTrend.percentage.toFixed(1)}%
                            {:else if fundingTrend.direction === "down"}
                                ↓ {fundingTrend.percentage.toFixed(1)}%
                            {:else}
                                → Stable
                            {/if}
                        </span>
                    </div>
                </div>
            </div>
            
            <Chart 
                data={fundingTimeSeries}
                title=""
                height={300}
                color="#4f46e5"
                type="area"
            />
        </div>
        
        <!-- Contributor Time Series -->
        <div class="chart-section">
            <div class="chart-header">
                <div class="chart-info">
                    <h3 class="chart-title">
                        <Users size={20} />
                        Contributor Growth
                    </h3>
                    <div class="chart-stats">
                        <span class="current-value">Total: {latestContributors}</span>
                        <span 
                            class="trend-indicator" 
                            class:positive={contributorTrend.direction === "up"}
                            class:negative={contributorTrend.direction === "down"}
                            class:neutral={contributorTrend.direction === "stable"}
                        >
                            {#if contributorTrend.direction === "up"}
                                ↑ {contributorTrend.percentage.toFixed(1)}%
                            {:else if contributorTrend.direction === "down"}
                                ↓ {contributorTrend.percentage.toFixed(1)}%
                            {:else}
                                → Stable
                            {/if}
                        </span>
                    </div>
                </div>
            </div>
            
            <Chart 
                data={contributorTimeSeries}
                title=""
                height={300}
                color="#10b981"
                type="line"
            />
        </div>
    </div>
    
    <div class="insights-section">
        <h3 class="insights-title">Key Insights</h3>
        <div class="insights-grid">
            <div class="insight-card">
                <div class="insight-icon funding">
                    <TrendingUp size={24} />
                </div>
                <div class="insight-content">
                    <span class="insight-label">Funding Momentum</span>
                    <span class="insight-value">
                        {#if fundingTrend.direction === "up"}
                            Strong upward trend
                        {:else if fundingTrend.direction === "down"}
                            Declining trend
                        {:else}
                            Steady progress
                        {/if}
                    </span>
                    <span class="insight-detail">
                        {fundingTrend.percentage.toFixed(1)}% change in recent period
                    </span>
                </div>
            </div>
            
            <div class="insight-card">
                <div class="insight-icon contributors">
                    <Users size={24} />
                </div>
                <div class="insight-content">
                    <span class="insight-label">Community Growth</span>
                    <span class="insight-value">
                        {latestContributors} contributors
                    </span>
                    <span class="insight-detail">
                        {contributorTrend.direction === "up" ? "Growing community" : contributorTrend.direction === "down" ? "Declining engagement" : "Stable community"}
                    </span>
                </div>
            </div>
            
            <div class="insight-card">
                <div class="insight-icon average">
                    <TrendingUp size={24} />
                </div>
                <div class="insight-content">
                    <span class="insight-label">Avg. Contribution Size</span>
                    <span class="insight-value">
                        {formatCurrency(latestContributors > 0 ? latestFunding / latestContributors : 0)}
                    </span>
                    <span class="insight-detail">
                        Per contributor
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .time-series-analytics {
        background: white;
        border-radius: 0.75rem;
        padding: 2rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
    }
    
    :global(.dark) .time-series-analytics {
        background: #1f2937;
    }
    
    .analytics-header {
        margin-bottom: 2rem;
    }
    
    .analytics-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.875rem;
        font-weight: 700;
        color: #111827;
        margin: 0 0 0.5rem 0;
    }
    
    :global(.dark) .analytics-title {
        color: #f9fafb;
    }
    
    .analytics-subtitle {
        color: #6b7280;
        font-size: 1rem;
        margin: 0;
    }
    
    :global(.dark) .analytics-subtitle {
        color: #9ca3af;
    }
    
    .charts-container {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        margin-bottom: 2rem;
    }
    
    @media (min-width: 1024px) {
        .charts-container {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    
    .chart-section {
        display: flex;
        flex-direction: column;
    }
    
    .chart-header {
        margin-bottom: 1rem;
    }
    
    .chart-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .chart-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
        font-weight: 600;
        color: #111827;
        margin: 0;
    }
    
    :global(.dark) .chart-title {
        color: #f9fafb;
    }
    
    .chart-stats {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .current-value {
        font-size: 0.875rem;
        color: #6b7280;
        font-weight: 500;
    }
    
    :global(.dark) .current-value {
        color: #9ca3af;
    }
    
    .trend-indicator {
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 600;
    }
    
    .trend-indicator.positive {
        background: #d1fae5;
        color: #065f46;
    }
    
    .trend-indicator.negative {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .trend-indicator.neutral {
        background: #e5e7eb;
        color: #374151;
    }
    
    :global(.dark) .trend-indicator.positive {
        background: #064e3b;
        color: #d1fae5;
    }
    
    :global(.dark) .trend-indicator.negative {
        background: #7f1d1d;
        color: #fecaca;
    }
    
    :global(.dark) .trend-indicator.neutral {
        background: #374151;
        color: #e5e7eb;
    }
    
    .insights-section {
        padding-top: 2rem;
        border-top: 2px solid #e5e7eb;
    }
    
    :global(.dark) .insights-section {
        border-top-color: #374151;
    }
    
    .insights-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #111827;
        margin: 0 0 1.5rem 0;
    }
    
    :global(.dark) .insights-title {
        color: #f9fafb;
    }
    
    .insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
    }
    
    .insight-card {
        display: flex;
        gap: 1rem;
        padding: 1.5rem;
        background: #f9fafb;
        border-radius: 0.5rem;
        border: 1px solid #e5e7eb;
    }
    
    :global(.dark) .insight-card {
        background: #111827;
        border-color: #374151;
    }
    
    .insight-icon {
        width: 48px;
        height: 48px;
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: white;
    }
    
    .insight-icon.funding {
        background: linear-gradient(135deg, #4f46e5, #6366f1);
    }
    
    .insight-icon.contributors {
        background: linear-gradient(135deg, #10b981, #059669);
    }
    
    .insight-icon.average {
        background: linear-gradient(135deg, #f59e0b, #d97706);
    }
    
    .insight-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .insight-label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    :global(.dark) .insight-label {
        color: #9ca3af;
    }
    
    .insight-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: #111827;
    }
    
    :global(.dark) .insight-value {
        color: #f9fafb;
    }
    
    .insight-detail {
        font-size: 0.875rem;
        color: #6b7280;
    }
    
    :global(.dark) .insight-detail {
        color: #9ca3af;
    }
</style>
