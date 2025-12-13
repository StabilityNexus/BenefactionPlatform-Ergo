import type { Project } from "$lib/common/project";
import type { ProjectMetrics, ContributorMetrics, PlatformMetrics } from "./metrics";
import { calculateProjectMetrics, calculateContributorMetrics, calculatePlatformMetrics } from "./metrics";

export type ReportFormat = "csv" | "json" | "html";

interface ReportData {
    generated_at: string;
    platform_metrics?: PlatformMetrics;
    project_metrics?: ProjectMetrics[];
    contributor_metrics?: ContributorMetrics;
}

/**
 * Generate a comprehensive report for a single project
 */
export function generateProjectReport(project: Project, currentHeight: number): ReportData {
    const metrics = calculateProjectMetrics(project, currentHeight);
    
    return {
        generated_at: new Date().toISOString(),
        project_metrics: [metrics]
    };
}

/**
 * Generate a comprehensive report for all projects
 */
export function generatePlatformReport(projects: Project[], currentHeight: number): ReportData {
    const platformMetrics = calculatePlatformMetrics(projects, currentHeight);
    const contributorMetrics = calculateContributorMetrics(projects);
    const projectMetrics = projects.map(p => calculateProjectMetrics(p, currentHeight));
    
    return {
        generated_at: new Date().toISOString(),
        platform_metrics: platformMetrics,
        contributor_metrics: contributorMetrics,
        project_metrics: projectMetrics
    };
}

/**
 * Convert report data to CSV format
 */
export function exportToCSV(data: ReportData): string {
    let csv = "";
    
    // Platform metrics section
    if (data.platform_metrics) {
        csv += "Platform Metrics\n";
        csv += "Metric,Value\n";
        csv += `Total Projects,${data.platform_metrics.total_projects}\n`;
        csv += `Active Projects,${data.platform_metrics.active_projects}\n`;
        csv += `Completed Projects,${data.platform_metrics.completed_projects}\n`;
        csv += `Failed Projects,${data.platform_metrics.failed_projects}\n`;
        csv += `Total Raised,${data.platform_metrics.total_raised}\n`;
        csv += `Total Contributors,${data.platform_metrics.total_contributors}\n`;
        csv += `Average Success Rate,${data.platform_metrics.average_project_success_rate}%\n`;
        csv += `Average Funding Time,${data.platform_metrics.average_funding_time}ms\n`;
        csv += "\n";
    }
    
    // Contributor metrics section
    if (data.contributor_metrics) {
        csv += "Contributor Metrics\n";
        csv += "Metric,Value\n";
        csv += `Total Unique Contributors,${data.contributor_metrics.total_unique_contributors}\n`;
        csv += `Total Contributions,${data.contributor_metrics.total_contributions}\n`;
        csv += `Average Contribution Size,${data.contributor_metrics.average_contribution_size}\n`;
        csv += `Largest Contribution,${data.contributor_metrics.largest_contribution}\n`;
        csv += `Smallest Contribution,${data.contributor_metrics.smallest_contribution}\n`;
        csv += `Refund Count,${data.contributor_metrics.refund_count}\n`;
        csv += `Active Contributors,${data.contributor_metrics.active_contributors}\n`;
        csv += "\n";
    }
    
    // Project metrics section
    if (data.project_metrics && data.project_metrics.length > 0) {
        csv += "Project Metrics\n";
        csv += "Project ID,Title,Funding Progress (%),Total Raised,Total Goal,Contributors,Avg Contribution,Refund Rate (%),Exchange Activity,Time Remaining (ms),Is Active,Success Likelihood (%)\n";
        
        for (const pm of data.project_metrics) {
            csv += `"${pm.project_id}","${pm.title.replace(/"/g, '""')}",${pm.funding_progress},${pm.total_raised},${pm.total_goal},${pm.contributor_count},${pm.average_contribution},${pm.refund_rate},${pm.exchange_activity},${pm.time_remaining || "N/A"},${pm.is_active},${pm.success_likelihood}\n`;
        }
    }
    
    return csv;
}

/**
 * Convert report data to JSON format
 */
export function exportToJSON(data: ReportData): string {
    return JSON.stringify(data, null, 2);
}

/**
 * Convert report data to HTML format
 */
export function exportToHTML(data: ReportData): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Platform Analytics Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background: #f9fafb;
        }
        h1, h2, h3 {
            color: #111827;
        }
        h1 {
            border-bottom: 3px solid #4f46e5;
            padding-bottom: 0.5rem;
        }
        .header {
            background: white;
            padding: 2rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        .section {
            background: white;
            padding: 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 1.5rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        tr:hover {
            background: #f9fafb;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        .metric-card {
            background: #f9fafb;
            padding: 1rem;
            border-radius: 0.375rem;
            border-left: 4px solid #4f46e5;
        }
        .metric-label {
            font-size: 0.875rem;
            color: #6b7280;
            margin-bottom: 0.25rem;
        }
        .metric-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #111827;
        }
        .timestamp {
            color: #6b7280;
            font-size: 0.875rem;
        }
        .status-active {
            color: #059669;
            font-weight: 600;
        }
        .status-inactive {
            color: #dc2626;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Platform Analytics Report</h1>
        <p class="timestamp">Generated: ${new Date(data.generated_at).toLocaleString()}</p>
    </div>
`;
    
    // Platform metrics section
    if (data.platform_metrics) {
        const pm = data.platform_metrics;
        html += `
    <div class="section">
        <h2>Platform Overview</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-label">Total Projects</div>
                <div class="metric-value">${pm.total_projects}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Active Projects</div>
                <div class="metric-value">${pm.active_projects}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Completed Projects</div>
                <div class="metric-value">${pm.completed_projects}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Failed Projects</div>
                <div class="metric-value">${pm.failed_projects}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Raised</div>
                <div class="metric-value">${pm.total_raised.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Contributors</div>
                <div class="metric-value">${pm.total_contributors}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Success Rate</div>
                <div class="metric-value">${pm.average_project_success_rate.toFixed(1)}%</div>
            </div>
        </div>
    </div>
`;
    }
    
    // Contributor metrics section
    if (data.contributor_metrics) {
        const cm = data.contributor_metrics;
        html += `
    <div class="section">
        <h2>Contributor Analysis</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-label">Unique Contributors</div>
                <div class="metric-value">${cm.total_unique_contributors}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Contributions</div>
                <div class="metric-value">${cm.total_contributions}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Avg. Contribution</div>
                <div class="metric-value">${cm.average_contribution_size.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Active Contributors</div>
                <div class="metric-value">${cm.active_contributors}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Refunds</div>
                <div class="metric-value">${cm.refund_count}</div>
            </div>
        </div>
    </div>
`;
    }
    
    // Project metrics section
    if (data.project_metrics && data.project_metrics.length > 0) {
        html += `
    <div class="section">
        <h2>Project Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Progress</th>
                    <th>Raised</th>
                    <th>Goal</th>
                    <th>Contributors</th>
                    <th>Status</th>
                    <th>Success Likelihood</th>
                </tr>
            </thead>
            <tbody>
`;
        
        for (const pm of data.project_metrics) {
            html += `
                <tr>
                    <td>${pm.title}</td>
                    <td>${pm.funding_progress.toFixed(1)}%</td>
                    <td>${pm.total_raised.toFixed(2)}</td>
                    <td>${pm.total_goal.toFixed(2)}</td>
                    <td>${pm.contributor_count}</td>
                    <td class="${pm.is_active ? 'status-active' : 'status-inactive'}">${pm.is_active ? 'Active' : 'Ended'}</td>
                    <td>${pm.success_likelihood.toFixed(0)}%</td>
                </tr>
`;
        }
        
        html += `
            </tbody>
        </table>
    </div>
`;
    }
    
    html += `
</body>
</html>`;
    
    return html;
}

/**
 * Download a report file
 */
export function downloadReport(content: string, filename: string, format: ReportFormat) {
    const mimeTypes = {
        csv: "text/csv",
        json: "application/json",
        html: "text/html"
    };
    
    const blob = new Blob([content], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export report in the specified format and trigger download
 */
export function exportReport(
    data: ReportData,
    format: ReportFormat,
    baseName: string = "analytics-report"
) {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${baseName}-${timestamp}.${format}`;
    
    let content: string;
    
    switch (format) {
        case "csv":
            content = exportToCSV(data);
            break;
        case "json":
            content = exportToJSON(data);
            break;
        case "html":
            content = exportToHTML(data);
            break;
        default:
            throw new Error(`Unsupported format: ${format}`);
    }
    
    downloadReport(content, filename, format);
}
