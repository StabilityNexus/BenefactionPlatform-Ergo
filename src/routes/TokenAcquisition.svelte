<script lang="ts">
    import ProjectList from "./ProjectList.svelte";
    import { type Project } from "$lib/common/project";

    async function projectFilter(project: Project) {
        return true;
    }
    export let searchTerm = "";
</script>

<ProjectList bind:searchTerm={searchTerm} filterProject={projectFilter}>Fundraising Campaigns</ProjectList>
