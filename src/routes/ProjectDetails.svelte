<script lang="ts">
    import { type Project, is_ended, min_raised } from "$lib/common/project";
    import { address, connected, project_detail, project_token_amount, temporal_token_amount } from "$lib/common/store";
    import { Progress } from "$lib/components/ui/progress";
    import { Button } from "$lib/components/ui/button";
    import { block_to_time } from "$lib/common/countdown";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { web_explorer_uri_tx } from '$lib/ergo/envs';
    import { mode } from "mode-watcher";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Badge } from "$lib/components/ui/badge/index.js";

    // Define 'project' as a prop of type Project
    let project: Project = $project_detail;

    let platform = new ErgoPlatform();

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let showCopyMessage = false;

    let currentVal = project.sold_counter;
    let min = project.minimum_amount;
    let max = project.total_pft_amount;
    let percentage =  parseInt(((currentVal/max)*100).toString())

    // States for amounts
    let show_submit = false;
    let label_submit = "";
    let function_submit = null;
    let value_submit = 0;
    let submit_info = "";
    let hide_submit_info = false;
    let submit_amount_label = "";

    $: submit_info = Number(value_submit * project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '') + "ERGs in total."

    // Project owner actions
    function setupAddTokens() {
        label_submit = "How many tokens do you want to add?";
        function_submit = add_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = project.token_details.name
    }

    async function add_tokens() {
        console.log("Adding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.rebalance(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while adding tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawTokens() {
        label_submit = "How many tokens do you want to withdraw?";
        function_submit = withdraw_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = project.token_details.name
    }

    async function withdraw_tokens() {
        console.log("Withdrawing tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.rebalance(project, (-1) * value_submit);
            transactionId = result;
        } catch (error) {
            console.log(error)
            errorMessage = error.message || "Error occurred while withdrawing tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawErg() {
        label_submit = "How many ERGs do you want to withdraw?";
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = "ERGs";
    }

    async function withdraw_erg() {
        console.log("Withdrawing ERGs:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.withdraw(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while withdrawing ERGs";
        } finally {
            isSubmitting = false;
        }
    }

    // User actions
    function setupBuy() {
        label_submit = "With how many tokens do you want to contribute?";
        function_submit = buy;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = project.token_details.name
    }

    async function buy() {
        console.log("Buying tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.buy_refund(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while buying tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupRefund() {
        label_submit = "How many tokens do you want to refund?";
        function_submit = refund;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = project.token_details.name
    }

    async function refund() {
        console.log("Refunding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.buy_refund(project, (-1) * value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while refunding tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupTempExchange() {
        label_submit = "Exchange "+project.content.title+" APT per "+project.token_details.name;
        function_submit = temp_exchange;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = project.token_details.name
    }

    async function temp_exchange() {
        console.log("Refunding tokens:", value_submit);
        isSubmitting = true;

        try {
            const result = await platform.temp_exchange(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while exchange TFT <-> PFT";
        } finally {
            isSubmitting = false;
        }
    }

    // Function to handle sharing the project
    function shareProject() {
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                showCopyMessage = true;
                setTimeout(() => {
                    showCopyMessage = false;
                }, 2000);
            })
            .catch(err => console.error('Failed to copy text: ', err));
    }

    // Function to close the detail page
    function closePage() {
        targetDate = 0;
        clearInterval(countdownInterval);
        project_detail.set(null);
        temporal_token_amount.set(null);
        project_token_amount.set(null);
    }

    function close_submit_form() {
        show_submit = false;
        transactionId = null;
        errorMessage = null;
        isSubmitting = false;
    }

    let deadline_passed = false;
    let is_min_raised = false;
    let limit_date = "";
    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);

        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project)
        limit_date = new Date(await block_to_time(project.block_limit, project.platform)).toLocaleString();
    }
    load();

    let is_owner = false;
    async function checkIfIsOwner() {
        is_owner = $connected && await $address === project.constants.owner;
    }
    checkIfIsOwner();

    let targetDate = 0;
    async function setTargetDate() {
        targetDate = await block_to_time(project.block_limit, project.platform);
    }
    setTargetDate()

    function updateCountdown() {
        var currentDate = new Date().getTime();
        var diff = targetDate - currentDate;

        if (diff > 0) {
            var days = Math.floor(diff / (1000 * 60 * 60 * 24));
            var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((diff % (1000 * 60)) / 1000);
        } 
        else {
            var days = 0;
            var hours = 0
            var minutes = 0;
            var seconds = 0;
        }

        const daysElement = document.getElementById('days');
        const hoursElement = document.getElementById('hours');
        const minutesElement = document.getElementById('minutes');
        const secondsElement = document.getElementById('seconds');

        if (daysElement) {
            daysElement.innerHTML = days.toString();
        }
        if (hoursElement) {
            hoursElement.innerHTML = hours.toString();
        }
        if (minutesElement) {
            minutesElement.innerHTML = minutes.toString();
        }
        if (secondsElement) {
            secondsElement.innerHTML = seconds.toString();
        }
    }

    var countdownInterval = setInterval(updateCountdown, 1000);

    async function get_user_project_tokens(){
        var user_project_tokens = (await platform.get_balance(project.token_id)).get(project.token_id) ?? 0;
        project_token_amount.set((user_project_tokens/Math.pow(10, project.token_details.decimals)).toString()+" "+project.token_details.name);
        
        var temporal_tokens = (await platform.get_balance(project.project_id)).get(project.project_id) ?? 0;
        temporal_token_amount.set(temporal_tokens/Math.pow(10, project.token_details.decimals))
    }
    get_user_project_tokens()

</script>

<div class="back" style="margin-left: 2rem;">
    <Button style="background-color: #FFB347; color: black;" on:click={closePage}>
        &lt; Go to main
    </Button>
</div>

<!-- Main Project Detail Page -->
<div class="project-detail flex flex-col md:flex-row" style="{$mode === 'light' ? 'color: black;' : 'color: #ddd;'}">
    <div class="details w-full md:w-1/3 space-y-4">

        <!-- =============================== -->
        <!-- Project Description Section -->
        <!-- =============================== -->
        <p><em class="text-xl font-bold">Description</em></p>
        <p>{project.content.description}</p>
        {#if project.content.link !== null}
            <p>More info <a href="{project.content.link}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">here</a>.</p>
        {/if}

        <div 
            class="bg-cover bg-center bg-no-repeat h-64" 
            style="background-image: url({project.content.image});"
        ></div>

    </div>

    <div class="details w-full md:w-1/3 space-y-4">
    <!-- =============================== -->
        <!-- Key Project Details Section -->
        <!-- =============================== -->
        <p><em class="text-xl font-bold">Details</em></p>
        <p><strong>Exchange Rate:</strong> {(project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '')} {platform.main_token}/{project.token_details.name}</p>
        <p><strong>Current ERG balance:</strong> {project.current_value / Math.pow(10, 9)} {platform.main_token}</p>
        <p><strong>Token:</strong> {project.token_id.slice(0, 6) + '...' + project.token_id.slice(-4)}</p>
        <p><strong>Deadline Date:</strong> {limit_date}</p>
        <p><strong>Deadline Block:</strong> {project.block_limit}</p>

        <!-- =============================== -->
        <!-- Additional Comments Section -->
        <!-- =============================== -->
        <!-- <p><em class="text-xl font-bold">Additional Comments</em></p> -->
         <!---<p><strong>Tokens refunded:</strong> {project.refunded_amount / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</p>-->
        <!-- <p><strong>ERGs collected (included refunded or withdrawn):</strong> {project.collected_value / 1000000000} ERG</p> -->
        <!-- <p><strong>Owner:</strong> {project.constants.owner.slice(0, 6)}...{project.constants.owner.slice(-4)}</p> -->

        <Button class="bg-gray-500 text-black border-none mt-8" style="margin-top: 3rem;" on:click={shareProject}>
            Share
        </Button>
        {#if showCopyMessage}
            <div class="copy-msg mt-4 text-green-500">
                Project page url copied to clipboard!
            </div>
        {/if}
    </div>

    <div class="extra w-full md:w-1/3 mt-4 md:mt-0">
        <div class="timeleft">
            <span class="timeleft-label">TIME LEFT</span>
            <div class="responsive1">
                <div class="item">
                    <div id="days"></div>
                    <div class="h3"><h3>Days</h3></div>
                </div>
                <div class="item">
                    <div id="hours"></div>
                    <div class="h3"><h3>Hours</h3></div>
                </div>
                <div class="item">
                    <div id="minutes"></div>
                    <div class="h3"><h3>Minutes</h3></div>
                </div>
                <div class="item">
                    <div id="seconds"></div>
                    <div class="h3"><h3>Seconds</h3></div>
                </div>
            </div>
        </div>
        <div class="progress">
            <Progress value="{percentage}"/>
        </div>

        <div class="flex flex-col md:flex-row justify-between gap-6 text-black" style="color: {$mode === 'light' ? 'black' : 'white'};">
            <div class="flex flex-col">
                <div class="text-left">Minimum Amount: {min / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                <div class="text-center md:text-right">{((min * project.exchange_rate) / Math.pow(10, 9))} {platform.main_token}</div>
            </div>
            
            <div class="flex flex-col">
                <div class="text-left">Current Amount Sold: {currentVal / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                <div class="text-center md:text-right">{((currentVal * project.exchange_rate) / Math.pow(10, 9))} {platform.main_token}</div>
            </div>
            
            <div class="flex flex-col">
                <div class="text-left">Maximum Amount: {max / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                <div class="text-center md:text-right">{((max * project.exchange_rate) / Math.pow(10, 9))} {platform.main_token}</div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="actions">

            <!-- User actions -->
            {#if $connected}
                <div class="action-group">
                    <div class="action-buttons">
                        <Button style="background-color: orange; color: black; border: none; margin-right: 3rem;" on:click={setupBuy} disabled={!(project.total_pft_amount !== project.sold_counter)}>
                            Contribute
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupRefund} disabled={!(deadline_passed && !is_min_raised)}>
                            Get a Refund
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupTempExchange} disabled={!(is_min_raised)}>
                            Collect {project.token_details.name}
                        </Button>
                    </div>
                </div>
            {/if}

            <!-- Project owner actions -->
            {#if is_owner}
                <div class="action-group">
                    <div class="action-buttons">
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupAddTokens}>
                            Add {project.token_details.name}
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawTokens}>
                            Withdraw {project.token_details.name}
                        </Button>
  
                        <Button style="background-color: orange; color: black; border: none; margin-left: 3rem;" on:click={setupWithdrawErg} disabled={!is_min_raised}>
                            Collect {platform.main_token}
                        </Button>
                    </div>
                </div>
            {/if}

        </div>

        <!-- Input field and submit button for actions -->
        {#if show_submit}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="actions-form" style="{$mode === 'light' ? 'background: rgba(50, 50, 50, 0.05);' : 'background: rgba(255, 255, 255, 0.05);'}">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="close-button" on:click={close_submit_form} style="{ $mode === 'light' ? 'color: black;' : 'color: rgb(255, 255, 255);'}">
                    &times;
                </div>
                <div class="centered-form">
                    {#if transactionId}
                        <div class="result">
                            <p>
                                <strong>Transaction ID:</strong>
                                <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" style="color: #ffa500;">
                                    {transactionId.slice(0,16)}
                                </a>
                            </p>
                        </div>
                    {:else if errorMessage}
                        <div class="error">
                            <p>{errorMessage}</p>
                        </div>
                    {:else}
                        <!-- svelte-ignore a11y-label-has-associated-control -->
                        <Label for="number">{label_submit}</Label>
                        <div style="display: flex; align-items: center;">
                            <Input
                                id="number"
                                type="number"
                                bind:value={value_submit}
                                min="0"
                                step="1"
                                style="margin-left: 5px;"
                            />
                            <span style="margin-left: 15px;">{submit_amount_label}</span>
                        </div>
                        {#if ! hide_submit_info}
                            <Badge type="primary" rounded>{submit_info}</Badge>
                        {/if}
                        <Button on:click={function_submit} disabled={isSubmitting} style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;">
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </Button>  
                    {/if}
                </div>
            </div>
        {/if}

    </div>
</div>

<style>

    .result {
        margin-top: 1rem;
    }

    .error {
        color: red;
    }

    .copy-msg {
        color: #28a745;
    }

    .back {
        margin-top: 15px;
        margin-left: 3.5rem;
        margin-bottom: 0rem;
    }

    .project-detail {
        height: 75vh;
        margin-left: 0.5rem;
        padding: 1.5rem;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 2rem;
        overflow-y: scroll;
        overflow-x: hidden;
        scrollbar-width: none;
        scrollbar-color: rgba(255, 255, 255, 0.13) rgba(0, 0, 0, 0.479);
    }

    .details, .extra {
        width: 100%;
        margin-bottom: 1.5rem;
    }

    @media (min-width: 768px) {
        .project-detail {
            flex-direction: row;
            overflow-y: scroll;
            overflow-x: hidden;
            scrollbar-color: rgba(255, 255, 255, 0.13) rgba(0, 0, 0, 0.479);
        }
        
        .details {
            width: 30vw; 
        }

        .extra {
            margin-left: auto;
            margin-right: auto;
        }
    }

    @media (max-height: 900px) {
        .project-detail {
            height: 65vh;
            overflow-y: scroll;
            overflow-x: hidden;
            scrollbar-color: rgba(255, 255, 255, 0.13) rgba(0, 0, 0, 0.479);
        }
    }

    .actions {
        margin-top: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .action-group {
        padding: 0.1rem;
        flex: 1;
    }

    .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }

    .action-buttons :global(button) {
        padding: 0.25rem 1rem;
        font-size: 1rem;
    }

    .actions-form {
        position: relative;
        margin-top: 1rem;
        padding: 1rem;
        border-radius: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .close-button {
        position: absolute;
        top: 10px;
        right: 15px;
        background-color: transparent;
        border: none;
        font-size: 24px;
        cursor: pointer;
    }

    .centered-form {
        width: 100%;
        max-width: 500px;
        display: flex;
        align-items: center;
        flex-direction: column;
        gap: 1rem;
    }

    .timeleft {
        margin-bottom: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .timeleft-label {
        font-size: 30px;
        text-align: center;
        margin-bottom: 1rem;
    }

    .timeleft > span {
        font-size: 30px;
    }

    .progress {
        margin-bottom: 1rem;
        min-height: 1rem;
    }

    .item {
        width: 100px;
        height: 100px;
        padding: 10px 0px 5px 0px;
        text-align: center;
        display: inline-block;
        margin: 5px;
        border: 3px solid #ddd;
        border-radius: 5px;
    }

    .item > div {
        font-size: 40px;
        animation: fade 3s;
        line-height: 30px;
        margin-top: 5px;
    }

    .item > div > h3 {
        margin-top: 15px;
        font-size: 20px;
        font-weight: normal;
    }
</style>