import { type Project } from "./project";
import { project_detail } from "./store";
import { fetchProjects, fetchProjectById } from "$lib/ergo/fetch";
import { browser } from '$app/environment';

export async function loadProjectById(projectId: string) {
    try {
        const normalized = (projectId || "").trim();
        if (!normalized) throw new Error("Empty project id");

        // 1) Try targeted fetch by exact token id (optimized - doesn't load full list)
        let proj: Project | null = null;
        try {
            proj = await fetchProjectById(normalized);
        } catch (e) {
            console.warn("Targeted fetchProjectById failed; falling back to full map lookup", e);
        }
        if (!proj && normalized.startsWith('apt:')) {
            try {
                proj = await fetchProjectById(normalized.replace(/^apt:/i, ''));
            } catch (e) {
                console.warn("Targeted fetchProjectById (apt:) failed; falling back to full map lookup", e);
            }
        }
        if (proj) {
            project_detail.set(proj);

            // Ensure the URL reflects the loaded campaign so App.svelte
            // and other components render the campaign view immediately.
            try {
                if (browser && typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    const chainId = (proj.platform && (proj.platform as any).id) || 'ergo';
                    url.searchParams.set('chain', chainId);
                    url.searchParams.set('campaign', proj.project_id);
                    window.history.replaceState({}, '', url);
                }
            } catch (e) {
                console.warn('Failed to update URL after loading project by id', e);
            }

            return;
        }

        // 2) Fallback to full map lookup with flexible matching
        const projectsMap: Map<string, Project> = await fetchProjects(true);

        // Exact match
        if (projectsMap.has(normalized)) {
            project_detail.set(projectsMap.get(normalized) ?? null);
            return;
        }

        // Try common prefix like "apt:"
        const withApt = normalized.startsWith('apt:') ? normalized : `apt:${normalized}`;
        if (projectsMap.has(withApt)) {
            project_detail.set(projectsMap.get(withApt) ?? null);
            return;
        }

        // Prefix match (first 8 chars) or full-key startsWith
        // Only perform prefix matching when normalized length meets minimum threshold
        const MIN_PREFIX_LEN = 8;
        if (normalized.length >= MIN_PREFIX_LEN) {
            const prefix = normalized.slice(0, 8);
            for (const [key, p] of projectsMap.entries()) {
                if (key.startsWith(prefix) || key.startsWith(normalized)) {
                    project_detail.set(p);
                    return;
                }
            }
        }

        // Case-insensitive exact match
        for (const [key, p] of projectsMap.entries()) {
            if (key.toLowerCase() === normalized.toLowerCase()) {
                project_detail.set(p);
                return;
            }
        }

        throw new Error(`Project with ID ${projectId} not found.`);
    } catch (error) {
        console.error(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
