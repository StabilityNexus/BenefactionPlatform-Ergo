import { type Project } from "./project";
import { project_detail } from "./store";
import { fetchProjects, fetchSingleProject } from "$lib/ergo/fetch";

/**
 * Load a project by its ID, with optional direct fetch mode
 * @param projectId - The project/campaign token ID
 * @param directFetch - If true, fetches only this project instead of loading all campaigns
 */
export async function loadProjectById(projectId: string, directFetch: boolean = false) {
    try {
        let project: Project | null = null;
        
        if (directFetch) {
            // Direct mode: fetch only the specific campaign
            console.log(`[loadProjectById] Direct fetch mode for project: ${projectId}`);
            project = await fetchSingleProject(projectId);
        } else {
            // Legacy mode: load all projects first
            console.log(`[loadProjectById] Loading from full project list: ${projectId}`);
            const projects: Map<string, Project> = await fetchProjects(true);
            project = projects.get(projectId) || null;
        }
        
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found.`);
        }
        
        project_detail.set(project);
        console.log(`[loadProjectById] Successfully loaded project: ${projectId}`);
    } catch (error) {
        console.error(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}