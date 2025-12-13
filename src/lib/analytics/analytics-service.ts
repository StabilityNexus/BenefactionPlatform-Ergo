/**
 * Analytics Service - Client-side data collection and analysis
 * Everything runs in the browser, no backend required
 */

import { type Project } from "$lib/common/project";
import { get } from "svelte/store";

export interface ProjectMetrics {
    projectId: string;
    projectName: string;
    
    // Funding metrics
    currentFunding: number;
    targetFunding: number;
    minimumFunding: number;
    fundingPercentage: number;
    
    // Contribution metrics
    totalContributions: number;
    totalRefunds: number;
    netContributions: number;
    
    // Token metrics
    totalPFTSupply: number;
    soldPFT: number;
    unsoldPFT: number;
    exchangedPFT: number;
    
    // Time metrics
    deadline: number;
    isTimestampLimit: boolean;
    daysRemaining: number | null;
    blocksRemaining: number | null;
    
    // Status
    isActive: boolean;
    isSuccessful: boolean;
    isFailed: boolean;
    
    // Rate metrics
    exchangeRate: number;
    baseTokenId: string;
    baseTokenName: string;
}

export interface ContributorMetrics {
    totalContributors: number;
    averageContribution: number;
    topContributors: Array<{
        address: string;
        amount: number;
        percentage: number;
    }>;
    contributionDistribution: {
        small: number;  // < 10% of average
        medium: number; // 10-100% of average
        large: number;  // > 100% of average
    };
}

export interface TimeSeriesData {
    timestamp: number;
    blockHeight?: number;
    totalFunding: number;
    contributionCount: number;
    refundCount: number;
    netFunding: number;
}

export interface PlatformAnalytics {
    totalProjects: number;
    activeProjects: number;
    successfulProjects: number;
    failedProjects: number;
    
    totalFundsRaised: number;
    totalContributions: number;
    
    averageProjectSuccess: number;
    averageContributionSize: number;
    
    projectsByStatus: {
        active: number;
        ended: number;
        successful: number;
        failed: number;
    };
}

export class AnalyticsService {
    /**
     * Calculate comprehensive project metrics
     */
    static calculateProjectMetrics(project: Project, currentHeight?: number): ProjectMetrics {
        const netContributions = project.sold_counter - project.refund_counter;
        const fundingPercentage = (netContributions / project.maximum_amount) * 100;
        
        // Calculate time remaining
        let daysRemaining: number | null = null;
        let blocksRemaining: number | null = null;
        
        if (project.is_timestamp_limit) {
            const now = Date.now();
            const timeLeft = project.block_limit - now;
            daysRemaining = timeLeft > 0 ? Math.ceil(timeLeft / (1000 * 60 * 60 * 24)) : 0;
        } else if (currentHeight) {
            blocksRemaining = Math.max(0, project.block_limit - currentHeight);
            daysRemaining = Math.ceil(blocksRemaining * 2 / 60 / 24); // Approx 2 min per block
        }
        
        const isSuccessful = netContributions >= project.minimum_amount;
        const isEnded = project.is_timestamp_limit 
            ? project.block_limit < Date.now()
            : currentHeight ? project.block_limit < currentHeight : false;
        
        return {
            projectId: project.project_id,
            projectName: project.content.title,
            currentFunding: project.current_value,
            targetFunding: project.maximum_amount * project.exchange_rate,
            minimumFunding: project.minimum_amount * project.exchange_rate,
            fundingPercentage,
            totalContributions: project.sold_counter,
            totalRefunds: project.refund_counter,
            netContributions,
            totalPFTSupply: project.total_pft_amount,
            soldPFT: project.sold_counter,
            unsoldPFT: project.unsold_pft_amount,
            exchangedPFT: project.auxiliar_exchange_counter,
            deadline: project.block_limit,
            isTimestampLimit: project.is_timestamp_limit,
            daysRemaining,
            blocksRemaining,
            isActive: !isEnded,
            isSuccessful: isSuccessful && isEnded,
            isFailed: !isSuccessful && isEnded,
            exchangeRate: project.exchange_rate,
            baseTokenId: project.base_token_id,
            baseTokenName: project.base_token_details?.name || "ERG"
        };
    }
    
    /**
     * Calculate platform-wide analytics from all projects
     */
    static calculatePlatformAnalytics(projects: Project[], currentHeight?: number): PlatformAnalytics {
        let totalFundsRaised = 0;
        let totalContributions = 0;
        let activeProjects = 0;
        let successfulProjects = 0;
        let failedProjects = 0;
        let endedProjects = 0;
        
        projects.forEach(project => {
            const metrics = this.calculateProjectMetrics(project, currentHeight);
            
            totalFundsRaised += metrics.currentFunding;
            totalContributions += metrics.totalContributions;
            
            if (metrics.isActive) {
                activeProjects++;
            } else {
                endedProjects++;
                if (metrics.isSuccessful) {
                    successfulProjects++;
                } else {
                    failedProjects++;
                }
            }
        });
        
        const averageProjectSuccess = projects.length > 0 
            ? (successfulProjects / (successfulProjects + failedProjects)) * 100 
            : 0;
        
        const averageContributionSize = totalContributions > 0 
            ? totalFundsRaised / totalContributions 
            : 0;
        
        return {
            totalProjects: projects.length,
            activeProjects,
            successfulProjects,
            failedProjects,
            totalFundsRaised,
            totalContributions,
            averageProjectSuccess,
            averageContributionSize,
            projectsByStatus: {
                active: activeProjects,
                ended: endedProjects,
                successful: successfulProjects,
                failed: failedProjects
            }
        };
    }
    
    /**
     * Store analytics data in localStorage (client-side persistence)
     */
    static storeAnalyticsSnapshot(projectId: string, metrics: ProjectMetrics): void {
        const key = `analytics_${projectId}`;
        const existing = this.getAnalyticsHistory(projectId);
        
        const snapshot = {
            timestamp: Date.now(),
            metrics
        };
        
        existing.push(snapshot);
        
        // Keep only last 1000 snapshots per project
        if (existing.length > 1000) {
            existing.shift();
        }
        
        localStorage.setItem(key, JSON.stringify(existing));
    }
    
    /**
     * Get historical analytics data for a project
     */
    static getAnalyticsHistory(projectId: string): Array<{ timestamp: number, metrics: ProjectMetrics }> {
        const key = `analytics_${projectId}`;
        const data = localStorage.getItem(key);
        
        if (!data) {
            return [];
        }
        
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error("Failed to parse analytics history:", error);
            return [];
        }
    }
    
    /**
     * Generate time-series data for charts
     */
    static generateTimeSeriesData(projectId: string): TimeSeriesData[] {
        const history = this.getAnalyticsHistory(projectId);
        
        return history.map(snapshot => ({
            timestamp: snapshot.timestamp,
            blockHeight: snapshot.metrics.blocksRemaining 
                ? snapshot.metrics.deadline - snapshot.metrics.blocksRemaining 
                : undefined,
            totalFunding: snapshot.metrics.currentFunding,
            contributionCount: snapshot.metrics.totalContributions,
            refundCount: snapshot.metrics.totalRefunds,
            netFunding: snapshot.metrics.netContributions * snapshot.metrics.exchangeRate
        }));
    }
    
    /**
     * Export analytics data as JSON
     */
    static exportAsJSON(data: any, filename: string): void {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Export analytics data as CSV
     */
    static exportAsCSV(data: any[], filename: string): void {
        if (data.length === 0) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escape commas and quotes
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Clear analytics data for a project
     */
    static clearAnalyticsHistory(projectId: string): void {
        const key = `analytics_${projectId}`;
        localStorage.removeItem(key);
    }
    
    /**
     * Get all stored project analytics keys
     */
    static getAllAnalyticsKeys(): string[] {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('analytics_')) {
                keys.push(key.replace('analytics_', ''));
            }
        }
        return keys;
    }
}
