<!-- Example: Adding Analytics to the Main Dashboard -->
<script lang="ts">
    import { onMount } from "svelte";
    import { projects as projectsStore } from "$lib/common/store";
    import type { Project } from "$lib/common/project";
    import { getPlatformMetrics, updateAnalyticsCache } from "$lib/analytics";
    import { PlatformOverview, FundingProgress } from "$lib/components/analytics";
    import { calculateProjectMetrics } from "$lib/analytics/metrics";
    
    let projects: Project[] = [];
    let blockHeight = 0;
    let showAnalytics = true;
    
    $: if ($projectsStore.data) {
        projects = Array.from($projectsStore.data.values());
    }
    
    onMount(async () => {
        if (projects.length > 0) {
            try {
                blockHeight = await projects[0].platform.get_current_height();
                updateAnalyticsCache(projects, blockHeight);
            } catch (error) {
                console.error("Failed to load analytics:", error);
            }
        }
    });
    
    $: platformMetrics = projects.length > 0 ? getPlatformMetrics(projects, blockHeight) : null;
    $: topProjects = projects
        .map(p => ({ project: p, metrics: calculateProjectMetrics(p, blockHeight) }))
        .sort((a, b) => b.metrics.funding_progress - a.metrics.funding_progress)
        .slice(0, 3);
</script>

<div class="dashboard">
    <h1>Platform Dashboard</h1>
    
    {#if showAnalytics && platformMetrics}
        <!-- Platform Overview Widget -->
        <PlatformOverview metrics={platformMetrics} />
        
        <!-- Top Performing Projects -->
        <div class="top-projects">
            <h2>Top Performing Projects</h2>
            {#each topProjects as { project, metrics }}
                <FundingProgress {metrics} />
            {/each}
        </div>
        
        <!-- Link to Full Analytics -->
        <div class="analytics-link">
            <a href="/analytics" class="btn-analytics">
                View Full Analytics Dashboard →
            </a>
        </div>
    {/if}
</div>

<style>
    .dashboard {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem;
    }
    
    h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 2rem;
        color: #111827;
    }
    
    :global(.dark) h1 {
        color: #f9fafb;
    }
    
    .top-projects {
        margin-top: 2rem;
    }
    
    .top-projects h2 {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 1rem;
        color: #111827;
    }
    
    :global(.dark) .top-projects h2 {
        color: #f9fafb;
    }
    
    .analytics-link {
        margin-top: 2rem;
        text-align: center;
    }
    
    .btn-analytics {
        display: inline-block;
        padding: 1rem 2rem;
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: white;
        font-weight: 600;
        border-radius: 0.5rem;
        text-decoration: none;
        transition: transform 0.2s;
    }
    
    .btn-analytics:hover {
        transform: translateY(-2px);
    }
</style>
