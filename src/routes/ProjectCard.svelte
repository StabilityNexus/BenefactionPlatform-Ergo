<script lang="ts">
    import { block_to_time } from "$lib/common/countdown";
    import { is_ended, min_raised, type Project } from "$lib/common/project";
    import { project_detail } from "$lib/common/store";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { mode } from "mode-watcher";
    
    export let project: Project;

    let platform = new ErgoPlatform();

    let deadline_passed = false;
    let is_min_raised = false;
    let limit_date = "";
    let statusMessage = "";
    let statusColor = "";

    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);
        const blockTime = await block_to_time(project.block_limit, project.platform);
        const date = new Date(blockTime);
        // Format date as YYYY-MM-DD HH:MM UTC
        limit_date = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')} ${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')} UTC`;

        const minErg = project.minimum_amount / Math.pow(10, project.token_details.decimals);
        const maxErg = ((project.sold_counter * project.exchange_rate) / Math.pow(10, 9))
        const isMaxReached = project.collected_value >= project.value;

        if (isMaxReached) {
            statusMessage = `Reached maximum goal of ${maxErg} ${platform.main_token}; closed for contributions.`;
            statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        } else if (deadline_passed) {
            statusMessage = is_min_raised 
                ? `Reached minimum goal; open until ${limit_date}.`
                : `Did not raise ${minErg} ${platform.main_token} before ${limit_date}; closed.`;
            statusColor = is_min_raised ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
        } else {
            statusMessage = is_min_raised
                ? `Reached minimum of ${minErg} ${platform.main_token}; open up to ${maxErg} ${platform.main_token}.`
                : `Aiming to raise ${minErg} ${platform.main_token} before ${limit_date}.`;
            statusColor = is_min_raised ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        }
    }
    load();
</script>

<Card.Root class="relative bg-[#1a1a1a] h-[400px] flex flex-col {$mode === 'dark' ? 'bg-opacity-90' : 'bg-opacity-0'}">
    <Card.Header class="p-4 pb-2">
        <Card.Title class="text-xl font-bold line-clamp-1">{project.content.title}</Card.Title>
    </Card.Header>
    
    <Card.Content class="p-4 flex-1">
        <p class="line-clamp-3 text-sm opacity-90 h-[60px]">
            {project.content.description}
        </p>
    </Card.Content>

    <!-- Status Message Sticky Bottom -->
    <div class="absolute bottom-16 left-0 w-full px-4">
        <div class={`${statusColor} p-2 rounded-md text-sm transition-all`}>
            {statusMessage}
        </div>
    </div>

    <Card.Footer class="p-4 pt-2 mt-auto">
        <Button
            class="w-full"
            on:click={() => project_detail.set(project)}
            style="background-color: orange; color: black;"
        >
            View
        </Button>
    </Card.Footer>
</Card.Root>