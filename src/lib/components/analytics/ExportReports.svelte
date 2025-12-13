<script lang="ts">
    import type { Project } from "$lib/common/project";
    import type { ReportFormat } from "$lib/analytics/export";
    import { 
        generateProjectReport, 
        generatePlatformReport, 
        exportReport 
    } from "$lib/analytics/export";
    import { Download, FileText, FileJson, FileCode } from "lucide-svelte";
    import Button from "$lib/components/ui/button/button.svelte";
    
    export let projects: Project[];
    export let currentHeight: number;
    export let selectedProject: Project | null = null;
    
    let isExporting = false;
    let exportFormat: ReportFormat = "csv";
    
    const formats: { value: ReportFormat; label: string; icon: any }[] = [
        { value: "csv", label: "CSV (Excel)", icon: FileText },
        { value: "json", label: "JSON", icon: FileJson },
        { value: "html", label: "HTML Report", icon: FileCode }
    ];
    
    async function handleExport() {
        isExporting = true;
        
        try {
            if (selectedProject) {
                // Export single project report
                const reportData = generateProjectReport(selectedProject, currentHeight);
                exportReport(
                    reportData, 
                    exportFormat, 
                    `project-${selectedProject.project_id}-report`
                );
            } else {
                // Export platform-wide report
                const reportData = generatePlatformReport(projects, currentHeight);
                exportReport(reportData, exportFormat, "platform-analytics-report");
            }
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export report. Please try again.");
        } finally {
            isExporting = false;
        }
    }
</script>

<div class="export-reports">
    <div class="export-header">
        <div class="header-content">
            <h3 class="export-title">
                <Download size={24} />
                Export Reports
            </h3>
            <p class="export-description">
                {#if selectedProject}
                    Download analytics report for {selectedProject.content.title}
                {:else}
                    Download comprehensive platform analytics report
                {/if}
            </p>
        </div>
    </div>
    
    <div class="export-body">
        <div class="format-selection">
            <span class="selection-label">Select Format</span>
            <div class="format-options">
                {#each formats as format}
                    <button
                        class="format-option"
                        class:selected={exportFormat === format.value}
                        on:click={() => exportFormat = format.value}
                    >
                        <svelte:component this={format.icon} size={24} />
                        <span>{format.label}</span>
                    </button>
                {/each}
            </div>
        </div>
        
        <div class="export-info">
            <h4 class="info-title">Report Contents</h4>
            <ul class="info-list">
                {#if selectedProject}
                    <li>Project funding progress and metrics</li>
                    <li>Contributor statistics</li>
                    <li>Success likelihood analysis</li>
                    <li>Refund and exchange activity</li>
                {:else}
                    <li>Platform-wide metrics and KPIs</li>
                    <li>All project performance data</li>
                    <li>Comprehensive contributor analysis</li>
                    <li>Success rates and trends</li>
                {/if}
            </ul>
        </div>
        
        <div class="export-actions">
            <Button
                on:click={handleExport}
                disabled={isExporting}
                class="export-button"
            >
                {#if isExporting}
                    <span class="spinner"></span>
                    Exporting...
                {:else}
                    <Download size={18} />
                    Download Report
                {/if}
            </Button>
        </div>
    </div>
</div>

<style>
    .export-reports {
        background: white;
        border-radius: 0.75rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }
    
    :global(.dark) .export-reports {
        background: #1f2937;
    }
    
    .export-header {
        padding: 1.5rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    
    .header-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .export-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
    }
    
    .export-description {
        margin: 0;
        opacity: 0.95;
        font-size: 0.875rem;
    }
    
    .export-body {
        padding: 1.5rem;
    }
    
    .format-selection {
        margin-bottom: 1.5rem;
    }
    
    .selection-label {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    :global(.dark) .selection-label {
        color: #9ca3af;
    }
    
    .format-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
    }
    
    .format-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        background: #f9fafb;
        border: 2px solid #e5e7eb;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
        color: #6b7280;
    }
    
    :global(.dark) .format-option {
        background: #111827;
        border-color: #374151;
        color: #9ca3af;
    }
    
    .format-option:hover {
        border-color: #4f46e5;
        transform: translateY(-2px);
    }
    
    .format-option.selected {
        background: #eef2ff;
        border-color: #4f46e5;
        color: #4f46e5;
    }
    
    :global(.dark) .format-option.selected {
        background: #312e81;
        border-color: #6366f1;
        color: #a5b4fc;
    }
    
    .format-option span {
        font-size: 0.875rem;
        font-weight: 600;
    }
    
    .export-info {
        background: #f9fafb;
        padding: 1.5rem;
        border-radius: 0.5rem;
        margin-bottom: 1.5rem;
    }
    
    :global(.dark) .export-info {
        background: #111827;
    }
    
    .info-title {
        font-size: 1rem;
        font-weight: 600;
        color: #111827;
        margin: 0 0 1rem 0;
    }
    
    :global(.dark) .info-title {
        color: #f9fafb;
    }
    
    .info-list {
        margin: 0;
        padding-left: 1.5rem;
        color: #6b7280;
        font-size: 0.875rem;
    }
    
    :global(.dark) .info-list {
        color: #9ca3af;
    }
    
    .info-list li {
        margin-bottom: 0.5rem;
    }
    
    .export-actions {
        display: flex;
        justify-content: flex-end;
    }
    
    :global(.export-button) {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: white;
        font-weight: 600;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    :global(.export-button:hover) {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);
    }
    
    :global(.export-button:disabled) {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    
    .spinner {
        width: 18px;
        height: 18px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
