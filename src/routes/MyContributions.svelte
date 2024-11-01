<script lang="ts">
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { type Project } from "$lib/common/project";
    import ProjectList from "./ProjectList.svelte";

    let platform = new ErgoPlatform();

    const filter = async (project: Project) => {
    try {
        const tokens: Map<string, number> = await platform.get_balance(project.token_id);
        return tokens.has(project.token_id) && (tokens.get(project.token_id) ?? 0) > 0;
    } catch (error) {
        console.error("Error checking project token:", error);
        return false;
    }
};
</script>
<ProjectList filterProject={filter}>
    My Contributions
</ProjectList>