<script>
    import { address } from "$lib/common/store";
    import { sha256 } from "$lib/common/utils";
    import ProjectList from "./ProjectList.svelte";

    const filter = async (project) => project.owner == await sha256($address ?? "")
</script>
<ProjectList filterProject={filter}>
    My projects
</ProjectList>