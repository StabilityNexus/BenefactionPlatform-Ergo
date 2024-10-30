<script lang="ts">
    import { explorer_uri, ergo_tree_template_hash } from '$lib/ergo/envs';
    import { fetch_projects } from '$lib/ergo/fetch'; // Asumiendo que fetch_projects está en $lib
    import { onMount } from 'svelte';
    import ProjectCard from './ProjectCard.svelte';
    import {type Project } from '$lib/common/project';
    import { ErgoPlatform } from '$lib/ergo/platform';

    let platform = new ErgoPlatform();

    // States for managing the fetched projects
    let projects: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoading: boolean = true;

    // Parameters required for fetch_projects
    let explorerUri: string = explorer_uri; // Cambia esto por el URI correcto
    let ergoTreeTemplateHash: string = ergo_tree_template_hash; // Cambia por el hash correcto

    export let filterProject: ((project: any) => Promise<boolean>) | null = null;

    // Function to fetch the projects
    async function loadProjects() {
        try {
            // Fetch the projects using the fetch_projects function
            const projectsList: Map<string, Project> = await platform.fetch();
            const filteredProjectsMap = new Map<string, Project>();

            // Iterate over the projects and apply the filter if it exists
            for (const [id, project] of projectsList.entries()) {
                let shouldAdd = true;

                // If filterProject is defined, apply the filter to the current project
                if (filterProject) {
                    shouldAdd = await filterProject(project);
                }

                // Only add the project if it passes the filter (or if there is no filter)
                if (shouldAdd) {
                    filteredProjectsMap.set(id, project);
                }
            }

            // Sort projects by `creationHeight` in descending order
            const sortedProjectsArray = Array.from(filteredProjectsMap.entries()).sort(
                ([, projectA], [, projectB]) => projectB.box.creationHeight - projectA.box.creationHeight
            );

            // Convert sorted array back to Map
            projects = new Map(sortedProjectsArray);
            
        } catch (error) {
            // Handle errors (if fetching fails)
            errorMessage = error.message || "Error occurred while fetching projects";
        } finally {
            // Set "isLoading" back to false
            isLoading = false;
        }
    }

    // Fetch the projects when the component is mounted
    onMount(() => {
        loadProjects();
    });
</script>

<div class="container">
    <h1><slot></slot></h1>

    {#if errorMessage}
        <div class="error">
            <p>{errorMessage}</p>
        </div>
    {/if}

    {#if projects && Array.from(projects).length > 0 && !isLoading}
        <div class="project-list">
            {#each Array.from(projects) as [projectId, projectData]}
                <div class="card">
                    <ProjectCard project={projectData} />
                </div>
            {/each}
        </div>
    {:else if isLoading}
        <p>Loading projects...</p>
    {:else}
        <p>No projects found.</p>
    {/if}
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    
    h1 {
        margin-top: 15px;
        margin-bottom: 20px;
    }

    .project-list {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: center;
        overflow-y: scroll;
        overflow-x: hidden;
        height: 80vh;
        scrollbar-color: rgba(255, 255, 255, 0.13) rgba(0, 0, 0, 0.479);
    }

    .card {
        width: 500px;
        height: 410px;
        margin: 0.5rem;
    }
    .error {
        color: red;
    }
</style>