<script lang="ts">
    import ProjectCard from './ProjectCard.svelte';
    import ProjectCardSkeleton from './ProjectCardSkeleton.svelte';
    import { type Project } from '$lib/common/project';
    import { projects } from '$lib/common/store';
    import * as Alert from '$lib/components/ui/alert';
    import { Loader2, Search, Filter } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { Input } from '$lib/components/ui/input';
    import { Button } from '$lib/components/ui/button';
    import { getFilteredProjects, type FilterOptions } from '$lib/ergo/dataAccess';
    import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

    let listedProjects: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoading: boolean = true;
    let isRefreshing: boolean = false;
    let searchQuery: string = '';
    let sortBy: 'newest' | 'oldest' | 'amount' | 'name' = 'newest';
    let hideTestProjects: boolean = true; // State for the new filter
    let filterOpen = false;
    let debounceTimer: NodeJS.Timeout;

    export let filterProject: ((project: any) => Promise<boolean>) | null = null;

    async function loadProjects(showLoading: boolean = true) {
        try {
            if (showLoading && !listedProjects) {
                isLoading = true;
            } else {
                isRefreshing = true;
            }

            const filterOptions: FilterOptions = {
                searchQuery: searchQuery || undefined,
                sortBy: sortBy
            };

            let filteredProjectsMap = await getFilteredProjects(filterOptions);

            // New filter logic to hide projects containing "test"
            if (hideTestProjects) {
                const nonTestProjects = new Map<string, Project>();
                for (const [id, project] of filteredProjectsMap.entries()) {
                    // Assuming project has 'name' and 'description' properties
                    const name = project.content.title || '';
                    const description = project.content.description || '';
                    if (!name.toLowerCase().includes('test') && !description.toLowerCase().includes('test')) {
                        nonTestProjects.set(id, project);
                    }
                }
                filteredProjectsMap = nonTestProjects;
            }

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

            if (get(projects).size === 0 && filteredProjectsMap.size > 0) {
                projects.set(filteredProjectsMap);
            }
        } catch (error: any) {
            errorMessage = error.message || 'Error occurred while fetching projects';
        } finally {
            isLoading = false;
            isRefreshing = false;
        }
    }

    function handleSearchChange() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadProjects(false);
        }, 300);
    }

    // Reactive statements to reload projects when filters change
    $: if (searchQuery !== undefined) {
        handleSearchChange();
    }

    $: if (sortBy) {
        loadProjects(false);
    }

    $: if (hideTestProjects !== undefined) {
        loadProjects(false);
    }

    onMount(async () => {
        const cachedProjects = get(projects);
        if (cachedProjects && cachedProjects.size > 0) {
            listedProjects = cachedProjects;
            isLoading = false;
            loadProjects(false); // Background refresh
        } else {
            await loadProjects(true); // Initial load with skeleton
        }
    });
</script>

<div class="project-container">
    <h2 class="project-title"><slot /></h2>

    <div class="search-container mb-6">
        <div class="relative mx-auto flex w-full max-w-md gap-2">
            <div class="relative flex-1">
                <Search
                    class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500/70"
                />
                <Input
                    type="text"
                    placeholder="Search projects..."
                    bind:value={searchQuery}
                    class="w-full rounded-lg border-orange-500/20 bg-background/80 pl-10 backdrop-blur-lg transition-all duration-200 focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20"
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
                    
                    <!-- New filter option -->
                    <DropdownMenu.Separator />
                    <DropdownMenu.Label>Filters</DropdownMenu.Label>
                    <DropdownMenu.Item on:click={() => hideTestProjects = !hideTestProjects}>
                        <div class="flex items-center">
                            <span class="mr-2 w-4">{hideTestProjects ? '✓' : ''}</span>
                            <span>Hide "Test" Projects</span>
                        </div>
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

    {#if isRefreshing && listedProjects}
        <div class="refresh-indicator">
            <Loader2 class="h-4 w-4 animate-spin text-orange-500" />
            <span class="text-sm text-orange-500">Updating...</span>
        </div>
    {/if}

    {#if isLoading}
        <div class="projects-grid">
            {#each Array(6) as _}
                <ProjectCardSkeleton />
            {/each}
        </div>
    {:else if listedProjects && Array.from(listedProjects).length > 0}
        <div class="projects-grid">
            {#each Array.from(listedProjects) as [projectId, projectData]}
                <div class="project-card">
                    <ProjectCard project={projectData} />
                </div>
            {/each}
        </div>
    {:else}
        <div class="no-projects-container">
            {#if searchQuery}
                <p class="no-projects-text">
                    No projects found matching "<strong>{searchQuery}</strong>".<br />
                    Try a different search term or adjust filters.
                </p>
            {:else}
                <p class="no-projects-text">There are no projects available at the moment.</p>
            {/if}
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
        background: linear-gradient(90deg, transparent, orange, transparent);
    }

    .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 2rem;
        padding: 10px;
        width: 100%;
        animation: fadeIn 0.5s ease-in-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .project-card {
        min-height: 400px;
        transition: transform 0.3s ease;
    }

    .no-projects-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        min-height: 40vh;
        animation: fadeIn 0.5s ease-in-out;
    }

    .no-projects-text {
        text-align: center;
        padding: 2.5rem 3rem;
        font-size: 1.2rem;
        color: #aaa;
        background: rgba(255, 165, 0, 0.05);
        border-radius: 8px;
        border: 1px solid rgba(255, 165, 0, 0.1);
        max-width: 500px;
    }

    .refresh-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: rgba(255, 165, 0, 0.1);
        border-radius: 20px;
        margin-bottom: 1rem;
        width: fit-content;
        margin-left: auto;
        margin-right: auto;
    }

    @media (max-width: 768px) {
        .projects-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
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
