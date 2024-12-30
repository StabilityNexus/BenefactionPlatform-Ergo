<script lang="ts">
    import ProjectCard from './ProjectCard.svelte';
    import {type Project } from '$lib/common/project';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import * as Alert from "$lib/components/ui/alert";
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

    let platform = new ErgoPlatform();
    let projects: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoading: boolean = true;

    export let filterProject: ((project: any) => Promise<boolean>) | null = null;

    async function loadProjects() {
        try {
            const projectsList: Map<string, Project> = await platform.fetch();
            const filteredProjectsMap = new Map<string, Project>();

            for (const [id, project] of projectsList.entries()) {
                let shouldAdd = true;
                if (filterProject) {
                    shouldAdd = await filterProject(project);
                }
                if (shouldAdd) {
                    filteredProjectsMap.set(id, project);
                }
            }

            const sortedProjectsArray = Array.from(filteredProjectsMap.entries()).sort(
                ([, projectA], [, projectB]) => projectB.box.creationHeight - projectA.box.creationHeight
            );

            projects = new Map(sortedProjectsArray);
            
        } catch (error) {
            errorMessage = error.message || "Error occurred while fetching projects";
        } finally {
            isLoading = false;
        }
    }

    loadProjects();
</script>

<h2 class="project-title"><slot></slot></h2>

{#if errorMessage}
    <Alert.Root>
        <Alert.Description>
            {errorMessage}
        </Alert.Description>
    </Alert.Root>
{/if}

{#if projects && Array.from(projects).length > 0 && !isLoading}
    <div class="scroll-area">
        {#each Array.from(projects) as [projectId, projectData]}
            <div class="project-card">
                <ProjectCard project={projectData} />
            </div>
        {/each}
    </div>
{:else if isLoading}
    <p class="loading-text">Loading projects...</p>
{:else}
    <p class="no-projects-text">No projects found.</p>
{/if}

<style>

    .project-title {
        text-align: center;
        font-size: 2rem;
        margin: 15px 0 20px;
        color: orange;
    }

    .scroll-area {
        display: flex;
        flex-wrap: nowrap;
        gap: 1rem;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 10px;
    }

    .project-card {
        min-width: 500px;
        height: 410px;
        margin: 0.5rem;
    }

    .loading-text,
    .no-projects-text {
        text-align: center;
    }

    @media (max-width: 768px) {
        .scroll-area {
            flex-wrap: wrap;
            overflow-y: auto;
            overflow-x: hidden;
            height: 80vh;
        }

        .project-card {
            width: 100%;
        }
    }
</style>