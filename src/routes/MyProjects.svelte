<script lang="ts">
	import type { Project } from "$lib/common/project";
	import { address } from "$lib/common/store";
	import { ErgoAddress } from "@fleet-sdk/core";
	import ProjectList from "./ProjectList.svelte";

	// 🔹 receive search from App.svelte
	export let search: string = "";

	// Only show projects owned by connected wallet
	const filter = async (project: Project) => {
		if (!$address) return false;

		return (
			project.constants.owner ===
			ErgoAddress.fromBase58($address).ergoTree
		);
	};
</script>

<ProjectList
	{search}
	filterProject={filter}
>
	My Campaigns
</ProjectList>
