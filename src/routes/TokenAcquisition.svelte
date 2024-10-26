<script lang="ts">
    import ProjectList from "./project_list.svelte";
    import { is_ended, type Project} from "$lib/ergo/project";

    async function projectFilter(project: Project) {
        return ! is_ended(project)
    }
</script>
<ProjectList filterProject={null}>
    Available projects
</ProjectList>