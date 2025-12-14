import type { Project } from "$lib/common/project";
import { projects } from "$lib/common/store";
import { get } from "svelte/store";

export interface ProjectMetrics {
    projectId: string;
    projectTitle: string;
    totalRaised: number;
    currentRaised: number;
    netRaised: number;
    goalPercentage: number;
    contributorCount: number;
    soldTokens: number;
    refundedTokens: number;
    exchangedTokens: number;
    minimumGoal: number;
    maximumGoal: number;
    exchangeRate: number;
    isActive: boolean;
    isSuccessful: boolean;
    deadline: number;
    isTimestampLimit: boolean;
    baseTokenId: string;
    baseTokenName: string;
    pftTokenName: string;
    createdAt: number;
}

export interface ContributorAnalytics {
    totalContributors: number;
    activeProjects: number;
    totalContributions: number;
    averageContribution: number;
    topContributors: Array<{
        address: string;
        contributions: number;
        projectsSupported: number;
    }>;
}

export interface TimeSeriesData {
    timestamp: number;
    date: string;
    totalRaised: number;
    activeProjects: number;
    newProjects: number;
    successfulProjects: number;
    totalContributors: number;
    averageFunding: number;
}

export interface TrendAnalysis {
    fundingTrend: 'increasing' | 'decreasing' | 'stable';
    successRate: number;
    averageTimeToGoal: number;
    popularCategories: string[];
    peakFundingPeriods: Array<{ period: string; amount: number }>;
}

export class AnalyticsDataCollector {
    private static instance: AnalyticsDataCollector;
    private metricsCache: Map<string, ProjectMetrics> = new Map();
    private timeSeriesCache: TimeSeriesData[] = [];
    private lastUpdate: number = 0;
    private readonly CACHE_DURATION = 60000; // 1 minute

    private constructor() {}

    static getInstance(): AnalyticsDataCollector {
        if (!AnalyticsDataCollector.instance) {
            AnalyticsDataCollector.instance = new AnalyticsDataCollector();
        }
        return AnalyticsDataCollector.instance;
    }

    collectProjectMetrics(project: Project): ProjectMetrics {
        const cachedMetrics = this.metricsCache.get(project.project_id);
        const now = Date.now();

        if (cachedMetrics && (now - this.lastUpdate) < this.CACHE_DURATION) {
            return cachedMetrics;
        }

        const netRaised = project.sold_counter - project.refund_counter;
        const goalPercentage = (netRaised / project.maximum_amount) * 100;
        const isEnded = project.is_timestamp_limit 
            ? project.block_limit < Date.now()
            : false; // Would need current block height
        
        const isSuccessful = netRaised >= project.minimum_amount && isEnded;
        const baseTokenName = !project.base_token_id || project.base_token_id === ""
            ? "ERG"
            : project.base_token_details?.name || "Token";

        const metrics: ProjectMetrics = {
            projectId: project.project_id,
            projectTitle: project.content.title,
            totalRaised: project.sold_counter * project.exchange_rate,
            currentRaised: netRaised * project.exchange_rate,
            netRaised,
            goalPercentage: Math.min(goalPercentage, 100),
            contributorCount: this.estimateContributorCount(project),
            soldTokens: project.sold_counter,
            refundedTokens: project.refund_counter,
            exchangedTokens: project.auxiliar_exchange_counter,
            minimumGoal: project.minimum_amount,
            maximumGoal: project.maximum_amount,
            exchangeRate: project.exchange_rate,
            isActive: !isEnded,
            isSuccessful,
            deadline: project.block_limit,
            isTimestampLimit: project.is_timestamp_limit,
            baseTokenId: project.base_token_id,
            baseTokenName,
            pftTokenName: project.token_details.name,
            createdAt: Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000), // Estimate
        };

        this.metricsCache.set(project.project_id, metrics);
        return metrics;
    }

    private estimateContributorCount(project: Project): number {
        // Estimate based on transaction patterns
        // In a real implementation, this would parse blockchain data
        const netTransactions = project.sold_counter - project.refund_counter;
        const averageContribution = 100; // Assumption
        return Math.max(1, Math.floor(netTransactions / averageContribution));
    }

    collectAllMetrics(): ProjectMetrics[] {
        const projectsData = get(projects);
        const allMetrics: ProjectMetrics[] = [];

        projectsData.data.forEach((project) => {
            allMetrics.push(this.collectProjectMetrics(project));
        });

        return allMetrics;
    }

    generateTimeSeriesData(days: number = 30): TimeSeriesData[] {
        const allMetrics = this.collectAllMetrics();
        const timeSeriesData: TimeSeriesData[] = [];
        const now = Date.now();

        for (let i = days - 1; i >= 0; i--) {
            const timestamp = now - (i * 24 * 60 * 60 * 1000);
            const date = new Date(timestamp).toLocaleDateString();

            // Filter projects active on this date
            const activeProjectsOnDate = allMetrics.filter(m => 
                m.createdAt <= timestamp && 
                (!m.isTimestampLimit || m.deadline >= timestamp)
            );

            const newProjectsOnDate = allMetrics.filter(m => {
                const createdDate = new Date(m.createdAt).toLocaleDateString();
                return createdDate === date;
            });

            const totalRaised = activeProjectsOnDate.reduce((sum, m) => sum + m.currentRaised, 0);
            const successfulProjects = activeProjectsOnDate.filter(m => m.isSuccessful).length;
            const totalContributors = activeProjectsOnDate.reduce((sum, m) => sum + m.contributorCount, 0);

            timeSeriesData.push({
                timestamp,
                date,
                totalRaised,
                activeProjects: activeProjectsOnDate.length,
                newProjects: newProjectsOnDate.length,
                successfulProjects,
                totalContributors,
                averageFunding: activeProjectsOnDate.length > 0 
                    ? totalRaised / activeProjectsOnDate.length 
                    : 0,
            });
        }

        this.timeSeriesCache = timeSeriesData;
        return timeSeriesData;
    }

    analyzeTrends(timeSeriesData?: TimeSeriesData[]): TrendAnalysis {
        const data = timeSeriesData || this.timeSeriesCache;
        
        if (data.length < 2) {
            return {
                fundingTrend: 'stable',
                successRate: 0,
                averageTimeToGoal: 0,
                popularCategories: [],
                peakFundingPeriods: [],
            };
        }

        // Calculate funding trend
        const recentData = data.slice(-7);
        const olderData = data.slice(-14, -7);
        const recentAvg = recentData.reduce((sum, d) => sum + d.totalRaised, 0) / recentData.length;
        const olderAvg = olderData.length > 0 
            ? olderData.reduce((sum, d) => sum + d.totalRaised, 0) / olderData.length 
            : recentAvg;

        let fundingTrend: 'increasing' | 'decreasing' | 'stable';
        const changePercent = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;
        
        if (changePercent > 10) {
            fundingTrend = 'increasing';
        } else if (changePercent < -10) {
            fundingTrend = 'decreasing';
        } else {
            fundingTrend = 'stable';
        }

        // Calculate success rate
        const allMetrics = this.collectAllMetrics();
        const completedProjects = allMetrics.filter(m => !m.isActive);
        const successfulProjects = completedProjects.filter(m => m.isSuccessful);
        const successRate = completedProjects.length > 0
            ? (successfulProjects.length / completedProjects.length) * 100
            : 0;

        // Find peak funding periods
        const sortedByFunding = [...data].sort((a, b) => b.totalRaised - a.totalRaised);
        const peakFundingPeriods = sortedByFunding.slice(0, 5).map(d => ({
            period: d.date,
            amount: d.totalRaised,
        }));

        return {
            fundingTrend,
            successRate,
            averageTimeToGoal: this.calculateAverageTimeToGoal(allMetrics),
            popularCategories: ['Community', 'Development', 'Marketing'], // Placeholder
            peakFundingPeriods,
        };
    }

    private calculateAverageTimeToGoal(metrics: ProjectMetrics[]): number {
        const successfulMetrics = metrics.filter(m => m.isSuccessful);
        if (successfulMetrics.length === 0) return 0;

        const totalDays = successfulMetrics.reduce((sum, m) => {
            const duration = m.deadline - m.createdAt;
            return sum + (duration / (24 * 60 * 60 * 1000));
        }, 0);

        return totalDays / successfulMetrics.length;
    }

    generateContributorAnalytics(): ContributorAnalytics {
        const allMetrics = this.collectAllMetrics();
        
        const totalContributors = allMetrics.reduce((sum, m) => sum + m.contributorCount, 0);
        const activeProjects = allMetrics.filter(m => m.isActive).length;
        const totalContributions = allMetrics.reduce((sum, m) => sum + m.currentRaised, 0);
        const averageContribution = totalContributors > 0 ? totalContributions / totalContributors : 0;

        return {
            totalContributors,
            activeProjects,
            totalContributions,
            averageContribution,
            topContributors: [], // Would require blockchain data
        };
    }

    exportData(format: 'json' | 'csv' = 'json'): string {
        const allMetrics = this.collectAllMetrics();
        const timeSeriesData = this.timeSeriesCache.length > 0 
            ? this.timeSeriesCache 
            : this.generateTimeSeriesData();
        const trends = this.analyzeTrends(timeSeriesData);
        const contributors = this.generateContributorAnalytics();

        const exportData = {
            timestamp: new Date().toISOString(),
            summary: {
                totalProjects: allMetrics.length,
                activeProjects: allMetrics.filter(m => m.isActive).length,
                totalRaised: allMetrics.reduce((sum, m) => sum + m.currentRaised, 0),
                successRate: trends.successRate,
            },
            projects: allMetrics,
            timeSeries: timeSeriesData,
            trends,
            contributors,
        };

        if (format === 'csv') {
            return this.convertToCSV(exportData);
        }

        return JSON.stringify(exportData, null, 2);
    }

    private convertToCSV(data: any): string {
        const projects = data.projects;
        if (projects.length === 0) return '';

        const headers = Object.keys(projects[0]).join(',');
        const rows = projects.map((p: any) => 
            Object.values(p).map(v => 
                typeof v === 'string' && v.includes(',') ? `"${v}"` : v
            ).join(',')
        );

        return [headers, ...rows].join('\n');
    }

    clearCache(): void {
        this.metricsCache.clear();
        this.timeSeriesCache = [];
        this.lastUpdate = 0;
    }
}

export const analyticsCollector = AnalyticsDataCollector.getInstance();