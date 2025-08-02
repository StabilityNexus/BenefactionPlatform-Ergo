<script lang="ts">
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { type Project } from "$lib/common/project";
    import ProjectList from "./ProjectList.svelte";
    import { get } from "svelte/store";
    import { user_tokens } from "$lib/common/store";
    import { walletConnected } from '$lib/wallet/wallet-manager';

    let platform = new ErgoPlatform();

    const filter = async (project: Project) => {
    try {
        let tokens: Map<string, number> = get(user_tokens);
        if (tokens.size === 0) {
            tokens = await platform.get_balance();
            user_tokens.set(tokens);
        }
        return (tokens.has(project.token_id) && (tokens.get(project.token_id) ?? 0) > 0) 
        || (tokens.has(project.project_id) && (tokens.get(project.project_id) ?? 0) > 0);
    } catch (error) {
        console.error("Error checking project token:", error);
        return false;
    }
};

// Subscribe to wallet connection changes to clear token cache
walletConnected.subscribe((isConnected) => {
    if (!isConnected) {
        // Clear tokens when wallet disconnects to ensure fresh data on next connection
        user_tokens.set(new Map());
    }
});
</script>
<ProjectList filterProject={filter}>
    My Contributions
</ProjectList>