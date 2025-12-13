<script lang="ts">
    import type { ProjectMetrics } from "$lib/analytics/metrics";
    import Progress from "$lib/components/ui/progress/progress.svelte";
    
    export let metrics: ProjectMetrics;
    
    $: progressPercentage = Math.min(metrics.funding_progress, 100);
    $: isSuccessful = metrics.funding_progress >= 100;
    $: isWarning = metrics.funding_progress < 50 && metrics.is_active;
    $: isDanger = metrics.funding_progress < 25 && metrics.is_active;
    
    function formatCurrency(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
        }
        return value.toFixed(2);
    }
    
    function formatTime(milliseconds: number | null): string {
        if (milliseconds === null || milliseconds < 0) {
            return "Ended";
        }
        
        const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
        const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) {
            return `${days}d ${hours}h remaining`;
        } else if (hours > 0) {
            return `${hours}h remaining`;
        } else {
            const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
            return `${minutes}m remaining`;
        }
    }
    
    $: progressColor = isDanger ? "bg-red-500" : isWarning ? "bg-yellow-500" : isSuccessful ? "bg-green-500" : "bg-blue-500";
</script>

<div class="funding-progress-card">
    <div class="header">
        <h3 class="title">{metrics.title}</h3>
        <span class="status-badge" class:active={metrics.is_active} class:ended={!metrics.is_active}>
            {metrics.is_active ? "Active" : "Ended"}
        </span>
    </div>
    
    <div class="progress-section">
        <div class="progress-bar-container">
            <div class="progress-bar-bg">
                <div 
                    class="progress-bar-fill {progressColor}" 
                    style="width: {progressPercentage}%"
                ></div>
            </div>
        </div>
        
        <div class="progress-stats">
            <div class="stat">
                <span class="stat-value">{progressPercentage.toFixed(1)}%</span>
                <span class="stat-label">Funded</span>
            </div>
            <div class="stat">
                <span class="stat-value">{formatCurrency(metrics.total_raised)}</span>
                <span class="stat-label">Raised</span>
            </div>
            <div class="stat">
                <span class="stat-value">{formatCurrency(metrics.total_goal)}</span>
                <span class="stat-label">Goal</span>
            </div>
        </div>
    </div>
    
    <div class="details-grid">
        <div class="detail-item">
            <span class="detail-label">Contributors</span>
            <span class="detail-value">{metrics.contributor_count}</span>
        </div>
        
        <div class="detail-item">
            <span class="detail-label">Avg. Contribution</span>
            <span class="detail-value">{formatCurrency(metrics.average_contribution)}</span>
        </div>
        
        <div class="detail-item">
            <span class="detail-label">Refund Rate</span>
            <span class="detail-value">{metrics.refund_rate.toFixed(1)}%</span>
        </div>
        
        <div class="detail-item">
            <span class="detail-label">Time</span>
            <span class="detail-value">{formatTime(metrics.time_remaining)}</span>
        </div>
    </div>
    
    {#if metrics.is_active}
        <div class="success-indicator">
            <div class="success-bar">
                <div 
                    class="success-fill" 
                    style="width: {metrics.success_likelihood}%"
                    class:high={metrics.success_likelihood >= 70}
                    class:medium={metrics.success_likelihood >= 40 && metrics.success_likelihood < 70}
                    class:low={metrics.success_likelihood < 40}
                ></div>
            </div>
            <span class="success-label">
                Success Likelihood: {metrics.success_likelihood.toFixed(0)}%
            </span>
        </div>
    {/if}
</div>

<style>
    .funding-progress-card {
        background: white;
        border-radius: 0.5rem;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        margin-bottom: 1rem;
    }
    
    :global(.dark) .funding-progress-card {
        background: #1f2937;
    }
    
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }
    
    .title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #111827;
        margin: 0;
    }
    
    :global(.dark) .title {
        color: #f9fafb;
    }
    
    .status-badge {
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .status-badge.active {
        background: #d1fae5;
        color: #065f46;
    }
    
    .status-badge.ended {
        background: #fee2e2;
        color: #991b1b;
    }
    
    :global(.dark) .status-badge.active {
        background: #064e3b;
        color: #d1fae5;
    }
    
    :global(.dark) .status-badge.ended {
        background: #7f1d1d;
        color: #fecaca;
    }
    
    .progress-section {
        margin-bottom: 1.5rem;
    }
    
    .progress-bar-container {
        margin-bottom: 1rem;
    }
    
    .progress-bar-bg {
        width: 100%;
        height: 1.5rem;
        background: #e5e7eb;
        border-radius: 9999px;
        overflow: hidden;
    }
    
    :global(.dark) .progress-bar-bg {
        background: #374151;
    }
    
    .progress-bar-fill {
        height: 100%;
        transition: width 0.5s ease;
        border-radius: 9999px;
    }
    
    .progress-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
    }
    
    .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.5rem;
    }
    
    .stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #111827;
    }
    
    :global(.dark) .stat-value {
        color: #f9fafb;
    }
    
    .stat-label {
        font-size: 0.875rem;
        color: #6b7280;
        margin-top: 0.25rem;
    }
    
    :global(.dark) .stat-label {
        color: #9ca3af;
    }
    
    .details-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        padding: 1rem;
        background: #f9fafb;
        border-radius: 0.375rem;
        margin-bottom: 1rem;
    }
    
    :global(.dark) .details-grid {
        background: #111827;
    }
    
    .detail-item {
        display: flex;
        flex-direction: column;
    }
    
    .detail-label {
        font-size: 0.875rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    :global(.dark) .detail-label {
        color: #9ca3af;
    }
    
    .detail-value {
        font-size: 1rem;
        font-weight: 600;
        color: #111827;
    }
    
    :global(.dark) .detail-value {
        color: #f9fafb;
    }
    
    .success-indicator {
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }
    
    :global(.dark) .success-indicator {
        border-top-color: #374151;
    }
    
    .success-bar {
        width: 100%;
        height: 0.5rem;
        background: #e5e7eb;
        border-radius: 9999px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }
    
    :global(.dark) .success-bar {
        background: #374151;
    }
    
    .success-fill {
        height: 100%;
        transition: width 0.5s ease;
        border-radius: 9999px;
    }
    
    .success-fill.high {
        background: #10b981;
    }
    
    .success-fill.medium {
        background: #f59e0b;
    }
    
    .success-fill.low {
        background: #ef4444;
    }
    
    .success-label {
        font-size: 0.875rem;
        color: #6b7280;
    }
    
    :global(.dark) .success-label {
        color: #9ca3af;
    }
</style>
