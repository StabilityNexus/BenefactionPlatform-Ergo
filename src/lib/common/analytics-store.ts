import { writable, derived } from 'svelte/store';
import type { ProjectMetrics, TimeSeriesData } from '$lib/analytics/datacollector';

export const analyticsMetrics = writable<ProjectMetrics[]>([]);
export const analyticsTimeSeries = writable<TimeSeriesData[]>([]);
export const analyticsLastUpdate = writable<number>(0);

export const topProjects = derived(analyticsMetrics, ($metrics) => 
    [...$metrics]
        .filter(m => m.isActive)
        .sort((a, b) => b.currentRaised - a.currentRaised)
        .slice(0, 10)
);

export const recentlyFunded = derived(analyticsMetrics, ($metrics) =>
    [...$metrics]
        .filter(m => m.isSuccessful)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
);