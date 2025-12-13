<script lang="ts">
    import type { ContributorMetrics } from "$lib/analytics/metrics";
    import { Users, TrendingUp, RefreshCw, Award } from "lucide-svelte";
    
    export let metrics: ContributorMetrics;
    
    function formatNumber(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
        }
        return value.toFixed(0);
    }
    
    function formatCurrency(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
        }
        return value.toFixed(2);
    }
    
    $: retentionRate = metrics.total_contributions > 0 
        ? ((metrics.active_contributors / metrics.total_contributions) * 100).toFixed(1)
        : "0";
    
    $: refundPercentage = metrics.total_contributions > 0 
        ? ((metrics.refund_count / metrics.total_contributions) * 100).toFixed(1)
        : "0";
</script>

<div class="contributor-dashboard">
    <div class="dashboard-header">
        <h2 class="dashboard-title">
            <Users class="title-icon" size={28} />
            Contributor Analysis
        </h2>
        <p class="dashboard-subtitle">Insights into contributor behavior and engagement</p>
    </div>
    
    <div class="metrics-grid">
        <!-- Total Contributors Card -->
        <div class="metric-card primary">
            <div class="metric-icon">
                <Users size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{formatNumber(metrics.total_unique_contributors)}</span>
                <span class="metric-label">Total Contributors</span>
            </div>
        </div>
        
        <!-- Active Contributors Card -->
        <div class="metric-card success">
            <div class="metric-icon">
                <TrendingUp size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{formatNumber(metrics.active_contributors)}</span>
                <span class="metric-label">Active Contributors</span>
                <span class="metric-sublabel">{retentionRate}% retention</span>
            </div>
        </div>
        
        <!-- Average Contribution Card -->
        <div class="metric-card info">
            <div class="metric-icon">
                <Award size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{formatCurrency(metrics.average_contribution_size)}</span>
                <span class="metric-label">Avg. Contribution</span>
            </div>
        </div>
        
        <!-- Refunds Card -->
        <div class="metric-card warning">
            <div class="metric-icon">
                <RefreshCw size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{formatNumber(metrics.refund_count)}</span>
                <span class="metric-label">Total Refunds</span>
                <span class="metric-sublabel">{refundPercentage}% of contributions</span>
            </div>
        </div>
    </div>
    
    <div class="details-section">
        <h3 class="section-title">Contribution Statistics</h3>
        
        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-header">
                    <span class="stat-title">Total Contributions</span>
                </div>
                <span class="stat-main-value">{formatNumber(metrics.total_contributions)}</span>
                <div class="stat-detail">
                    <span>Active: {formatNumber(metrics.active_contributors)}</span>
                    <span>Refunded: {formatNumber(metrics.refund_count)}</span>
                </div>
            </div>
            
            <div class="stat-box">
                <div class="stat-header">
                    <span class="stat-title">Contribution Range</span>
                </div>
                <div class="range-display">
                    <div class="range-item">
                        <span class="range-label">Smallest</span>
                        <span class="range-value">{formatCurrency(metrics.smallest_contribution)}</span>
                    </div>
                    <div class="range-divider">→</div>
                    <div class="range-item">
                        <span class="range-label">Largest</span>
                        <span class="range-value">{formatCurrency(metrics.largest_contribution)}</span>
                    </div>
                </div>
            </div>
            
            <div class="stat-box">
                <div class="stat-header">
                    <span class="stat-title">Engagement Quality</span>
                </div>
                <div class="engagement-meter">
                    <div class="meter-bar">
                        <div 
                            class="meter-fill" 
                            style="width: {retentionRate}%"
                            class:high={Number(retentionRate) >= 70}
                            class:medium={Number(retentionRate) >= 40 && Number(retentionRate) < 70}
                            class:low={Number(retentionRate) < 40}
                        ></div>
                    </div>
                    <span class="meter-label">Retention Rate: {retentionRate}%</span>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .contributor-dashboard {
        background: white;
        border-radius: 0.75rem;
        padding: 2rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
    }
    
    :global(.dark) .contributor-dashboard {
        background: #1f2937;
    }
    
    .dashboard-header {
        margin-bottom: 2rem;
    }
    
    .dashboard-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.875rem;
        font-weight: 700;
        color: #111827;
        margin: 0 0 0.5rem 0;
    }
    
    :global(.dark) .dashboard-title {
        color: #f9fafb;
    }
    
    .dashboard-title :global(.title-icon) {
        color: #4f46e5;
    }
    
    .dashboard-subtitle {
        color: #6b7280;
        font-size: 1rem;
        margin: 0;
    }
    
    :global(.dark) .dashboard-subtitle {
        color: #9ca3af;
    }
    
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }
    
    .metric-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .metric-card.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    
    .metric-card.success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
    }
    
    .metric-card.info {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
    }
    
    .metric-card.warning {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
    }
    
    .metric-icon {
        flex-shrink: 0;
        opacity: 0.9;
    }
    
    .metric-content {
        display: flex;
        flex-direction: column;
    }
    
    .metric-value {
        font-size: 1.875rem;
        font-weight: 700;
        line-height: 1;
        margin-bottom: 0.25rem;
    }
    
    .metric-label {
        font-size: 0.875rem;
        opacity: 0.9;
        font-weight: 500;
    }
    
    .metric-sublabel {
        font-size: 0.75rem;
        opacity: 0.8;
        margin-top: 0.25rem;
    }
    
    .details-section {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 2px solid #e5e7eb;
    }
    
    :global(.dark) .details-section {
        border-top-color: #374151;
    }
    
    .section-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #111827;
        margin: 0 0 1.5rem 0;
    }
    
    :global(.dark) .section-title {
        color: #f9fafb;
    }
    
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
    }
    
    .stat-box {
        background: #f9fafb;
        padding: 1.5rem;
        border-radius: 0.5rem;
        border: 1px solid #e5e7eb;
    }
    
    :global(.dark) .stat-box {
        background: #111827;
        border-color: #374151;
    }
    
    .stat-header {
        margin-bottom: 1rem;
    }
    
    .stat-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    :global(.dark) .stat-title {
        color: #9ca3af;
    }
    
    .stat-main-value {
        font-size: 2rem;
        font-weight: 700;
        color: #111827;
        display: block;
        margin-bottom: 0.75rem;
    }
    
    :global(.dark) .stat-main-value {
        color: #f9fafb;
    }
    
    .stat-detail {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        color: #6b7280;
    }
    
    :global(.dark) .stat-detail {
        color: #9ca3af;
    }
    
    .range-display {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    
    .range-item {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    
    .range-label {
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    :global(.dark) .range-label {
        color: #9ca3af;
    }
    
    .range-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #111827;
    }
    
    :global(.dark) .range-value {
        color: #f9fafb;
    }
    
    .range-divider {
        font-size: 1.5rem;
        color: #9ca3af;
        margin: 0 1rem;
    }
    
    .engagement-meter {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .meter-bar {
        width: 100%;
        height: 1.5rem;
        background: #e5e7eb;
        border-radius: 9999px;
        overflow: hidden;
    }
    
    :global(.dark) .meter-bar {
        background: #374151;
    }
    
    .meter-fill {
        height: 100%;
        transition: width 0.5s ease;
        border-radius: 9999px;
    }
    
    .meter-fill.high {
        background: linear-gradient(90deg, #10b981, #059669);
    }
    
    .meter-fill.medium {
        background: linear-gradient(90deg, #f59e0b, #d97706);
    }
    
    .meter-fill.low {
        background: linear-gradient(90deg, #ef4444, #dc2626);
    }
    
    .meter-label {
        font-size: 0.875rem;
        color: #6b7280;
        font-weight: 500;
    }
    
    :global(.dark) .meter-label {
        color: #9ca3af;
    }
</style>
