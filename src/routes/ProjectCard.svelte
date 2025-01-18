<script lang="ts">
    import { block_to_time } from "$lib/common/countdown";
    import { is_ended, min_raised, type Project } from "$lib/common/project";
    import { project_detail } from "$lib/common/store";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import { mode } from "mode-watcher";
    
    // Define 'project' as a prop of type Project
    export let project: Project;

    let deadline_passed = false;
    let is_min_raised = false;
    let limit_date = "";
    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);
        limit_date = new Date(
            await block_to_time(project.block_limit, project.platform)
        ).toLocaleString();
    }
    load();

    function toggleDetails() {
        // Get the current value of the store
        project_detail.set(project);
    }
</script>

<!-- <Card.Root class="bg-cover bg-center bg-no-repeat" style="background-image: url({project.content.image});"> -->
<Card.Root style="height: 400px; position: relative;">
    <Card.Header class="bg-[#1a1a1a] {$mode === 'dark' ? 'bg-opacity-90' : 'bg-opacity-0'} p-4">
        <Card.Title class="text-xl font-bold">{project.content.title}</Card.Title>
    </Card.Header>
    <Card.Content class="bg-[#1a1a1a] {$mode === 'dark' ? 'bg-opacity-90' : 'bg-opacity-0'} p-4 space-y-4">
        <p>
            {project.content.description.length > 48
                ? project.content.description.slice(0, 48) + " ...."
                : project.content.description}
        </p>
        <p><strong>Limit date:</strong> {limit_date}</p>
        <p><strong>Current ERG balance:</strong> {project.current_value / 1000000000} ERG</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes" : "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes" : "No"}</p>
        
        <!-- Botón posicionado en la esquina inferior izquierda -->
        <Button
            class="absolute bottom-4 left-4"
            on:click={toggleDetails}
            style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;"
        >
            View
        </Button>
    </Card.Content>
</Card.Root>
