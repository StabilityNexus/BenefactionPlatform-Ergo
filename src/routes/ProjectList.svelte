<script lang="ts">
    import ProjectCard from './ProjectCard.svelte';
    import {type Project } from '$lib/common/project';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import * as Alert from "$lib/components/ui/alert";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Loader2 } from 'lucide-svelte';

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
            
        } catch (error: any) {
            errorMessage = error.message || "Error occurred while fetching projects";
        } finally {
            isLoading = false;
        }
    }

    loadProjects();
</script>

<div class="project-container">
    <h2 class="project-title"><slot></slot></h2>

    {#if errorMessage}
        <Alert.Root>
            <Alert.Description>
                {errorMessage}
            </Alert.Description>
        </Alert.Root>
    {/if}

    {#if projects && Array.from(projects).length > 0 && !isLoading}
        <div class="projects-grid">
            {#each Array.from(projects) as [projectId, projectData]}
                <div class="project-card">
                    <ProjectCard project={projectData} />
                </div>
            {/each}
        </div>
    {:else if isLoading}
        <Dialog.Root open={isLoading}>
            <Dialog.Content class="w-[250px] rounded-xl bg-background/80 backdrop-blur-lg border border-orange-500/20">
                <div class="flex flex-col items-center justify-center p-6 gap-4">
                    <Loader2 class="h-16 w-16 animate-spin text-orange-500" />
                    <Dialog.Title class="text-lg font-medium font-['Russo_One']">Loading projects</Dialog.Title>
                </div>
            </Dialog.Content>
        </Dialog.Root>
        
        <div class="loading-placeholder"></div>
    {:else}
        <p class="no-projects-text">No projects found.</p>
    {/if}
</div>

<style>
    .project-container {
        display: flex;
        flex-direction: column;
        padding: 0 15px;
        margin-bottom: 40px;
        width: 100%;
        max-width: 1200px;
        margin-left: auto;
        margin-right: auto;
    }

    .project-title {
        text-align: center;
        font-size: 2rem;
        margin: 15px 0 20px;
        color: orange;
        font-family: 'Russo One', sans-serif;
        letter-spacing: 0.02em;
    }

    .projects-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.5rem;
        padding: 10px;
        width: 100%;
    }

    .project-card {
        min-height: 400px;
    }

    .no-projects-text {
        text-align: center;
        padding: 2rem;
        font-size: 1.1rem;
        color: #888;
    }

    .loading-placeholder {
        height: 70vh;
        width: 100%;
    }

    @media (max-width: 768px) {
        .projects-grid {
            grid-template-columns: repeat(1, 1fr);
        }
        
        .loading-placeholder {
            height: 50vh;
        }
    }
</style>