<script lang="ts">
    import { type Project } from "$lib/common/project";
    import { address } from "$lib/common/store";
    import { sha256 } from "$lib/common/utils";
    import ProjectList from "./ProjectList.svelte";

    const filter = async (project: Project) => project.constants.owner == $address
</script>
<ProjectList filterProject={filter}>
    My Projects
</ProjectList>