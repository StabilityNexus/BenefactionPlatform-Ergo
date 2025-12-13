<script lang="ts">
    import ProjectCard from "./ProjectCard.svelte";
    import ProjectCardSkeleton from "./ProjectCardSkeleton.svelte";
    import { type Project } from "$lib/common/project";
    import { projects } from "$lib/common/store";
    import { fetchProjects } from "$lib/ergo/fetch";
    import * as Alert from "$lib/components/ui/alert";
    import { Loader2, Search, Filter } from "lucide-svelte";
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

    let allFetchedItems: Map<string, Project> = new Map();
    let listedItems: Map<string, Project> | null = null;
    let errorMessage: string | null = null;
    let isLoadingApi: boolean = true;
    let isFiltering: boolean = false;
    let totalProjectsCount: number = 0;

    export let searchTerm: string = "";
    let sortBy: "newest" | "oldest" | "amount" | "name" = "newest";
    let hideTestProjects: boolean = true;
    let filterOpen = false;
    let debouncedSearch: any;

    export let filterProject: ((project: Project) => Promise<boolean>) | null =
        null;

    async function applyFiltersAndSearch(sourceItems: Map<string, Project>) {
        const filteredItemsMap = new Map<string, Project>();

        if (typeof sourceItems.entries !== "function") {
            console.error(
                "applyFiltersAndSearch received non-Map sourceItems:",
                sourceItems,
            );
            listedItems = new Map();
            return;
        }

        for (const [id, item] of sourceItems.entries()) {
            let shouldAdd = true;

            if (filterProject) {
                shouldAdd = await filterProject(item);
            }

            if (shouldAdd && hideTestProjects) {
                const name = item.content.title?.toLowerCase() || "";
                const description =
                    item.content.description?.toLowerCase() || "";
                if (name.includes("test") || description.includes("test")) {
                    shouldAdd = false;
                }
            }

            if (shouldAdd && searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const titleMatch =
                    item.content.title?.toLowerCase().includes(searchLower) ??
                    false;
                const descriptionMatch =
                    item.content.description
                        ?.toLowerCase()
                        .includes(searchLower) ?? false;
                shouldAdd = titleMatch || descriptionMatch;
            }

            if (shouldAdd) {
                filteredItemsMap.set(id, item);
            }
        }

        const sortedItemsArray = Array.from(filteredItemsMap.entries());

        switch (sortBy) {
            case "newest":
                sortedItemsArray.sort(
                    ([, a], [, b]) =>
                        (b.box.creationHeight ?? 0) -
                        (a.box.creationHeight ?? 0),
                );
                break;
            case "oldest":
                sortedItemsArray.sort(
                    ([, a], [, b]) =>
                        (a.box.creationHeight ?? 0) -
                        (b.box.creationHeight ?? 0),
                );
                break;
            case "amount":
                sortedItemsArray.sort(
                    ([, a], [, b]) => {
                        const aValue = typeof a.box.value === 'number' ? a.box.value : Number(a.box.value) || 0;
                        const bValue = typeof b.box.value === 'number' ? b.box.value : Number(b.box.value) || 0;
                        return bValue - aValue;
                    },
                );
                break;
            case "name":
                sortedItemsArray.sort(([, a], [, b]) =>
                    (a.content.title || "").localeCompare(
                        b.content.title || "",
                    ),
                );
                break;
        }

        listedItems = new Map(sortedItemsArray);
    }

    async function loadInitialItems() {
        errorMessage = null;
        try {
            await fetchProjects();
        } catch (error: any) {
            console.error("Error fetching projects:", error);
            errorMessage =
                error.message || "An error occurred while fetching campaigns.";
        }
    }

    const unsubscribeProjects = projects.subscribe(async (value) => {
        allFetchedItems = value.data instanceof Map ? value.data : new Map();

        console.log(value);

        totalProjectsCount = allFetchedItems.size;

        await applyFiltersAndSearch(allFetchedItems);
        if (isLoadingApi) isLoadingApi = false;
    });

    $: if (searchTerm !== undefined) {
        clearTimeout(debouncedSearch);
        debouncedSearch = setTimeout(async () => {
            isFiltering = true;
            await applyFiltersAndSearch(allFetchedItems);
            isFiltering = false;
        }, 300);
    }

    async function handleSortChange(
        newSort: "newest" | "oldest" | "amount" | "name",
    ) {
        isFiltering = true;
        sortBy = newSort;
        await applyFiltersAndSearch(allFetchedItems);
        isFiltering = false;
    }

    async function handleTestFilterToggle() {
        isFiltering = true;
        hideTestProjects = !hideTestProjects;
        await applyFiltersAndSearch(allFetchedItems);
        isFiltering = false;
    }

    onMount(() => {
        const cachedData = get(projects).data;

        // Decide whether to show the initial loader.
        // Show it if the cache is NOT a Map, or if it is an empty Map.
        if (!(cachedData instanceof Map) || cachedData.size === 0) {
            isLoadingApi = true;
        } else {
            // If there is data, the 'subscribe' has already run synchronously,
            // populated 'allFetchedItems', and set 'isLoadingApi = false'.
            // No need to do anything here.
        }

        // Always start the load.
        // If the cache was empty, it's the initial load.
        // If the cache had data, it's a background refresh.
        loadInitialItems();
    });

    onDestroy(() => {
        unsubscribeProjects();
        if (debouncedSearch) clearTimeout(debouncedSearch);
    });
</script>

<div class="project-container">
    <h2 class="project-title"><slot /></h2>

    <div class="counts-row">
        <div class="badge">Total campaigns: {totalProjectsCount}</div>
        {#if listedItems}
            <div class="badge muted">
                Showing: {Array.from(listedItems).length}
            </div>
        {/if}
    </div>

    <div class="search-container mb-6">
        <div class="relative mx-auto flex w-full max-w-md gap-2">
            <div class="relative flex-1">
                <Search
                    class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500/70"
                />
                <Input
                    type="text"
                    placeholder="Search campaigns..."
                    bind:value={searchTerm}
                    class="w-full rounded-lg border-orange-500/20 bg-background/80 pl-10 pr-10 backdrop-blur-lg transition-all duration-200 focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20"
                />
                {#if isFiltering}
                    <Loader2
                        class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-orange-500"
                    />
                {/if}
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
                    <DropdownMenu.Item
                        class={sortBy === "newest" ? "bg-orange-500/10" : ""}
                        on:click={() => handleSortChange("newest")}
                    >
                        {sortBy === "newest" ? "✓ " : ""}Newest First
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        class={sortBy === "oldest" ? "bg-orange-500/10" : ""}
                        on:click={() => handleSortChange("oldest")}
                    >
                        {sortBy === "oldest" ? "✓ " : ""}Oldest First
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        class={sortBy === "amount" ? "bg-orange-500/10" : ""}
                        on:click={() => handleSortChange("amount")}
                    >
                        {sortBy === "amount" ? "✓ " : ""}Highest Value
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        class={sortBy === "name" ? "bg-orange-500/10" : ""}
                        on:click={() => handleSortChange("name")}
                    >
                        {sortBy === "name" ? "✓ " : ""}Alphabetical
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator />
                    <DropdownMenu.Label>Filters</DropdownMenu.Label>
                    <DropdownMenu.Item on:click={handleTestFilterToggle}>
                        <div class="flex items-center">
                            <span class="mr-2 w-4"
                                >{hideTestProjects ? "✓" : ""}</span
                            >
                            <span>Hide "Test" Campaigns</span>
                        </div>
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    </div>

    {#if errorMessage}
        <Alert.Root
            class="my-4 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
        >
            <Alert.Description class="text-center"
                >{errorMessage}</Alert.Description
            >
        </Alert.Root>
    {/if}

    {#if isLoadingApi}
        <div class="projects-grid">
            {#each Array(6) as _}
                <ProjectCardSkeleton />
            {/each}
        </div>
    {:else if listedItems && Array.from(listedItems).length > 0}
        <div class="projects-grid">
            {#each Array.from(listedItems) as [projectId, projectData] (projectId)}
                <div class="project-card">
                    <ProjectCard project={projectData} />
                </div>
            {/each}
        </div>
    {:else}
        <div class="no-projects-container">
            {#if searchTerm}
                <p class="no-projects-text">
                    No campaigns found matching "<strong>{searchTerm}</strong
                    >".<br />
                    Try a different search term or adjust filters.
                </p>
            {:else}
                <p class="no-projects-text">
                    There are no campaigns available at the moment.
                </p>
            {/if}
        </div>
    {/if}
</div>

<style>
    .counts-row {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        margin-bottom: 1.5rem;
    }
    .badge {
        padding: 0.35rem 0.6rem;
        border-radius: 999px;
        background: var(--muted);
        color: var(--foreground);
        font-weight: 600;
        font-size: 0.8rem;
    }
    .badge.muted {
        opacity: 0.8;
    }

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
        font-size: 1.875rem;
        margin: 20px 0 30px;
        color: orange;
        font-family: "Russo One", sans-serif;
        letter-spacing: 0.02em;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        position: relative;
    }

    @media (min-width: 768px) {
        .project-title {
            font-size: 3rem;
        }
    }

    .project-title::after {
        content: "";
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

    @media (max-width: 768px) {
        .projects-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
        }

        .project-title {
            font-size: 1.875rem;
            margin: 15px 0 25px;
        }
    }

    @media (max-width: 480px) {
        .projects-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
