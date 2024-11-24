import { type Platform } from "./platform";
import { type Project } from "./project";
import { project_detail } from "./store";

export async function loadProjectById(projectId: string, platform: Platform) {
    try {
        const projects: Map<string, Project> = await platform.fetch();
        const project = projects.get(projectId);
        
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found.`);
        }
        
        project_detail.set(project);
    } catch (error) {
        console.error(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}