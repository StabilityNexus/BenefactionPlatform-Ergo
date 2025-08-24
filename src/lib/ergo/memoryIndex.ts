/**
 * In-memory search index for client-side filtering and sorting
 * Enables powerful text search and filtering operations on project data
 */

import type { Project } from "../common/project";

interface IndexEntry {
    id: string;
    project: Project;
    searchTokens: Set<string>;
    sortValue: number;
}

export class MemoryIndex {
    private index: Map<string, IndexEntry> = new Map();
    private searchFields = ['title', 'description', 'tokenName'];

    /**
     * Build index from projects map
     */
    buildIndex(projects: Map<string, Project>): void {
        this.index.clear();
        
        for (const [id, project] of projects.entries()) {
            const searchTokens = this.tokenizeProject(project);
            
            this.index.set(id, {
                id,
                project,
                searchTokens,
                sortValue: project.box.creationHeight // Default sort by creation height
            });
        }
    }

    /**
     * Tokenize project fields for search
     */
    private tokenizeProject(project: Project): Set<string> {
        const tokens = new Set<string>();
        
        // Add title tokens
        if (project.content?.title) {
            this.tokenizeText(project.content.title).forEach(token => tokens.add(token));
        }
        
        // Add description tokens
        if (project.content?.description) {
            this.tokenizeText(project.content.description).forEach(token => tokens.add(token));
        }
        
        // Add token name
        if (project.token_details?.name) {
            this.tokenizeText(project.token_details.name).forEach(token => tokens.add(token));
        }
        
        // Add project ID (first 8 chars)
        tokens.add(project.project_id.slice(0, 8).toLowerCase());
        
        return tokens;
    }

    /**
     * Tokenize text into searchable tokens
     */
    private tokenizeText(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove special characters
            .split(/\s+/) // Split by whitespace
            .filter(token => token.length > 0); // Remove empty tokens
    }

    /**
     * Search projects with query
     */
    search(query: string): Map<string, Project> {
        if (!query || query.trim() === '') {
            // Return all projects if no query
            return this.getAllProjects();
        }
        
        const queryTokens = this.tokenizeText(query);
        const results = new Map<string, Project>();
        
        for (const [id, entry] of this.index.entries()) {
            // Check if all query tokens match
            const matches = queryTokens.every(queryToken => 
                Array.from(entry.searchTokens).some(indexToken => 
                    indexToken.includes(queryToken)
                )
            );
            
            if (matches) {
                results.set(id, entry.project);
            }
        }
        
        return results;
    }

    /**
     * Filter projects by criteria
     */
    filter(criteria: {
        minAmount?: number;
        maxAmount?: number;
        hasToken?: boolean;
        version?: string;
        sortBy?: 'newest' | 'oldest' | 'amount' | 'name';
    }): Map<string, Project> {
        let filtered = Array.from(this.index.values());
        
        // Apply filters
        if (criteria.minAmount !== undefined) {
            filtered = filtered.filter(entry => 
                entry.project.minimum_amount >= criteria.minAmount!
            );
        }
        
        if (criteria.maxAmount !== undefined) {
            filtered = filtered.filter(entry => 
                entry.project.maximum_amount <= criteria.maxAmount!
            );
        }
        
        if (criteria.hasToken !== undefined) {
            filtered = filtered.filter(entry => 
                (entry.project.token_id !== "") === criteria.hasToken
            );
        }
        
        if (criteria.version) {
            filtered = filtered.filter(entry => 
                entry.project.version === criteria.version
            );
        }
        
        // Apply sorting
        switch (criteria.sortBy) {
            case 'oldest':
                filtered.sort((a, b) => a.project.box.creationHeight - b.project.box.creationHeight);
                break;
            case 'amount':
                filtered.sort((a, b) => b.project.collected_value - a.project.collected_value);
                break;
            case 'name':
                filtered.sort((a, b) => 
                    (a.project.content?.title || '').localeCompare(b.project.content?.title || '')
                );
                break;
            case 'newest':
            default:
                filtered.sort((a, b) => b.project.box.creationHeight - a.project.box.creationHeight);
                break;
        }
        
        // Convert back to Map
        const results = new Map<string, Project>();
        filtered.forEach(entry => results.set(entry.id, entry.project));
        
        return results;
    }

    /**
     * Get all projects from index
     */
    getAllProjects(): Map<string, Project> {
        const results = new Map<string, Project>();
        this.index.forEach(entry => results.set(entry.id, entry.project));
        return results;
    }

    /**
     * Clear the index
     */
    clear(): void {
        this.index.clear();
    }

    /**
     * Get index size
     */
    size(): number {
        return this.index.size;
    }
}

// Export singleton instance
export const projectIndex = new MemoryIndex();
