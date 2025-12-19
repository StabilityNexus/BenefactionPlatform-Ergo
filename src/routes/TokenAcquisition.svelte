<script lang="ts">
    import ProjectList from "./ProjectList.svelte";
    import { type Project } from "$lib/common/project";

    export let searchQuery: string = "";

    async function projectFilter(project: Project) {
        return true;
    }
</script>

<ProjectList filterProject={projectFilter} bind:searchQuery>Fundraising Campaigns</ProjectList>
