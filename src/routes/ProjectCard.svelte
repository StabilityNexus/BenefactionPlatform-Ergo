<script lang="ts">
    import { block_to_time } from "$lib/countdown";
    import { is_ended, min_raised, type Project } from "$lib/common/project";
    import {project_detail} from "$lib/ergo/store";
    import { Button } from "spaper";

    // Define 'project' as a prop of type Project
    export let project: Project;

    let deadline_passed = false;
    let is_min_raised = false;
    let limit_date = "";
    async function load()
    {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project)
        limit_date = new Date(await block_to_time(project.block_limit)).toLocaleString();
    }
    load()

    function toggleDetails() {
        // Get the current value of the store
        project_detail.set(project);
    }
</script>

<div class="card">
    <div class="card-body">
        <h3 class="card-title">Project ID: {project.token_id}</h3>
        <p><strong>Limit date:</strong> {limit_date}</p>
        <p><strong>Minimum Amount:</strong> {project.minimum_amount}</p>
        <p><strong>Total Amount:</strong> {project.total_amount}</p>
        <p><strong>Exchange Rate:</strong> {project.exchange_rate}</p>
        <p><strong>ERGs collected:</strong> {project.value}</p>
        <p><strong>Tokens sold:</strong> {project.amount_sold}</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes": "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes": "No"}</p>
        <Button on:click={toggleDetails} style="background-color: orange; border: none; color: black">View</Button>
        
    </div>
</div>

<style>
    /* Custom styles for the card */
    .card {
        margin: 1rem 0;
        border: 1px solid #ddd;
        color: #ddd;
    }

    .card-body {
        padding: 1rem;
    }

    .card-title {
        margin-bottom: 0.5rem;
    }
</style>
