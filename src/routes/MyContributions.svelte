<script lang="ts">
	import { ErgoPlatform } from "$lib/ergo/platform";
	import type { Project } from "$lib/common/project";
	import ProjectList from "./ProjectList.svelte";
	import { get } from "svelte/store";
	import { user_tokens, address } from "$lib/common/store";
	import { walletConnected } from "wallet-svelte-component";

	// 🔹 receive search from App.svelte
	export let search: string = "";

	let platform = new ErgoPlatform();

	const filter = async (project: Project) => {
		try {
			const currentAddress = get(address);
			if (!currentAddress) return false;

			let tokens: Map<string, number> = get(user_tokens);

			if (tokens.size === 0) {
				tokens = await platform.get_balance();
				user_tokens.set(tokens);
			}

			return (
				(tokens.has(project.pft_token_id) &&
					(tokens.get(project.pft_token_id) ?? 0) > 0) ||
				(tokens.has(project.project_id) &&
					(tokens.get(project.project_id) ?? 0) > 0)
			);
		} catch (error) {
			console.error("Error checking project token:", error);
			return false;
		}
	};

	// Clear cached tokens when wallet disconnects
	walletConnected.subscribe((isConnected) => {
		if (!isConnected) {
			user_tokens.set(new Map());
		}
	});
</script>

<ProjectList
	{search}
	filterProject={filter}
>
	My Contributions
</ProjectList>
