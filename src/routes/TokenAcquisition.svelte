<script lang="ts">
	import ProjectList from "./ProjectList.svelte";
	import type { Project } from "$lib/common/project";

	// 🔹 receive search from App.svelte
	export let search: string = "";

	async function projectFilter(project: Project) {
		return true;
	}
</script>

<ProjectList
	{search}
	filterProject={projectFilter}
>
	Fundraising Campaigns
</ProjectList>
