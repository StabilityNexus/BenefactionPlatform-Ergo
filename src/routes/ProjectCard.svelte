<script lang="ts">
    import { block_to_time } from "$lib/common/countdown";
    import { is_ended, min_raised, type Project } from "$lib/common/project";
    import { project_detail } from "$lib/common/store";
    import { Button } from "$lib/components/ui/button";

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

<div
    class="card"
    style="background-image: url({project.content.image}); background-size: cover; background-position: center; background-repeat: no-repeat;"
>
    <div class="card-body">
        <h3 class="card-title">{project.content.title}</h3>
        <p>
            {project.content.description.length > 48
                ? project.content.description.slice(0, 48) + " ...."
                : project.content.description}
        </p>
        <p><strong>Limit date:</strong> {limit_date}</p>
        <!-- <p><strong>ERGs collected (included refuned or withdraw):</strong> {project.collected_value/1000000000} ERG</p>  -->
        <p><strong>Current ERG balance:</strong> {project.current_value / 1000000000} ERG</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes" : "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes" : "No"}</p>
        <Button
            on:click={toggleDetails}
            style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;"
        >
            View
        </Button>
    </div>
</div>

<style>
    .card {
        margin: 1rem 0;
        border: 1px solid #ddd;
        color: #ddd;
        position: relative;
    }

    .card-body {
        padding: 1rem;
        background-color: rgba(0, 0, 0, 0.9);
        color: #fff;
    }

    .card-title {
        margin-bottom: 0.5rem;
    }
</style>
