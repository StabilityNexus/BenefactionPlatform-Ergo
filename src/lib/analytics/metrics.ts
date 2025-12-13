import type { Project } from "$lib/common/project";

export interface ProjectMetrics {
    project_id: string;
    title: string;
    funding_progress: number; // Percentage (0-100)
    total_raised: number;
    total_goal: number;
    contributor_count: number;
    average_contribution: number;
    refund_rate: number; // Percentage
    exchange_activity: number;
    time_remaining: number | null; // Milliseconds or null if ended
    is_active: boolean;
    success_likelihood: number; // Percentage based on trajectory
}

export interface ContributorMetrics {
    total_unique_contributors: number;
    total_contributions: number;
    average_contribution_size: number;
    largest_contribution: number;
    smallest_contribution: number;
    refund_count: number;
    active_contributors: number; // Contributors with non-refunded tokens
}

export interface TimeSeriesDataPoint {
    timestamp: number;
    value: number;
    label?: string;
}

export interface PlatformMetrics {
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    failed_projects: number;
    total_raised: number;
    total_contributors: number;
    average_project_success_rate: number;
    average_funding_time: number; // Milliseconds
}

/**
 * Calculate comprehensive metrics for a single project
 */
export function calculateProjectMetrics(project: Project, currentHeight: number): ProjectMetrics {
    const totalRaised = project.current_value;
    const totalGoal = project.maximum_amount;
    const fundingProgress = totalGoal > 0 ? (totalRaised / totalGoal) * 100 : 0;
    
    // Estimate unique contributors (sold_counter represents number of buy transactions)
    const contributorCount = project.sold_counter;
    const averageContribution = contributorCount > 0 ? totalRaised / contributorCount : 0;
    
    // Calculate refund rate
    const refundRate = project.sold_counter > 0 
        ? (project.refund_counter / project.sold_counter) * 100 
        : 0;
    
    // Time remaining calculation
    let timeRemaining: number | null = null;
    let isActive = true;
    
    if (project.is_timestamp_limit) {
        const currentTime = Date.now();
        timeRemaining = project.block_limit - currentTime;
        isActive = timeRemaining > 0;
    } else {
        const blocksRemaining = project.block_limit - currentHeight;
        timeRemaining = blocksRemaining * project.platform.time_per_block;
        isActive = blocksRemaining > 0;
    }
    
    // Calculate success likelihood based on current trajectory
    const effectiveContributions = project.sold_counter - project.refund_counter;
    const minimumProgress = project.minimum_amount > 0 
        ? (effectiveContributions / project.minimum_amount) * 100 
        : 100;
    
    const timeProgress = timeRemaining && timeRemaining > 0 
        ? ((project.block_limit - timeRemaining) / project.block_limit) * 100 
        : 100;
    
    // Success likelihood: weighted average of funding progress and time utilization
    const successLikelihood = isActive 
        ? Math.min((minimumProgress * 0.7 + (100 - timeProgress) * 0.3), 100)
        : (effectiveContributions >= project.minimum_amount ? 100 : 0);
    
    return {
        project_id: project.project_id,
        title: project.content.title,
        funding_progress: Math.min(fundingProgress, 100),
        total_raised: totalRaised,
        total_goal: totalGoal,
        contributor_count: contributorCount,
        average_contribution: averageContribution,
        refund_rate: refundRate,
        exchange_activity: project.auxiliar_exchange_counter,
        time_remaining: timeRemaining,
        is_active: isActive,
        success_likelihood: Math.max(0, Math.min(successLikelihood, 100))
    };
}

/**
 * Calculate contributor-focused metrics across one or more projects
 */
export function calculateContributorMetrics(projects: Project[]): ContributorMetrics {
    let totalContributions = 0;
    let totalValue = 0;
    let totalRefunds = 0;
    let contributions: number[] = [];
    
    for (const project of projects) {
        totalContributions += project.sold_counter;
        totalRefunds += project.refund_counter;
        totalValue += project.current_value;
        
        // Estimate individual contribution sizes
        if (project.sold_counter > 0) {
            const avgContrib = project.current_value / project.sold_counter;
            for (let i = 0; i < project.sold_counter; i++) {
                contributions.push(avgContrib);
            }
        }
    }
    
    const activeContributors = totalContributions - totalRefunds;
    
    return {
        total_unique_contributors: totalContributions, // Approximation
        total_contributions: totalContributions,
        average_contribution_size: totalContributions > 0 ? totalValue / totalContributions : 0,
        largest_contribution: contributions.length > 0 ? Math.max(...contributions) : 0,
        smallest_contribution: contributions.length > 0 ? Math.min(...contributions) : 0,
        refund_count: totalRefunds,
        active_contributors: activeContributors
    };
}

/**
 * Calculate platform-wide metrics
 */
export function calculatePlatformMetrics(
    projects: Project[], 
    currentHeight: number
): PlatformMetrics {
    let activeCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalRaised = 0;
    let totalContributors = 0;
    let successfulProjects = 0;
    let totalFundingTime = 0;
    
    for (const project of projects) {
        const metrics = calculateProjectMetrics(project, currentHeight);
        totalRaised += metrics.total_raised;
        totalContributors += metrics.contributor_count;
        
        if (metrics.is_active) {
            activeCount++;
        } else {
            completedCount++;
            // Check if project was successful
            const effectiveContributions = project.sold_counter - project.refund_counter;
            if (effectiveContributions >= project.minimum_amount) {
                successfulProjects++;
            } else {
                failedCount++;
            }
            
            // Estimate funding time (simplified)
            if (project.is_timestamp_limit) {
                totalFundingTime += project.block_limit;
            }
        }
    }
    
    const averageSuccessRate = completedCount > 0 
        ? (successfulProjects / completedCount) * 100 
        : 0;
    
    const averageFundingTime = successfulProjects > 0 
        ? totalFundingTime / successfulProjects 
        : 0;
    
    return {
        total_projects: projects.length,
        active_projects: activeCount,
        completed_projects: completedCount,
        failed_projects: failedCount,
        total_raised: totalRaised,
        total_contributors: totalContributors,
        average_project_success_rate: averageSuccessRate,
        average_funding_time: averageFundingTime
    };
}

/**
 * Generate time-series data for a project's funding progress
 * This is a simplified version - in production, you'd want to track actual historical data
 */
export function generateFundingTimeSeries(
    project: Project,
    dataPoints: number = 10
): TimeSeriesDataPoint[] {
    const timeSeries: TimeSeriesDataPoint[] = [];
    const currentValue = project.current_value;
    
    // Simulate historical data based on current state
    // In production, this should come from a database
    const startTime = project.is_timestamp_limit 
        ? project.block_limit - (30 * 24 * 60 * 60 * 1000) // 30 days ago
        : Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const endTime = Date.now();
    const timeInterval = (endTime - startTime) / (dataPoints - 1);
    
    for (let i = 0; i < dataPoints; i++) {
        const timestamp = startTime + (timeInterval * i);
        // Simulate growth curve (exponential-ish)
        const progress = Math.pow(i / (dataPoints - 1), 1.5);
        const value = currentValue * progress;
        
        timeSeries.push({
            timestamp,
            value: Math.round(value),
            label: new Date(timestamp).toLocaleDateString()
        });
    }
    
    return timeSeries;
}

/**
 * Generate contributor activity time-series
 */
export function generateContributorTimeSeries(
    project: Project,
    dataPoints: number = 10
): TimeSeriesDataPoint[] {
    const timeSeries: TimeSeriesDataPoint[] = [];
    const totalContributors = project.sold_counter;
    
    const startTime = project.is_timestamp_limit 
        ? project.block_limit - (30 * 24 * 60 * 60 * 1000)
        : Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const endTime = Date.now();
    const timeInterval = (endTime - startTime) / (dataPoints - 1);
    
    for (let i = 0; i < dataPoints; i++) {
        const timestamp = startTime + (timeInterval * i);
        // Simulate contributor growth (S-curve)
        const progress = 1 / (1 + Math.exp(-10 * (i / (dataPoints - 1) - 0.5)));
        const value = Math.round(totalContributors * progress);
        
        timeSeries.push({
            timestamp,
            value,
            label: new Date(timestamp).toLocaleDateString()
        });
    }
    
    return timeSeries;
}
