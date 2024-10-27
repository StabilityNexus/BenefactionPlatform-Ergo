<script>
    import { sha256 } from "$lib/ergo/sha256";
    import { address } from "$lib/ergo/store";
    import ProjectList from "./ProjectList.svelte";

    const filter = async (project) => project.owner == await sha256($address ?? "")
</script>
<ProjectList filterProject={filter}>
    My projects
</ProjectList>