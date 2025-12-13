<script lang="ts">
	import ProjectCard from "./ProjectCard.svelte";
	import ProjectCardSkeleton from "./ProjectCardSkeleton.svelte";
	import type { Project } from "$lib/common/project";
	import { projects } from "$lib/common/store";
	import { fetchProjects } from "$lib/ergo/fetch";
	import * as Alert from "$lib/components/ui/alert";
	import { Loader2, Search, Filter } from "lucide-svelte";
	import { onMount, onDestroy } from "svelte";
	import { get } from "svelte/store";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

	/* ----------------------------------
	   PROPS (IMPORTANT)
	---------------------------------- */
	export let search: string = "";
	export let filterProject: ((project: Project) => Promise<boolean>) | null = null;

	/* ----------------------------------
	   STATE
	---------------------------------- */
	let allFetchedItems: Map<string, Project> = new Map();
	let listedItems: Map<string, Project> | null = null;
	let errorMessage: string | null = null;
	let isLoadingApi = true;
	let isFiltering = false;
	let totalProjectsCount = 0;

	let sortBy: "newest" | "oldest" | "amount" | "name" = "newest";
	let hideTestProjects = true;
	let filterOpen = false;
	let debouncedSearch: any;

	/* ----------------------------------
	   FILTER + SEARCH LOGIC
	---------------------------------- */
	async function applyFiltersAndSearch(sourceItems: Map<string, Project>) {
		const filteredItemsMap = new Map<string, Project>();

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

			if (shouldAdd && search) {
				const q = search.toLowerCase();
				const titleMatch =
					item.content.title?.toLowerCase().includes(q) ?? false;
				const descriptionMatch =
					item.content.description?.toLowerCase().includes(q) ?? false;

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
					([, a], [, b]) =>
						(b.content.targetAmount ?? 0) -
						(a.content.targetAmount ?? 0),
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

	/* ----------------------------------
	   SEARCH REACTION (DEBOUNCED)
	---------------------------------- */
	$: if (search !== undefined) {
		clearTimeout(debouncedSearch);
		debouncedSearch = setTimeout(async () => {
			isFiltering = true;
			await applyFiltersAndSearch(allFetchedItems);
			isFiltering = false;
		}, 300);
	}

	/* ----------------------------------
	   SORT / FILTER HANDLERS
	---------------------------------- */
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

	/* ----------------------------------
	   DATA LOADING
	---------------------------------- */
	async function loadInitialItems() {
		errorMessage = null;
		try {
			await fetchProjects();
		} catch (error: any) {
			errorMessage =
				error.message || "An error occurred while fetching campaigns.";
		}
	}

	const unsubscribeProjects = projects.subscribe(async (value) => {
		allFetchedItems =
			value.data instanceof Map ? value.data : new Map();

		totalProjectsCount = allFetchedItems.size;
		await applyFiltersAndSearch(allFetchedItems);
		isLoadingApi = false;
	});

	onMount(() => {
		const cachedData = get(projects).data;
		if (!(cachedData instanceof Map) || cachedData.size === 0) {
			isLoadingApi = true;
		}
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
					bind:value={search}
					class="w-full rounded-lg border-orange-500/20 bg-background/80 pl-10 pr-10 backdrop-blur-lg"
				/>
				{#if isFiltering}
					<Loader2
						class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-orange-500"
					/>
				{/if}
			</div>

			<DropdownMenu.Root bind:open={filterOpen}>
				<DropdownMenu.Trigger asChild let:builder>
					<Button builders={[builder]} variant="outline" size="icon">
						<Filter class="h-4 w-4 text-orange-500/70" />
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-56" align="end">
					<DropdownMenu.Label>Sort By</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item on:click={() => handleSortChange("newest")}>
						Newest First
					</DropdownMenu.Item>
					<DropdownMenu.Item on:click={() => handleSortChange("oldest")}>
						Oldest First
					</DropdownMenu.Item>
					<DropdownMenu.Item on:click={() => handleSortChange("amount")}>
						Highest Value
					</DropdownMenu.Item>
					<DropdownMenu.Item on:click={() => handleSortChange("name")}>
						Alphabetical
					</DropdownMenu.Item>

					<DropdownMenu.Separator />
					<DropdownMenu.Item on:click={handleTestFilterToggle}>
						{hideTestProjects ? "✓ " : ""}Hide "Test" Campaigns
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#if errorMessage}
		<Alert.Root class="my-4">
			<Alert.Description>{errorMessage}</Alert.Description>
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
			{#each Array.from(listedItems) as [id, project]}
				<ProjectCard {project} />
			{/each}
		</div>
	{:else}
		<div class="no-projects-container">
			{#if search}
				<p>No campaigns found matching "{search}"</p>
			{:else}
				<p>No campaigns available.</p>
			{/if}
		</div>
	{/if}
</div>
