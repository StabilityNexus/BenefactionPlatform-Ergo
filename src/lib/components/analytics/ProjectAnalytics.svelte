<script lang="ts">
    import { onMount } from 'svelte';
    import { type Project } from '$lib/common/project';
    import { calculateProjectMetrics, type ProjectMetrics } from '$lib/analytics/metrics';
    import { BarChart3, Users, TrendingUp, Target, Clock, DollarSign, AlertCircle, CheckCircle } from 'lucide-svelte';
    
    export let project: Project;
    export let currentBlockHeight: number;
    
    let metrics: ProjectMetrics | null = null;
    let activeTab: 'overview' | 'details' = 'overview';
    
    $: if (project && currentBlockHeight) {
        metrics = calculateProjectMetrics(project, currentBlockHeight);
    }
    
    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
    
    function formatPercent(value: number): string {
        return `${value.toFixed(1)}%`;
    }
    
    function formatTime(blocks: number): string {
        const minutes = blocks * 2;
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        return `${days}d`;
    }
</script>

{#if metrics}
<div class="project-analytics">
    <div class="analytics-header">
        <div class="header-content">
            <BarChart3 size={28} />
            <div>
                <h2>Campaign Analytics</h2>
                <p>Real-time insights and performance metrics</p>
            </div>
        </div>
        <div class="tab-switcher">
            <button 
                class="tab-btn"
                class:active={activeTab === 'overview'}
                on:click={() => activeTab = 'overview'}
            >
                <BarChart3 size={16} />
                Overview
            </button>
            <button 
                class="tab-btn"
                class:active={activeTab === 'details'}
                on:click={() => activeTab = 'details'}
            >
                <Target size={16} />
                Details
            </button>
        </div>
    </div>

    {#if activeTab === 'overview'}
    <!-- Overview Tab -->
    <div class="analytics-content">
        <div class="metrics-grid">
            <!-- Funding Progress -->
            <div class="metric-card primary">
                <div class="metric-icon">
                    <DollarSign size={24} />
                </div>
                <div class="metric-info">
                    <div class="metric-label">Funding Progress</div>
                    <div class="metric-value">{formatPercent(metrics.funding_progress)}</div>
                    <div class="metric-subtext">
                        {formatCurrency(metrics.total_raised)} / {formatCurrency(metrics.total_goal)}
                    </div>
                </div>
            </div>

            <!-- Contributors -->
            <div class="metric-card">
                <div class="metric-icon">
                    <Users size={24} />
                </div>
                <div class="metric-info">
                    <div class="metric-label">Contributors</div>
                    <div class="metric-value">{metrics.contributor_count}</div>
                </div>
            </div>

            <!-- Refund Rate -->
            <div class="metric-card {metrics.refund_rate > 20 ? 'warning' : ''}">
                <div class="metric-icon">
                    <AlertCircle size={24} />
                </div>
                <div class="metric-info">
                    <div class="metric-label">Refund Rate</div>
                    <div class="metric-value">{formatPercent(metrics.refund_rate)}</div>
                </div>
            </div>

            <!-- Success Likelihood -->
            <div class="metric-card {metrics.success_likelihood > 70 ? 'success' : metrics.success_likelihood > 40 ? 'warning' : 'danger'}">
                <div class="metric-icon">
                    {#if metrics.success_likelihood > 70}
                        <CheckCircle size={24} />
                    {:else}
                        <AlertCircle size={24} />
                    {/if}
                </div>
                <div class="metric-info">
                    <div class="metric-label">Success Likelihood</div>
                    <div class="metric-value">{formatPercent(metrics.success_likelihood)}</div>
                </div>
            </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-section">
            <div class="progress-header">
                <span>Campaign Progress</span>
                <span class="progress-percent">{formatPercent(metrics.funding_progress)}</span>
            </div>
            <div class="progress-bar-container">
                <div 
                    class="progress-bar-fill"
                    style="width: {Math.min(metrics.funding_progress, 100)}%"
                ></div>
            </div>
            <div class="progress-labels">
                <span>Start</span>
                <span class="goal-label">Goal: {formatCurrency(metrics.total_goal)}</span>
            </div>
        </div>
    </div>
    {:else}
    <!-- Details Tab -->
    <div class="analytics-content">
        <div class="details-grid">
            <div class="detail-row">
                <span class="detail-label">Project ID</span>
                <span class="detail-value mono">{metrics.project_id.slice(0, 12)}...</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Project Name</span>
                <span class="detail-value">{metrics.title}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Goal Amount</span>
                <span class="detail-value">{formatCurrency(metrics.total_goal)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Current Amount</span>
                <span class="detail-value">{formatCurrency(metrics.total_raised)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Remaining</span>
                <span class="detail-value">{formatCurrency(metrics.total_goal - metrics.total_raised)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Contributors</span>
                <span class="detail-value">{metrics.contributor_count}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Average Contribution</span>
                <span class="detail-value">
                    {formatCurrency(metrics.average_contribution)}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Refund Rate</span>
                <span class="detail-value">{formatPercent(metrics.refund_rate)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Time Remaining</span>
                <span class="detail-value">
                    {metrics.time_remaining && metrics.time_remaining > 0 ? formatTime(Math.floor(metrics.time_remaining / (2 * 60 * 1000))) : 'Ended'}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-value status">
                    {#if metrics.is_active}
                        <span class="badge active">Active</span>
                    {:else}
                        <span class="badge ended">Ended</span>
                    {/if}
                </span>
            </div>
        </div>
    </div>
    {/if}
</div>
{/if}

<style>
    .project-analytics {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        overflow: hidden;
        margin: 30px 0;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .analytics-header {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 24px 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
    }

    .header-content {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .header-content h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .header-content p {
        margin: 4px 0 0 0;
        font-size: 13px;
        color: var(--muted-foreground);
    }

    .tab-switcher {
        display: flex;
        gap: 8px;
        background: rgba(0, 0, 0, 0.2);
        padding: 4px;
        border-radius: 8px;
    }

    .tab-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 20px;
        background: transparent;
        border: none;
        color: var(--muted-foreground);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        border-radius: 6px;
    }

    .tab-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--foreground);
    }

    .tab-btn.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .analytics-content {
        padding: 32px;
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 32px;
    }

    .metric-card {
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 24px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .metric-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--border);
        opacity: 0;
        transition: opacity 0.3s;
    }

    .metric-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .metric-card:hover::before {
        opacity: 1;
    }

    .metric-card.primary {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
        border-color: rgba(102, 126, 234, 0.3);
    }

    .metric-card.primary::before {
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        opacity: 1;
    }

    .metric-card.success {
        background: linear-gradient(135deg, rgba(17, 153, 142, 0.2) 0%, rgba(56, 239, 125, 0.2) 100%);
        border-color: rgba(56, 239, 125, 0.3);
    }

    .metric-card.success::before {
        background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%);
        opacity: 1;
    }

    .metric-card.warning {
        background: linear-gradient(135deg, rgba(240, 147, 251, 0.2) 0%, rgba(245, 87, 108, 0.2) 100%);
        border-color: rgba(245, 87, 108, 0.3);
    }

    .metric-card.warning::before {
        background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
        opacity: 1;
    }

    .metric-card.danger {
        background: linear-gradient(135deg, rgba(250, 112, 154, 0.2) 0%, rgba(254, 225, 64, 0.2) 100%);
        border-color: rgba(254, 225, 64, 0.3);
    }

    .metric-card.danger::before {
        background: linear-gradient(90deg, #fa709a 0%, #fee140 100%);
        opacity: 1;
    }

    .metric-icon {
        flex-shrink: 0;
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
    }

    .metric-card.primary .metric-icon {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }

    .metric-card.success .metric-icon {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(56, 239, 125, 0.3);
    }

    .metric-card.warning .metric-icon {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);
    }

    .metric-card.danger .metric-icon {
        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(254, 225, 64, 0.3);
    }

    .metric-card:not(.primary):not(.success):not(.warning):not(.danger) .metric-icon {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
        color: #667eea;
    }

    .metric-info {
        flex: 1;
        min-width: 0;
    }

    .metric-label {
        font-size: 13px;
        color: var(--muted-foreground);
        font-weight: 500;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .metric-value {
        font-size: 32px;
        font-weight: 800;
        line-height: 1;
        color: var(--foreground);
    }

    .metric-subtext {
        font-size: 12px;
        color: var(--muted-foreground);
        margin-top: 6px;
        font-weight: 500;
    }

    .progress-section {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 28px;
        position: relative;
        overflow: hidden;
    }

    .progress-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    }

    .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        font-size: 15px;
        font-weight: 600;
    }

    .progress-percent {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-weight: 800;
        font-size: 18px;
    }

    .progress-bar-container {
        height: 16px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 12px;
        position: relative;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 12px rgba(102, 126, 234, 0.5);
        position: relative;
    }

    .progress-bar-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        animation: shimmer 2s infinite;
    }

    @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }

    .progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--muted-foreground);
        font-weight: 500;
    }

    .goal-label {
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 20px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        transition: all 0.3s;
    }

    .detail-row:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(102, 126, 234, 0.3);
        transform: translateX(4px);
    }

    .detail-label {
        font-size: 13px;
        color: var(--muted-foreground);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .detail-value {
        font-size: 15px;
        font-weight: 700;
        color: var(--foreground);
    }

    .detail-value.mono {
        font-family: 'Courier New', monospace;
        font-size: 13px;
        background: rgba(0, 0, 0, 0.3);
        padding: 4px 8px;
        border-radius: 4px;
    }

    .detail-value.status {
        display: flex;
        gap: 8px;
    }

    .badge {
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .badge.active {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        color: white;
    }

    .badge.ended {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
    }

    @media (max-width: 1024px) {
        .analytics-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .tab-switcher {
            width: 100%;
        }

        .tab-btn {
            flex: 1;
        }
    }

    @media (max-width: 768px) {
        .metrics-grid {
            grid-template-columns: 1fr;
        }

        .details-grid {
            grid-template-columns: 1fr;
        }

        .analytics-content {
            padding: 20px;
        }

        .analytics-header {
            padding: 20px;
        }

        .header-content h2 {
            font-size: 20px;
        }

        .metric-value {
            font-size: 28px;
        }
    }
</style>
