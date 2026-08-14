import { get } from "svelte/store";
import { project_detail, project_id_conflicts, project_load_error } from "./store";
import { fetchProjectById } from "$lib/ergo/fetch";

export async function loadProjectById(projectId: string) {
    project_load_error.set(null);

    try {
        const project = await fetchProjectById(projectId);

        if (!project) {
            const conflictingBoxes = get(project_id_conflicts).get(projectId);

            if (conflictingBoxes) {
                // More than one unspent box claims this id. One of them is an impersonation and
                // nothing on chain says which, so the campaign is not shown at all. See #176.
                project_load_error.set(
                    `This campaign cannot be displayed safely: ${conflictingBoxes.length} different boxes ` +
                    `claim the id ${projectId}, so there is no way to tell the real one from an imitation. ` +
                    `Do not send funds to it. Boxes: ${conflictingBoxes.join(", ")}.`
                );
                return;
            }

            throw new Error(`Project with ID ${projectId} not found.`);
        }

        project_detail.set(project);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        project_load_error.set(message);
        console.error(`Failed to load project: ${message}`);
    }
}
