<script lang="ts">
    import ProjectCard from './ProjectCard.svelte';
    import {type Project } from '$lib/common/project';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { projects } from '$lib/common/store';
    import * as Alert from "$lib/components/ui/alert";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Loader2, Search, Filter } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import { getFilteredProjects, type FilterOptions } from '$lib/ergo/dataAccess';
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

    let platform = new ErgoPlatform();
    let listedProjects: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoading: boolean = true;
    let searchQuery: string = "";
    let offset: number = 0;
    let sortBy: 'newest' | 'oldest' | 'amount' | 'name' = 'newest';
    let filterOpen = false;

    export let filterProject: ((project: any) => Promise<boolean>) | null = null;

    async function filterProjects(projectsMap: Map<string, Project>) {
        const filteredProjectsMap = new Map<string, Project>();

        for (const [id, project] of projectsMap.entries()) {
            let shouldAdd = true;
            if (filterProject) {
                shouldAdd = await filterProject(project);
            }
            if (shouldAdd) {
                // Apply search filter
                if (searchQuery) {
                    const searchLower = searchQuery.toLowerCase();
                    const titleMatch = project.content.title.toLowerCase().includes(searchLower);
                    const descriptionMatch = project.content.description.toLowerCase().includes(searchLower);
                    shouldAdd = titleMatch || descriptionMatch;
                }
                if (shouldAdd) {
                    filteredProjectsMap.set(id, project);
                }
            }
        }

        const sortedProjectsArray = Array.from(filteredProjectsMap.entries()).sort(
            ([, projectA], [, projectB]) => {
                switch (sortBy) {
                    case 'newest':
                        return projectB.box.creationHeight - projectA.box.creationHeight;
                    case 'oldest':
                        return projectA.box.creationHeight - projectB.box.creationHeight;
                    case 'amount':
                        return projectB.box.value - projectA.box.value;
                    case 'name':
                        return projectA.content.title.localeCompare(projectB.content.title);
                    default:
                        return 0;
                }
            }
        );

        return new Map(sortedProjectsArray);
    }

    async function loadProjects() {
        try {
            isLoading = true;
            
            // Use the new data access layer with caching and indexing
            const filterOptions: FilterOptions = {
                searchQuery: searchQuery || undefined,
                sortBy: sortBy
            };
            
            let filteredProjectsMap = await getFilteredProjects(filterOptions);
            
            // Apply any additional custom filter if provided
            if (filterProject) {
                const customFiltered = new Map<string, Project>();
                for (const [id, project] of filteredProjectsMap.entries()) {
                    if (await filterProject(project)) {
                        customFiltered.set(id, project);
                    }
                }
                filteredProjectsMap = customFiltered;
            }
            
            listedProjects = filteredProjectsMap;
            
            // Update store if needed
            if (get(projects).size === 0 && filteredProjectsMap.size > 0) {
                projects.set(filteredProjectsMap);
            }
            
        } catch (error: any) {
            errorMessage = error.message || "Error occurred while fetching projects";
        } finally {
            isLoading = false;
        }
    }

    $: if (searchQuery !== undefined || sortBy) {
        loadProjects();
    }

    onMount(() => {
        loadProjects();
    });
</script>

<div class="project-container">
    <h2 class="project-title"><slot></slot></h2>

    <div class="search-container mb-6">
        <div class="relative w-full max-w-md mx-auto flex gap-2">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-500/70 h-4 w-4" />
                <Input
                    type="text"
                    placeholder="Search projects..."
                    bind:value={searchQuery}
                    class="pl-10 w-full bg-background/80 backdrop-blur-lg border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1 rounded-lg transition-all duration-200"
                />
            </div>
            <DropdownMenu.Root bind:open={filterOpen}>
                <DropdownMenu.Trigger asChild let:builder>
                    <Button 
                        builders={[builder]} 
                        variant="outline" 
                        size="icon"
                        class="border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-500/10"
                    >
                        <Filter class="h-4 w-4 text-orange-500/70" />
                    </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content class="w-56" align="end">
                    <DropdownMenu.Label>Sort By</DropdownMenu.Label>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item class={sortBy === 'newest' ? 'bg-orange-500/10' : ''} on:click={() => sortBy = 'newest'}>
                        {sortBy === 'newest' ? '✓ ' : ''}Newest First
                    </DropdownMenu.Item>
                    <DropdownMenu.Item class={sortBy === 'oldest' ? 'bg-orange-500/10' : ''} on:click={() => sortBy = 'oldest'}>
                        {sortBy === 'oldest' ? '✓ ' : ''}Oldest First
                    </DropdownMenu.Item>
                    <DropdownMenu.Item class={sortBy === 'amount' ? 'bg-orange-500/10' : ''} on:click={() => sortBy = 'amount'}>
                        {sortBy === 'amount' ? '✓ ' : ''}Highest Value
                    </DropdownMenu.Item>
                    <DropdownMenu.Item class={sortBy === 'name' ? 'bg-orange-500/10' : ''} on:click={() => sortBy = 'name'}>
                        {sortBy === 'name' ? '✓ ' : ''}Alphabetical
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    </div>

    {#if errorMessage}
        <Alert.Root>
            <Alert.Description>
                {errorMessage}
            </Alert.Description>
        </Alert.Root>
    {/if}

    {#if listedProjects && Array.from(listedProjects).length > 0 && !isLoading}
        <div class="projects-grid">
            {#each Array.from(listedProjects) as [projectId, projectData]}
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
                    <Dialog.Title class="text-lg font-medium font-['Russo_One']">Fetching fundraising campaigns from the Ergo blockchain</Dialog.Title>
                </div>
            </Dialog.Content>
        </Dialog.Root>
        
        <div class="loading-placeholder"></div>
    {:else}
        <div class="no-projects-container">
            <p class="no-projects-text">No projects found.</p>
        </div>
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
        font-size: 2.2rem;
        margin: 20px 0 30px;
        color: orange;
        font-family: 'Russo One', sans-serif;
        letter-spacing: 0.02em;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        position: relative;
    }

    .project-title::after {
        content: '';
        position: absolute;
        bottom: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 3px;
        background: linear-gradient(90deg, rgba(255, 165, 0, 0), rgba(255, 165, 0, 1), rgba(255, 165, 0, 0));
    }

    .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 2rem;
        padding: 10px;
        width: 100%;
        animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .project-card {
        min-height: 400px;
        transition: transform 0.3s ease;
    }

    .no-projects-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }

    .no-projects-text {
        text-align: center;
        padding: 3rem;
        font-size: 1.2rem;
        color: #888;
        background: rgba(255, 165, 0, 0.05);
        border-radius: 8px;
        border: 1px solid rgba(255, 165, 0, 0.1);
        max-width: 500px;
        margin: 2rem auto;
    }

    .loading-placeholder {
        height: 70vh;
        width: 100%;
    }

    @media (max-width: 768px) {
        .projects-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
        }
        
        .loading-placeholder {
            height: 50vh;
        }

        .project-title {
            font-size: 1.8rem;
            margin: 15px 0 25px;
        }
    }

    @media (max-width: 480px) {
        .projects-grid {
            grid-template-columns: 1fr;
        }
    }
</style>