<script lang="ts">
    import type { PlatformMetrics } from "$lib/analytics/metrics";
    import { BarChart3, TrendingUp, CheckCircle, XCircle } from "lucide-svelte";
    
    export let metrics: PlatformMetrics;
    
    function formatNumber(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
        }
        return value.toFixed(0);
    }
</script>

<div class="platform-overview">
    <div class="overview-header">
        <h2 class="overview-title">
            <BarChart3 size={24} />
            Platform Overview
        </h2>
    </div>
    
    <div class="metrics-grid">
        <div class="metric-card primary">
            <div class="metric-icon">
                <BarChart3 size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{metrics.total_projects}</span>
                <span class="metric-label">Total Projects</span>
                <div class="metric-breakdown">
                    <span class="breakdown-item active">
                        {metrics.active_projects} Active
                    </span>
                    <span class="breakdown-item">
                        {metrics.completed_projects} Completed
                    </span>
                </div>
            </div>
        </div>
        
        <div class="metric-card success">
            <div class="metric-icon">
                <TrendingUp size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{formatNumber(metrics.total_raised)}</span>
                <span class="metric-label">Total Funds Raised</span>
                <div class="metric-breakdown">
                    <span class="breakdown-item">
                        Across all projects
                    </span>
                </div>
            </div>
        </div>
        
        <div class="metric-card info">
            <div class="metric-icon">
                <CheckCircle size={32} />
            </div>
            <div class="metric-content">
                <span class="metric-value">{metrics.average_project_success_rate.toFixed(1)}%</span>
                <span class="metric-label">Success Rate</span>
                <div class="metric-breakdown">
                    <span class="breakdown-item success-icon">
                        <CheckCircle size={14} />
                        {metrics.completed_projects - metrics.failed_projects} Successful
                    </span>
                    <span class="breakdown-item failed-icon">
                        <XCircle size={14} />
                        {metrics.failed_projects} Failed
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .platform-overview {
        background: white;
        border-radius: 0.75rem;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    :global(.dark) .platform-overview {
        background: #1f2937;
    }
    
    .overview-header {
        margin-bottom: 1.5rem;
    }
    
    .overview-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.5rem;
        font-weight: 700;
        color: #111827;
        margin: 0;
    }
    
    :global(.dark) .overview-title {
        color: #f9fafb;
    }
    
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
    }
    
    .metric-card {
        display: flex;
        gap: 1rem;
        padding: 1.5rem;
        border-radius: 0.5rem;
        color: white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s;
    }
    
    .metric-card:hover {
        transform: translateY(-2px);
    }
    
    .metric-card.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .metric-card.success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    
    .metric-card.info {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
    
    .metric-icon {
        flex-shrink: 0;
        opacity: 0.9;
    }
    
    .metric-content {
        display: flex;
        flex-direction: column;
        flex: 1;
    }
    
    .metric-value {
        font-size: 2rem;
        font-weight: 700;
        line-height: 1;
        margin-bottom: 0.25rem;
    }
    
    .metric-label {
        font-size: 0.875rem;
        opacity: 0.9;
        font-weight: 500;
        margin-bottom: 0.75rem;
    }
    
    .metric-breakdown {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.75rem;
        opacity: 0.85;
    }
    
    .breakdown-item {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    
    .breakdown-item.active {
        font-weight: 600;
    }
    
    .breakdown-item.success-icon,
    .breakdown-item.failed-icon {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
    }
</style>
