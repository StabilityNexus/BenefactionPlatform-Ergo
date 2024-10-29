<script lang="ts">
    import { page } from '$app/stores';
    import { type Project, is_ended, min_raised } from "$lib/common/project";
    import { sha256 } from "$lib/common/utils";
    import { exchange } from "$lib/ergo/exchange";
    import { withdraw } from "$lib/ergo/withdraw";
    import { rebalance } from "$lib/ergo/rebalance";
    import { address, connected, project_detail } from "$lib/common/store";
    import { Button, Progress, NumberInput } from "spaper";
    import { block_to_time } from "$lib/common/countdown";
    import { ErgoPlatform } from "$lib/ergo/platform";

    // Define 'project' as a prop of type Project
    let project: Project = $project_detail;

    let platform = new ErgoPlatform();

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

    // Project owner actions
    function setupAddTokens() {
        label_submit = "Tokens to add";
        function_submit = add_tokens;
        value_submit = 0;
        show_submit = true;
    }

    function add_tokens() {
        console.log("Adding tokens:", value_submit);
        rebalance(project, value_submit);
        show_submit = false;
    }

    function setupWithdrawTokens() {
        label_submit = "Tokens to withdraw";
        function_submit = withdraw_tokens;
        value_submit = 0;
        show_submit = true;
    }

    function withdraw_tokens() {
        console.log("Withdrawing tokens:", value_submit);
        rebalance(project, (-1) * value_submit);
        show_submit = false;
    }

    function setupWithdrawErg() {
        label_submit = "ERGs to withdraw";
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
    }

    function withdraw_erg() {
        console.log("Withdrawing ERGs:", value_submit);
        withdraw(project, value_submit);
        show_submit = false;
    }

    // User actions
    function setupBuy() {
        label_submit = "Tokens to buy";
        function_submit = buy;
        value_submit = 0;
        show_submit = true;
    }

    function buy() {
        console.log("Buying tokens:", value_submit);
        exchange(project, value_submit);
        show_submit = false;
    }

    function setupRefund() {
        label_submit = "Tokens to refund";
        function_submit = refund;
        value_submit = 0;
        show_submit = true;
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

    let deadline_passed = false;
    let is_min_raised = false;
    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project);
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
    <Button class="btn-primary" on:click={closePage}>&lt; Go to main</Button>
</div>

<!-- Main Project Detail Page -->
<div class="project-detail">
    <div class="details">
        <p><strong>Block Limit:</strong> {project.block_limit}</p>
        <p><strong>Minimum Amount:</strong> {project.minimum_amount}</p>
        <p><strong>Total Amount:</strong> {project.total_amount}</p>
        <p><strong>Exchange Rate:</strong> {project.exchange_rate/1000000000} ERG/tokens</p>
        <p><strong>ERGs collected:</strong> {project.value/1000000000} ERG</p>
        <p><strong>Tokens sold:</strong> {project.amount_sold}</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes" : "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes" : "No"}</p>
        {#if !is_owner}
            <p><strong>Owner hash:</strong> {project.owner.slice(0, 6)}</p>
        {/if}

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
                        {#if deadline_passed && is_min_raised}
                            <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawErg}>
                                Withdraw ERGs
                            </Button>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- User actions -->
            {#if $connected}
                <div class="action-group">
                    <span class="group-label">User:</span>
                    <div class="action-buttons">
                        {#if project.total_amount !== project.amount_sold}
                            <Button style="background-color: orange; color: black; border: none;" on:click={setupBuy}>
                                Buy
                            </Button>
                        {/if}
                        {#if deadline_passed && !is_min_raised}
                            <Button style="background-color: orange; color: black; border: none;" on:click={setupRefund}>
                                Refund
                            </Button>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- General actions -->
            <div class="action-group">
                <span class="group-label">General:</span>
                <div class="action-buttons">
                    <Button style="background-color: orange; color: black; border: none;" on:click={shareProject}>
                        Share
                    </Button>
                </div>
            </div>
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
            <span style="flex: 1; text-align: center;">Current Amount: {currentVal}</span>
            <span style="flex: 1; text-align: right;">Maximum Amount: {max}</span>
        </div>

        <!-- Input field and submit button for actions -->
        {#if show_submit}
            <div class="actions-form">
                <div class="centered-form">
                    <NumberInput
                        bind:value={value_submit}
                        label={label_submit}
                        min={0}
                    />
                    <Button style="background-color: orange; color: black; border: none; width: 100%; padding: 0.25rem 1rem; font-size: 0.9rem; margin-top: 1rem;" on:click={function_submit}>
                        Submit
                    </Button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
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
        margin-top: 4rem;
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
        font-size: 0.9rem;
    }

    .actions-form {
        margin-top: 4rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .centered-form {
        width: 100%;
        max-width: 300px;
        display: flex;
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