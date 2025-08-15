/**
 * Unified data access layer combining indexing and filtering
 * Provides filtering and search capabilities for blockchain data
 */

import { fetch_projects } from './fetch';
import { projectIndex } from './memoryIndex';
import type { Project } from '../common/project';
import { projectsCache, userProjectsCache, contributionsCache } from './cache';

export interface FilterOptions {
    searchQuery?: string;
    minAmount?: number;
    maxAmount?: number;
    hasToken?: boolean;
    version?: string;
    sortBy?: 'newest' | 'oldest' | 'amount' | 'name';
}

/**
 * Get filtered projects with indexing
 */
export async function getFilteredProjects(options: FilterOptions = {}): Promise<Map<string, Project>> {
    // First try to get from cache immediately
    const cacheKey = `projects_offset_0`;
    const cachedProjects = projectsCache.getSync(cacheKey);
    
    let projects: Map<string, Project>;
    
    if (cachedProjects && cachedProjects.size > 0) {
        // Use cached data immediately
        projects = cachedProjects;
        
        // Trigger background refresh if cache is stale
        if (projectsCache.isStale(cacheKey)) {
            fetch_projects(0).then(freshProjects => {
                if (freshProjects.size > 0) {
                    projectIndex.buildIndex(freshProjects);
                }
            }).catch(console.error);
        }
    } else {
        // No cache, fetch synchronously
        projects = await fetch_projects(0);
    }
    
    // Build or update the index
    if (projectIndex.size() === 0 || projectIndex.size() !== projects.size) {
        projectIndex.buildIndex(projects);
    }
    
    // Apply search if query provided
    let filteredProjects = options.searchQuery 
        ? projectIndex.search(options.searchQuery)
        : projectIndex.getAllProjects();
    
    // Apply additional filters
    if (options.minAmount || options.maxAmount || options.hasToken !== undefined || 
        options.version || options.sortBy) {
        filteredProjects = projectIndex.filter({
            minAmount: options.minAmount,
            maxAmount: options.maxAmount,
            hasToken: options.hasToken,
            version: options.version,
            sortBy: options.sortBy || 'newest'
        });
        
        // If we also have a search query, we need to intersect the results
        if (options.searchQuery) {
            const searchResults = projectIndex.search(options.searchQuery);
            const intersection = new Map<string, Project>();
            
            for (const [id, project] of filteredProjects.entries()) {
                if (searchResults.has(id)) {
                    intersection.set(id, project);
                }
            }
            
            return intersection;
        }
    }
    
    return filteredProjects;
}

/**
 * Clear index for fresh data
 */
export function invalidateProjectData(): void {
    projectIndex.clear();
}

/**
 * Get project statistics for UI display
 */
export function getProjectStats(projects: Map<string, Project>) {
    let totalProjects = projects.size;
    let totalValue = 0;
    let projectsWithTokens = 0;
    
    for (const project of projects.values()) {
        totalValue += project.collected_value;
        if (project.token_id) {
            projectsWithTokens++;
        }
    }
    
    return {
        totalProjects,
        totalValue,
        projectsWithTokens
    };
}
