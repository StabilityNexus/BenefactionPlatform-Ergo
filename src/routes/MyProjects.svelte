<script>
    import { sha256 } from "$lib/ergo/sha256";
    import { address } from "$lib/ergo/store";
    import ProjectList from "./project_list.svelte";

    const filter = (project) => project.owner == sha256($address ?? "")
</script>
<ProjectList filterProject={filter}>
    My projects
</ProjectList>