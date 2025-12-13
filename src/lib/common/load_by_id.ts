import { type Project } from "./project";
import { project_detail } from "./store";
import { fetchProjects, fetchProjectById } from "$lib/ergo/fetch";

export async function loadProjectById(projectId: string, directAccess: boolean = false) {
    try {
        let project: Project | undefined | null;

        if (directAccess) {
            // Direct URL access: fetch only this specific campaign
            console.log(`[loadProjectById] Direct access mode: fetching campaign ${projectId} directly`);
            project = await fetchProjectById(projectId);
            
            if (!project) {
                throw new Error(`Campaign with ID ${projectId} not found.`);
            }
        } else {
            // Standard mode: fetch all campaigns and get the one we need
            const projects: Map<string, Project> = await fetchProjects(true);
            project = projects.get(projectId);
            
            if (!project) {
                throw new Error(`Campaign with ID ${projectId} not found.`);
            }
        }
        
        project_detail.set(project);
    } catch (error) {
        console.error(`Failed to load campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}