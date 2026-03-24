import { type Project } from "./project";
import { project_detail } from "./store";
import { fetchProjectById } from "$lib/ergo/fetch";

export async function loadProjectById(projectId: string) {
    try {
        const project = await fetchProjectById(projectId);
        
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found.`);
        }
        
        project_detail.set(project);
    } catch (error) {
        console.error(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}