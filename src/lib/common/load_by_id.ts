import { type Platform } from "./platform";
import { type Project } from "./project";
import { project_detail } from "./store";

export async function loadProjectById(projectId: string, platform: Platform) {
    const projects: Map<string, Project> = await platform.fetch();
    if (projectId in projects.keys()) {
        const project = projects.get(projectId);
        if (project) {
            project_detail.set(project);
        } else {
            console.error(`Project with ID ${projectId} is undefined.`);
        }
    } else {
        console.error(`Project with ID ${projectId} not found.`);
    }
}