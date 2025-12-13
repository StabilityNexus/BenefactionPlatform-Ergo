import { writable, derived, get } from 'svelte/store';
import type { Project } from '$lib/common/project';
import type { 
    ProjectMetrics, 
    ContributorMetrics, 
    PlatformMetrics, 
    TimeSeriesDataPoint 
} from './metrics';
import {
    calculateProjectMetrics,
    calculateContributorMetrics,
    calculatePlatformMetrics,
    generateFundingTimeSeries,
    generateContributorTimeSeries
} from './metrics';

// Store for current block height
export const currentBlockHeight = writable<number>(0);

// Store for selected project for detailed analytics
export const selectedProjectForAnalytics = writable<string | null>(null);

// Derived store for project metrics
export const projectMetricsMap = derived(
    [currentBlockHeight],
    ([$currentBlockHeight]: [number]) => {
        return (projects: Project[]): Map<string, ProjectMetrics> => {
            const metricsMap = new Map<string, ProjectMetrics>();
            for (const project of projects) {
                const metrics = calculateProjectMetrics(project, $currentBlockHeight);
                metricsMap.set(project.project_id, metrics);
            }
            return metricsMap;
        };
    }
);

// Store for analytics cache to avoid recalculating frequently
export const analyticsCache = writable<{
    platformMetrics: PlatformMetrics | null;
    contributorMetrics: ContributorMetrics | null;
    lastUpdate: number;
}>({
    platformMetrics: null,
    contributorMetrics: null,
    lastUpdate: 0
});

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * Update analytics cache with fresh data
 */
export function updateAnalyticsCache(projects: Project[], currentHeight: number) {
    const platformMetrics = calculatePlatformMetrics(projects, currentHeight);
    const contributorMetrics = calculateContributorMetrics(projects);
    
    analyticsCache.set({
        platformMetrics,
        contributorMetrics,
        lastUpdate: Date.now()
    });
}

/**
 * Check if cache is still valid
 */
export function isCacheValid(): boolean {
    const cache = get(analyticsCache);
    return (Date.now() - cache.lastUpdate) < CACHE_DURATION;
}

/**
 * Get or calculate platform metrics
 */
export function getPlatformMetrics(projects: Project[], currentHeight: number): PlatformMetrics {
    const cache = get(analyticsCache);
    
    if (isCacheValid() && cache.platformMetrics) {
        return cache.platformMetrics;
    }
    
    updateAnalyticsCache(projects, currentHeight);
    return get(analyticsCache).platformMetrics!;
}

/**
 * Get or calculate contributor metrics
 */
export function getContributorMetrics(projects: Project[]): ContributorMetrics {
    const cache = get(analyticsCache);
    
    if (isCacheValid() && cache.contributorMetrics) {
        return cache.contributorMetrics;
    }
    
    updateAnalyticsCache(projects, get(currentBlockHeight));
    return get(analyticsCache).contributorMetrics!;
}
