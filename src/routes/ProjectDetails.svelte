<script lang="ts">
    import { type Project, is_ended, min_raised } from "$lib/common/project";
    import { sha256 } from "$lib/common/utils";
    import { exchange } from "$lib/ergo/exchange";
    import { withdraw } from "$lib/ergo/withdraw";
    import { rebalance } from "$lib/ergo/rebalance";
    import { address, connected, project_detail } from "$lib/common/store";
    import { Button, Progress, NumberInput, Badge } from "spaper";
    import { block_to_time } from "$lib/common/countdown";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { web_explorer_uri } from '$lib/ergo/envs';

    // Define 'project' as a prop of type Project
    let project: Project = $project_detail;

    let platform = new ErgoPlatform();

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let currentVal = project.amount_sold;
    let min = project.minimum_amount;
    let max = project.total_amount;
    let percentage =  parseInt(((currentVal/max)*100).toString())
    let typeProgress = 'secondary';
    if(currentVal < min) {
        typeProgress = 'danger'; 
    } else if(currentVal >= max) {
        typeProgress = 'success';
    }

    // States for amounts
    let show_submit = false;
    let label_submit = "";
    let function_submit = null;
    let value_submit = 0;
    let submit_info = "";
    let hide_submit_info = false;

    $: submit_info = Number(value_submit*project.exchange_rate/1000000000).toString() + "ERGs in total."

    // Project owner actions
    function setupAddTokens() {
        label_submit = "How many tokens do you want to add?";
        function_submit = add_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
    }

    function add_tokens() {
        console.log("Adding tokens:", value_submit);
        rebalance(project, value_submit);
        show_submit = false;
    }

    function setupWithdrawTokens() {
        label_submit = "How many tokens do you want to withdraw?";
        function_submit = withdraw_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
    }

    function withdraw_tokens() {
        console.log("Withdrawing tokens:", value_submit);
        rebalance(project, (-1) * value_submit);
        show_submit = false;
    }

    function setupWithdrawErg() {
        label_submit = "How many ERGs do you want to withdraw?";
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
    }

    function withdraw_erg() {
        console.log("Withdrawing ERGs:", value_submit);
        withdraw(project, value_submit);
        show_submit = false;
    }

    // User actions
    function setupBuy() {
        label_submit = "With how many tokens do you want to contribute?";
        function_submit = buy;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
    }

    async function buy() {
        console.log("Buying tokens:", value_submit);

        isSubmitting = true;

        try {
            const result = await platform.exchange(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while buying some tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupRefund() {
        label_submit = "How many tokens do you want to refund?";
        function_submit = refund;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
    }

    function refund() {
        console.log("Refunding tokens:", value_submit);
        exchange(project, (-1)* value_submit);
        show_submit = false;
    }

    // Function to handle sharing the project
    function shareProject() {
        console.log("Sharing project link:", project.link);
    }

    // Function to close the detail page
    function closePage() {
        targetDate = 0;
        clearInterval(countdownInterval);
        project_detail.set(null);
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
        is_owner = $connected && await sha256($address ?? "") === project.owner;
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

        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((diff % (1000 * 60)) / 1000);

        // Asignamos los valores a los elementos del DOM
        const daysElement = document.getElementById('days');
        const hoursElement = document.getElementById('hours');
        const minutesElement = document.getElementById('minutes');
        const secondsElement = document.getElementById('seconds');

        // Verificamos que los elementos existen antes de asignarles valores
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

</script>

<div class="back">
    <Button style="background-color: #FFB347; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;" on:click={closePage}>
        &lt; Go to main
    </Button>
</div>

<!-- Main Project Detail Page -->
<div class="project-detail">
    <div class="details">
        <p>{project.content.description.length > 300 ? project.content.description.slice(0, 300) + "..." : project.content.description}</p>
        <p><strong>Limit date:</strong> {limit_date}</p>
        <p><strong>Block Limit:</strong> {project.block_limit}</p>
        <p><strong>Current Amount:</strong> {project.current_amount} tokens</p>
        <p><strong>Tokens sold:</strong> {project.amount_sold} tokens</p>
        <p><strong>Tokens refunded:</strong> {project.refunded_amount} tokens</p>
        <p><strong>Exchange Rate:</strong> {project.exchange_rate/1000000000} ERG/tokens</p>
       <!-- <p><strong>ERGs collected (included refuned or withdraw):</strong> {project.collected_value/1000000000} ERG</p>  -->
        <p><strong>Current ERG balance:</strong> {project.current_value/1000000000} ERG</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes" : "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes" : "No"}</p>
        <p><strong>Owner hash:</strong> {project.owner.slice(0, 15)}</p>

        <!-- Action Buttons -->
        <div class="actions">
            <!-- Project owner actions -->
            {#if is_owner}
                <div class="action-group">
                    <span class="group-label">Owner:</span>
                    <div class="action-buttons">
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupAddTokens}>
                            Add tokens
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawTokens}>
                            Withdraw tokens
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawErg} disabled={!(deadline_passed && is_min_raised)}>
                            Withdraw ERGs
                        </Button>
                    </div>
                </div>
            {/if}

            <!-- User actions -->
            {#if $connected}
                <div class="action-group">
                    <span class="group-label">User:</span>
                    <div class="action-buttons">
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupBuy} disabled={!(project.total_amount !== project.amount_sold)}>
                            Contribute
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={setupRefund} disabled={!(deadline_passed && !is_min_raised)}>
                            Refund
                        </Button>
                        <Button style="background-color: orange; color: black; border: none;" on:click={shareProject}>
                            Share
                        </Button>
                    </div>
                </div>
            {/if}
        </div>

    </div>

    <div class="extra">
        <div class="timeleft">
            <span>TIME LEFT:</span>
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
            {#if project.amount_sold !== project.total_amount}
                <Progress value="{percentage}" type="{typeProgress}" style="color: black;" />
            {:else}
                <Progress infinite type="primary" />
            {/if}
        </div>
        
        <div style="display: flex; justify-content: space-between; color: white;">
            <span style="flex: 1; text-align: left;">Minimum Amount: {min}</span>
            <span style="flex: 1; text-align: center;">Current Amount Sold: {currentVal}</span>
            <span style="flex: 1; text-align: right;">Maximum Amount: {max}</span>
        </div>

        <!-- Input field and submit button for actions -->
        {#if show_submit}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="actions-form">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="close-button" on:click={close_submit_form}>
                    &times;
                </div>
                <div class="centered-form">
                    {#if transactionId}
                        <div class="result">
                            <p>
                                <strong>Transaction ID:</strong>
                                <a href="{web_explorer_uri + transactionId}" target="_blank" rel="noopener noreferrer" style="color: #ffa500;">
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
                        <label>{label_submit}</label>
                        <div style="display: flex; align-items: center;">
                            <input
                                type="number"
                                bind:value={value_submit}
                                min="0"
                                step="1"
                                style="margin-left: 5px;"
                            />
                            <span style="margin-left: 15px;">tokens</span>
                        </div>
                        {#if hide_submit_info}
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

    .back {
        margin-top: 15px;
        margin-left: 3.5rem;
        margin-bottom: 0rem;
    }

    .project-detail {
        margin-left: 2rem;
        padding: 1.5rem;
        border-radius: 8px;
        color: #ddd;
        display: flex;
        flex-direction: row;
        gap: 2rem;
    }

    .details {
        width: 30vw;
        height: max-content;
    }

    .extra {
        width: 50vw;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .actions {
        margin-top: 3rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .action-group {
        padding: 0.5rem;
        border-left: 2px solid rgba(255, 255, 255, 0.2);
    }

    .group-label {
        color: #ddd;
        font-size: 0.9rem;
        opacity: 0.8;
        margin-left: 0.5rem;
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
        margin-top: 8rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.05);
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
        color: rgb(255, 255, 255);
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
    }

    .timeleft > span {
        font-size: 30px;
    }

    .progress {
        margin-bottom: 1rem;
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