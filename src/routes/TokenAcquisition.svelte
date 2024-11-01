<script lang="ts">
    import ProjectList from "./ProjectList.svelte";
    import { type Project} from "$lib/common/project";

    async function projectFilter(project: Project) {
        return true  
    }
</script>
<ProjectList filterProject={projectFilter}>
    Available Projects
</ProjectList>