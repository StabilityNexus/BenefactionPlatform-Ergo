<script lang="ts">
    import { onMount } from "svelte";
    import { type Project } from "$lib/common/project";
    import { AnalyticsService, type ProjectMetrics, type PlatformAnalytics } from "$lib/analytics/analytics-service";
    import PieChart from "$lib/components/charts/PieChart.svelte";
    import LineChart from "$lib/components/charts/LineChart.svelte";
    import BarChart from "$lib/components/charts/BarChart.svelte";
    import { Button } from "$lib/components/ui/button";
    import { Card } from "$lib/components/ui/card";
    
    export let projects: Project[] = [];
    export let currentHeight: number | undefined = undefined;
    
    let platformAnalytics: PlatformAnalytics | null = null;
    let selectedProject: Project | null = null;
    let selectedProjectMetrics: ProjectMetrics | null = null;
    let timeSeriesData: any[] = [];
    let viewMode: "platform" | "project" = "platform";
    
    // Calculate analytics on mount and when projects change
    $: if (projects.length > 0) {
        platformAnalytics = AnalyticsService.calculatePlatformAnalytics(projects, currentHeight);
    }
    
    // Update selected project metrics
    $: if (selectedProject) {
        selectedProjectMetrics = AnalyticsService.calculateProjectMetrics(selectedProject, currentHeight);
        timeSeriesData = AnalyticsService.generateTimeSeriesData(selectedProject.project_id);
        
        // Store current snapshot
        if (selectedProjectMetrics) {
            AnalyticsService.storeAnalyticsSnapshot(selectedProject.project_id, selectedProjectMetrics);
        }
    }
    
    function selectProject(project: Project) {
        selectedProject = project;
        viewMode = "project";
    }
    
    function backToPlatform() {
        viewMode = "platform";
        selectedProject = null;
    }
    
    function exportPlatformData() {
        if (!platformAnalytics) return;
        
        const data = {
            timestamp: new Date().toISOString(),
            analytics: platformAnalytics,
            projects: projects.map(p => AnalyticsService.calculateProjectMetrics(p, currentHeight))
        };
        
        AnalyticsService.exportAsJSON(data, `platform-analytics-${Date.now()}.json`);
    }
    
    function exportProjectData() {
        if (!selectedProject || !selectedProjectMetrics) return;
        
        const data = {
            timestamp: new Date().toISOString(),
            project: selectedProjectMetrics,
            timeSeries: timeSeriesData
        };
        
        AnalyticsService.exportAsJSON(data, `project-analytics-${selectedProject.project_id}-${Date.now()}.json`);
    }
    
    function exportTimeSeriesCSV() {
        if (timeSeriesData.length === 0) return;
        
        const csvData = timeSeriesData.map(point => ({
            timestamp: new Date(point.timestamp).toISOString(),
            blockHeight: point.blockHeight || "",
            totalFunding: point.totalFunding,
            contributionCount: point.contributionCount,
            refundCount: point.refundCount,
            netFunding: point.netFunding
        }));
        
        AnalyticsService.exportAsCSV(csvData, `timeseries-${selectedProject?.project_id}-${Date.now()}.csv`);
    }
    
    // Format currency
    function formatCurrency(value: number, tokenName: string = "ERG"): string {
        return `${value.toFixed(4)} ${tokenName}`;
    }
    
    // Format percentage
    function formatPercent(value: number): string {
        return `${value.toFixed(2)}%`;
    }
</script>

<div class="analytics-container">
    <div class="analytics-header">
        <h1 class="analytics-title">📊 Project Analytics</h1>
        
        {#if viewMode === "project" && selectedProject}
            <Button on:click={backToPlatform} variant="outline">
                ← Back to Platform Overview
            </Button>
        {/if}
    </div>
    
    {#if viewMode === "platform" && platformAnalytics}
        <div class="platform-analytics">
            <div class="section-header">
                <h2>Platform Overview</h2>
                <Button on:click={exportPlatformData} variant="outline" size="sm">
                    📥 Export Data
                </Button>
            </div>
            
            <!-- Key Metrics Cards -->
            <div class="metrics-grid">
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Total Projects</div>
                        <div class="metric-value">{platformAnalytics.totalProjects}</div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Active Projects</div>
                        <div class="metric-value">{platformAnalytics.activeProjects}</div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Success Rate</div>
                        <div class="metric-value">
                            {formatPercent(platformAnalytics.averageProjectSuccess)}
                        </div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Total Contributions</div>
                        <div class="metric-value">{platformAnalytics.totalContributions}</div>
                    </div>
                </Card>
            </div>
            
            <!-- Charts Section -->
            <div class="charts-grid">
                <Card class="chart-card">
                    <PieChart 
                        data={[
                            { label: "Active", value: platformAnalytics.projectsByStatus.active, color: "#3b82f6" },
                            { label: "Successful", value: platformAnalytics.projectsByStatus.successful, color: "#10b981" },
                            { label: "Failed", value: platformAnalytics.projectsByStatus.failed, color: "#ef4444" }
                        ]}
                        title="Projects by Status"
                        width={350}
                        height={350}
                    />
                </Card>
                
                <Card class="chart-card">
                    <BarChart
                        data={[
                            { label: "Active", value: platformAnalytics.projectsByStatus.active, color: "#3b82f6" },
                            { label: "Ended", value: platformAnalytics.projectsByStatus.ended, color: "#f59e0b" },
                            { label: "Successful", value: platformAnalytics.projectsByStatus.successful, color: "#10b981" },
                            { label: "Failed", value: platformAnalytics.projectsByStatus.failed, color: "#ef4444" }
                        ]}
                        title="Project Status Distribution"
                        yAxisLabel="Count"
                        width={500}
                        height={350}
                    />
                </Card>
            </div>
            
            <!-- Projects List -->
            <div class="projects-section">
                <h3>All Projects</h3>
                <div class="projects-list">
                    {#each projects as project}
                        {@const metrics = AnalyticsService.calculateProjectMetrics(project, currentHeight)}
                        <Card class="project-item" on:click={() => selectProject(project)}>
                            <div class="project-info">
                                <div class="project-name">{metrics.projectName}</div>
                                <div class="project-stats">
                                    <span class="stat">
                                        <strong>Funding:</strong> 
                                        {formatPercent(metrics.fundingPercentage)}
                                    </span>
                                    <span class="stat">
                                        <strong>Contributions:</strong> 
                                        {metrics.netContributions}
                                    </span>
                                    <span class={`status ${metrics.isActive ? 'active' : metrics.isSuccessful ? 'success' : 'failed'}`}>
                                        {metrics.isActive ? '🟢 Active' : metrics.isSuccessful ? '✅ Successful' : '❌ Failed'}
                                    </span>
                                </div>
                            </div>
                            <div class="project-action">→</div>
                        </Card>
                    {/each}
                </div>
            </div>
        </div>
    {:else if viewMode === "project" && selectedProject && selectedProjectMetrics}
        <div class="project-analytics">
            <div class="section-header">
                <h2>{selectedProjectMetrics.projectName}</h2>
                <div class="export-buttons">
                    <Button on:click={exportProjectData} variant="outline" size="sm">
                        📥 Export JSON
                    </Button>
                    {#if timeSeriesData.length > 0}
                        <Button on:click={exportTimeSeriesCSV} variant="outline" size="sm">
                            📊 Export CSV
                        </Button>
                    {/if}
                </div>
            </div>
            
            <!-- Project Status Badge -->
            <div class="status-badge {selectedProjectMetrics.isActive ? 'active' : selectedProjectMetrics.isSuccessful ? 'success' : 'failed'}">
                {selectedProjectMetrics.isActive ? '🟢 Active Campaign' : selectedProjectMetrics.isSuccessful ? '✅ Successfully Funded' : '❌ Failed to Reach Goal'}
            </div>
            
            <!-- Key Metrics Grid -->
            <div class="metrics-grid-detailed">
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Current Funding</div>
                        <div class="metric-value-large">
                            {formatCurrency(selectedProjectMetrics.currentFunding / 1e9, selectedProjectMetrics.baseTokenName)}
                        </div>
                        <div class="metric-subtitle">
                            {formatPercent(selectedProjectMetrics.fundingPercentage)} of target
                        </div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Target Funding</div>
                        <div class="metric-value-large">
                            {formatCurrency(selectedProjectMetrics.targetFunding / 1e9, selectedProjectMetrics.baseTokenName)}
                        </div>
                        <div class="metric-subtitle">
                            Min: {formatCurrency(selectedProjectMetrics.minimumFunding / 1e9, selectedProjectMetrics.baseTokenName)}
                        </div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Net Contributions</div>
                        <div class="metric-value-large">{selectedProjectMetrics.netContributions}</div>
                        <div class="metric-subtitle">
                            {selectedProjectMetrics.totalContributions} sold - {selectedProjectMetrics.totalRefunds} refunded
                        </div>
                    </div>
                </Card>
                
                <Card class="metric-card">
                    <div class="metric-content">
                        <div class="metric-label">Time Remaining</div>
                        <div class="metric-value-large">
                            {selectedProjectMetrics.daysRemaining !== null 
                                ? `${selectedProjectMetrics.daysRemaining} days`
                                : "Ended"}
                        </div>
                        {#if selectedProjectMetrics.blocksRemaining !== null}
                            <div class="metric-subtitle">
                                ~{selectedProjectMetrics.blocksRemaining} blocks
                            </div>
                        {/if}
                    </div>
                </Card>
            </div>
            
            <!-- Token Distribution -->
            <div class="charts-section">
                <Card class="chart-card-full">
                    <PieChart
                        data={[
                            { label: "Sold", value: selectedProjectMetrics.soldPFT, color: "#10b981" },
                            { label: "Unsold", value: selectedProjectMetrics.unsoldPFT, color: "#94a3b8" },
                            { label: "Exchanged", value: selectedProjectMetrics.exchangedPFT, color: "#3b82f6" }
                        ]}
                        title="Token Distribution"
                        width={400}
                        height={400}
                    />
                </Card>
                
                <!-- Time Series Chart -->
                {#if timeSeriesData.length > 1}
                    <Card class="chart-card-full">
                        <LineChart
                            data={timeSeriesData.map((point, index) => ({
                                label: `${index}`,
                                value: point.netFunding
                            }))}
                            title="Funding Progress Over Time"
                            xAxisLabel="Data Points"
                            yAxisLabel="Net Funding"
                            color="#3b82f6"
                            width={700}
                            height={400}
                        />
                    </Card>
                {:else}
                    <Card class="chart-card-full info-card">
                        <p>📈 Time-series data will appear here as the project progresses</p>
                        <p class="info-subtitle">Data is collected automatically each time you view this page</p>
                    </Card>
                {/if}
            </div>
            
            <!-- Detailed Metrics Table -->
            <Card class="details-table">
                <h3>Detailed Metrics</h3>
                <div class="table-grid">
                    <div class="table-row">
                        <div class="table-label">Exchange Rate</div>
                        <div class="table-value">{selectedProjectMetrics.exchangeRate} {selectedProjectMetrics.baseTokenName} per PFT</div>
                    </div>
                    <div class="table-row">
                        <div class="table-label">Total PFT Supply</div>
                        <div class="table-value">{selectedProjectMetrics.totalPFTSupply.toLocaleString()}</div>
                    </div>
                    <div class="table-row">
                        <div class="table-label">PFT Sold</div>
                        <div class="table-value">{selectedProjectMetrics.soldPFT.toLocaleString()}</div>
                    </div>
                    <div class="table-row">
                        <div class="table-label">PFT Unsold</div>
                        <div class="table-value">{selectedProjectMetrics.unsoldPFT.toLocaleString()}</div>
                    </div>
                    <div class="table-row">
                        <div class="table-label">PFT Exchanged</div>
                        <div class="table-value">{selectedProjectMetrics.exchangedPFT.toLocaleString()}</div>
                    </div>
                    <div class="table-row">
                        <div class="table-label">Deadline</div>
                        <div class="table-value">
                            {selectedProjectMetrics.isTimestampLimit 
                                ? new Date(selectedProjectMetrics.deadline).toLocaleString()
                                : `Block ${selectedProjectMetrics.deadline}`}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    {/if}
</div>

<style>
    .analytics-container {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
    }
    
    .analytics-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    
    .analytics-title {
        font-size: 2rem;
        font-weight: bold;
        margin: 0;
    }
    
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }
    
    .section-header h2 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
    }
    
    .export-buttons {
        display: flex;
        gap: 0.5rem;
    }
    
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .metrics-grid-detailed {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
    }
    
    :global(.metric-card) {
        padding: 1.5rem;
    }
    
    .metric-content {
        text-align: center;
    }
    
    .metric-label {
        font-size: 0.875rem;
        color: #64748b;
        margin-bottom: 0.5rem;
    }
    
    .metric-value {
        font-size: 2rem;
        font-weight: bold;
        color: #1e293b;
    }
    
    .metric-value-large {
        font-size: 1.75rem;
        font-weight: bold;
        color: #1e293b;
        margin: 0.5rem 0;
    }
    
    .metric-subtitle {
        font-size: 0.75rem;
        color: #94a3b8;
        margin-top: 0.25rem;
    }
    
    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 2rem;
        margin-bottom: 2rem;
    }
    
    .charts-section {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        margin-bottom: 2rem;
    }
    
    :global(.chart-card),
    :global(.chart-card-full) {
        padding: 1.5rem;
        display: flex;
        justify-content: center;
    }
    
    .info-card {
        text-align: center;
        padding: 3rem 2rem !important;
        color: #64748b;
    }
    
    .info-card p {
        margin: 0.5rem 0;
        font-size: 1rem;
    }
    
    .info-subtitle {
        font-size: 0.875rem !important;
    }
    
    .status-badge {
        display: inline-block;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        font-weight: 600;
        margin-bottom: 2rem;
        font-size: 1rem;
    }
    
    .status-badge.active {
        background-color: #dbeafe;
        color: #1e40af;
    }
    
    .status-badge.success {
        background-color: #d1fae5;
        color: #065f46;
    }
    
    .status-badge.failed {
        background-color: #fee2e2;
        color: #991b1b;
    }
    
    .projects-section {
        margin-top: 3rem;
    }
    
    .projects-section h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 1rem;
    }
    
    .projects-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    :global(.project-item) {
        padding: 1.5rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    :global(.project-item:hover) {
        transform: translateX(4px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .project-info {
        flex: 1;
    }
    
    .project-name {
        font-size: 1.125rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    
    .project-stats {
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
        font-size: 0.875rem;
    }
    
    .stat {
        color: #64748b;
    }
    
    .status {
        padding: 0.25rem 0.75rem;
        border-radius: 0.25rem;
        font-weight: 600;
    }
    
    .status.active {
        background-color: #dbeafe;
        color: #1e40af;
    }
    
    .status.success {
        background-color: #d1fae5;
        color: #065f46;
    }
    
    .status.failed {
        background-color: #fee2e2;
        color: #991b1b;
    }
    
    .project-action {
        font-size: 1.5rem;
        color: #94a3b8;
    }
    
    :global(.details-table) {
        padding: 2rem;
    }
    
    .details-table h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 1.5rem;
    }
    
    .table-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .table-row {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: 2rem;
        padding: 1rem;
        border-bottom: 1px solid #e2e8f0;
    }
    
    .table-row:last-child {
        border-bottom: none;
    }
    
    .table-label {
        font-weight: 600;
        color: #475569;
    }
    
    .table-value {
        color: #1e293b;
    }
    
    @media (max-width: 768px) {
        .analytics-container {
            padding: 1rem;
        }
        
        .analytics-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }
        
        .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }
        
        .charts-grid {
            grid-template-columns: 1fr;
        }
        
        .table-row {
            grid-template-columns: 1fr;
            gap: 0.5rem;
        }
    }
</style>
