import type { AnalyticsData, ProjectMetrics, ContributorData } from "./metrics-collector";
import type { Project } from "$lib/common/project";
import { format } from "date-fns";

export interface ReportOptions {
    format: 'json' | 'csv' | 'pdf';
    includeCharts?: boolean;
    dateRange?: { start: number; end: number };
}

/**
 * Generate JSON report
 */
export function generateJSONReport(
    project: Project,
    analytics: AnalyticsData
): string {
    const report = {
        project: {
            id: project.project_id,
            title: project.content.title,
            description: project.content.description,
            createdAt: new Date(project.box.creationHeight * 60000).toISOString(),
        },
        metrics: {
            current: analytics.metrics[analytics.metrics.length - 1] || null,
            history: analytics.metrics,
            summary: {
                totalRaised: project.sold_counter - project.refund_counter,
                totalContributors: analytics.contributors.length,
                averageContribution: analytics.contributors.length > 0
                    ? analytics.contributors.reduce((sum, c) => sum + c.contributionAmount, 0) / analytics.contributors.length
                    : 0,
                fundingProgress: analytics.metrics.length > 0
                    ? analytics.metrics[analytics.metrics.length - 1].fundingProgress
                    : 0,
            }
        },
        contributors: analytics.contributors,
        timeSeries: {
            funding: analytics.fundingHistory,
            contributions: analytics.contributionHistory
        },
        generatedAt: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
}

/**
 * Generate CSV report
 */
export function generateCSVReport(
    project: Project,
    analytics: AnalyticsData
): string {
    const lines: string[] = [];

    // Header
    lines.push("Benefaction Platform - Project Analytics Report");
    lines.push(`Project: ${project.content.title}`);
    lines.push(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
    lines.push("");

    // Metrics Summary
    lines.push("METRICS SUMMARY");
    lines.push("Metric,Value");
    const latestMetric = analytics.metrics[analytics.metrics.length - 1];
    if (latestMetric) {
        lines.push(`Total Raised,${latestMetric.soldCounter - latestMetric.refundCounter}`);
        lines.push(`Total Contributors,${latestMetric.contributorCount}`);
        lines.push(`Average Contribution,${latestMetric.averageContribution}`);
        lines.push(`Funding Progress,${latestMetric.fundingProgress.toFixed(2)}%`);
    }
    lines.push("");

    // Time Series Data
    lines.push("FUNDING HISTORY");
    lines.push("Timestamp,Funding Progress (%)");
    analytics.fundingHistory.forEach(point => {
        lines.push(`${format(new Date(point.timestamp), 'yyyy-MM-dd HH:mm:ss')},${point.value.toFixed(2)}`);
    });
    lines.push("");

    lines.push("CONTRIBUTION HISTORY");
    lines.push("Timestamp,Contributions");
    analytics.contributionHistory.forEach(point => {
        lines.push(`${format(new Date(point.timestamp), 'yyyy-MM-dd HH:mm:ss')},${point.value}`);
    });
    lines.push("");

    // Contributors
    lines.push("CONTRIBUTORS");
    lines.push("Address,Total Contribution,Contribution Count,First Contribution,Last Contribution,Tokens Received");
    analytics.contributors.forEach(contributor => {
        lines.push([
            contributor.address,
            contributor.contributionAmount,
            contributor.contributionCount,
            format(new Date(contributor.firstContribution), 'yyyy-MM-dd HH:mm:ss'),
            format(new Date(contributor.lastContribution), 'yyyy-MM-dd HH:mm:ss'),
            contributor.totalTokensReceived
        ].join(","));
    });

    return lines.join("\n");
}

/**
 * Generate text report
 */
export function generateTextReport(
    project: Project,
    analytics: AnalyticsData
): string {
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push("BENEFACTION PLATFORM - PROJECT ANALYTICS REPORT");
    lines.push("=".repeat(60));
    lines.push("");
    lines.push(`Project: ${project.content.title}`);
    lines.push(`Project ID: ${project.project_id}`);
    lines.push(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
    lines.push("");
    lines.push("-".repeat(60));

    // Summary
    const latestMetric = analytics.metrics[analytics.metrics.length - 1];
    if (latestMetric) {
        lines.push("SUMMARY");
        lines.push("-".repeat(60));
        lines.push(`Total Raised: ${latestMetric.soldCounter - latestMetric.refundCounter}`);
        lines.push(`Total Contributors: ${latestMetric.contributorCount}`);
        lines.push(`Average Contribution: ${latestMetric.averageContribution.toFixed(2)}`);
        lines.push(`Funding Progress: ${latestMetric.fundingProgress.toFixed(2)}%`);
        lines.push("");
    }

    // Contributors
    if (analytics.contributors.length > 0) {
        lines.push("TOP CONTRIBUTORS");
        lines.push("-".repeat(60));
        const topContributors = [...analytics.contributors]
            .sort((a, b) => b.contributionAmount - a.contributionAmount)
            .slice(0, 10);
        
        topContributors.forEach((contributor, index) => {
            lines.push(`${index + 1}. ${contributor.address.slice(0, 20)}...`);
            lines.push(`   Contribution: ${contributor.contributionAmount}`);
            lines.push(`   Contributions: ${contributor.contributionCount}`);
            lines.push("");
        });
    }

    lines.push("=".repeat(60));

    return lines.join("\n");
}

/**
 * Export report to file
 */
export async function exportReport(
    project: Project,
    analytics: AnalyticsData,
    options: ReportOptions
): Promise<void> {
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (options.format) {
        case 'json':
            content = generateJSONReport(project, analytics);
            filename = `project-${project.project_id}-report-${Date.now()}.json`;
            mimeType = 'application/json';
            break;
        case 'csv':
            content = generateCSVReport(project, analytics);
            filename = `project-${project.project_id}-report-${Date.now()}.csv`;
            mimeType = 'text/csv';
            break;
        default:
            content = generateTextReport(project, analytics);
            filename = `project-${project.project_id}-report-${Date.now()}.txt`;
            mimeType = 'text/plain';
    }

    // Create blob and download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


