import { type Project } from './project';
import { project_detail } from './store';
import { fetchProjects } from '$lib/ergo/fetch';

export async function loadProjectById(projectId: string) {
  try {
    const projects: Map<string, Project> = await fetchProjects(true);
    const project = projects.get(projectId);

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }

    project_detail.set(project);
  } catch (error) {
    console.error(
      `Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
