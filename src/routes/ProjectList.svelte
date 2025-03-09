<script lang="ts">
    import ProjectCard from './ProjectCard.svelte';
    import {type Project } from '$lib/common/project';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { projects } from '$lib/common/store';
    import * as Alert from "$lib/components/ui/alert";
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';

    let platform = new ErgoPlatform();
    let listedProjects: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoading: boolean = true;

    export let filterProject: ((project: any) => Promise<boolean>) | null = null;

    async function filterProjects(projectsMap: Map<string, Project>) {
        const filteredProjectsMap = new Map<string, Project>();

        for (const [id, project] of projectsMap.entries()) {
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

        return new Map(sortedProjectsArray);
    }

    async function loadProjects() {
        try {
            isLoading = true;
            
            // Check if we already have projects in the store
            let projectsInStore = get(projects);
            
            // If the store is empty, fetch projects and update the store
            if (projectsInStore.size === 0) {
                const fetchedProjects = await platform.fetch();
                projects.set(fetchedProjects);
                projectsInStore = fetchedProjects;
            }
            
            // Filter and sort projects from the store
            listedProjects = await filterProjects(projectsInStore);
            
        } catch (error) {
            errorMessage = error.message || "Error occurred while fetching projects";
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        loadProjects();
    });
</script>

<h2 class="project-title"><slot></slot></h2>

{#if errorMessage}
    <Alert.Root>
        <Alert.Description>
            {errorMessage}
        </Alert.Description>
    </Alert.Root>
{/if}

{#if listedProjects && Array.from(listedProjects).length > 0 && !isLoading}
    <div class="scroll-area grid grid-cols-3 gap-3">
        {#each Array.from(listedProjects) as [projectId, projectData]}
            <div class="project-card w-full">
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
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 10px;
        height: 80vh;
    }

    .project-card {
        min-height: 400px;
        margin: 0.1rem;
    }

    .loading-text,
    .no-projects-text {
        text-align: center;
    }

    @media (max-width: 768px) {
        .scroll-area {
            grid-template-columns: repeat(1, 1fr);
            overflow-y: auto;
            overflow-x: hidden;
            height: 70vh;
        }
    }

    @media (max-height: 950px) { 
        .scroll-area {
            height: 65vh;
        }
    }

    @media (max-height: 700px) { 
        .scroll-area {
            height: 55vh;
        }
    }
</style>