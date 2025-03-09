<script lang="ts">
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { type Project } from "$lib/common/project";
    import ProjectList from "./ProjectList.svelte";
    import { get } from "svelte/store";
    import { user_tokens } from "$lib/common/store";

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
</script>
<ProjectList filterProject={filter}>
    My Contributions
</ProjectList>