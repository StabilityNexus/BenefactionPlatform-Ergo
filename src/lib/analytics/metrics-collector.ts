import type { Project } from "$lib/common/project";
import { get } from "svelte/store";
import { explorer_uri } from "$lib/common/store";

export interface ProjectMetrics {
    projectId: string;
    timestamp: number;
    soldCounter: number;
    refundCounter: number;
    currentValue: number;
    currentPftAmount: number;
    totalPftAmount: number;
    contributorCount: number;
    averageContribution: number;
    fundingProgress: number; // percentage
}

export interface ContributorData {
    address: string;
    contributionAmount: number;
    contributionCount: number;
    firstContribution: number;
    lastContribution: number;
    totalTokensReceived: number;
}

export interface TimeSeriesDataPoint {
    timestamp: number;
    value: number;
    label?: string;
}

export interface AnalyticsData {
    projectId: string;
    metrics: ProjectMetrics[];
    contributors: ContributorData[];
    fundingHistory: TimeSeriesDataPoint[];
    contributionHistory: TimeSeriesDataPoint[];
}

// Store for analytics data
const analyticsCache = new Map<string, AnalyticsData>();

/**
 * Collect metrics for a project
 */
export async function collectProjectMetrics(project: Project): Promise<ProjectMetrics> {
    const currentVal = project.sold_counter - project.refund_counter;
    const max = project.current_pft_amount;
    const fundingProgress = max > 0 ? (currentVal / max) * 100 : 0;

    // Try to fetch contributor count from blockchain
    let contributorCount = 0;
    let averageContribution = 0;

    try {
        const contributorData = await fetchContributorData(project.project_id);
        contributorCount = contributorData.length;
        if (contributorCount > 0) {
            const totalContributions = contributorData.reduce((sum, c) => sum + c.contributionAmount, 0);
            averageContribution = totalContributions / contributorCount;
        }
    } catch (error) {
        console.warn("Failed to fetch contributor data:", error);
    }

    return {
        projectId: project.project_id,
        timestamp: Date.now(),
        soldCounter: project.sold_counter,
        refundCounter: project.refund_counter,
        currentValue: project.current_value,
        currentPftAmount: project.current_pft_amount,
        totalPftAmount: project.total_pft_amount,
        contributorCount,
        averageContribution,
        fundingProgress
    };
}

/**
 * Fetch contributor data from blockchain transactions
 */
export async function fetchContributorData(projectId: string): Promise<ContributorData[]> {
    const contributors = new Map<string, ContributorData>();
    const explorer = get(explorer_uri);

    try {
        // Fetch transactions related to the project box
        // This is a simplified version - in production, you'd query the blockchain more thoroughly
        const url = `${explorer}/api/v1/boxes/unspent/search`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ergoTreeTemplateHash: null,
                registers: {},
                constants: {},
                assets: [{ tokenId: projectId }]
            })
        });

        if (response.ok) {
            const data = await response.json();
            // Process transactions to extract contributor data
            // This would need to be expanded to actually parse transaction history
        }
    } catch (error) {
        console.error("Error fetching contributor data:", error);
    }

    return Array.from(contributors.values());
}

/**
 * Get or create analytics data for a project
 */
export function getAnalyticsData(projectId: string): AnalyticsData | null {
    return analyticsCache.get(projectId) || null;
}

/**
 * Update analytics data for a project
 */
export async function updateAnalyticsData(project: Project): Promise<AnalyticsData> {
    const metrics = await collectProjectMetrics(project);
    const existing = analyticsCache.get(project.project_id);

    const newMetrics = existing 
        ? [...existing.metrics, metrics]
        : [metrics];

    // Keep only last 1000 data points
    const trimmedMetrics = newMetrics.slice(-1000);

    // Build time series data
    const fundingHistory: TimeSeriesDataPoint[] = trimmedMetrics.map(m => ({
        timestamp: m.timestamp,
        value: m.fundingProgress,
        label: new Date(m.timestamp).toISOString()
    }));

    const contributionHistory: TimeSeriesDataPoint[] = trimmedMetrics.map(m => ({
        timestamp: m.timestamp,
        value: m.soldCounter - m.refundCounter,
        label: new Date(m.timestamp).toISOString()
    }));

    // Fetch contributor data
    const contributors = await fetchContributorData(project.project_id);

    const analyticsData: AnalyticsData = {
        projectId: project.project_id,
        metrics: trimmedMetrics,
        contributors,
        fundingHistory,
        contributionHistory
    };

    analyticsCache.set(project.project_id, analyticsData);
    return analyticsData;
}

/**
 * Get key metrics summary
 */
export function getKeyMetrics(project: Project): {
    totalRaised: number;
    totalContributors: number;
    averageContribution: number;
    fundingProgress: number;
    daysRemaining: number;
} {
    const currentVal = project.sold_counter - project.refund_counter;
    const max = project.current_pft_amount;
    const fundingProgress = max > 0 ? (currentVal / max) * 100 : 0;

    // Calculate days remaining
    let daysRemaining = 0;
    if (project.is_timestamp_limit) {
        const now = Date.now();
        const remaining = project.block_limit - now;
        daysRemaining = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
    }

    return {
        totalRaised: currentVal,
        totalContributors: 0, // Will be populated from analytics
        averageContribution: 0, // Will be populated from analytics
        fundingProgress,
        daysRemaining
    };
}

/**
 * Clear analytics cache
 */
export function clearAnalyticsCache(projectId?: string): void {
    if (projectId) {
        analyticsCache.delete(projectId);
    } else {
        analyticsCache.clear();
    }
}


