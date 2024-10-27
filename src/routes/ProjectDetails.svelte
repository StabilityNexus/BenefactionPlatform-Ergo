<script lang="ts">
    import { type Project, is_ended, min_raised } from "$lib/common/project";
    import { sha256 } from "$lib/ergo/sha256";
    import { exchange } from "$lib/ergo/exchange";
    import { withdraw } from "$lib/ergo/withdraw";
    import { rebalance } from "$lib/ergo/rebalance";
    import { address, connected, project_detail } from "$lib/common/store";
    import { Button, Progress, NumberInput } from "spaper";
    import { block_to_time } from "$lib/common/countdown";

    // Define 'project' as a prop of type Project
    let project: Project = $project_detail;

    // TODO Valores ficticios
    let currentVal = 2000;
    let min = 5000;
    let max = 10000;
    let percentage = (currentVal * 100 / (min * 2));
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
        // Implement sharing functionality here (e.g., using navigator.share)
    }

    // Function to close the detail page
    function closePage() {
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
        targetDate = await block_to_time(project.block_limit);
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
        <p><strong>Exchange Rate:</strong> {project.exchange_rate}</p>
        <p><strong>ERGs collected:</strong> {project.value}</p>
        <p><strong>Tokens sold:</strong> {project.amount_sold}</p>
        <p><strong>Deadline passed:</strong> {deadline_passed ? "Yes" : "No"}</p>
        <p><strong>Min value raised:</strong> {is_min_raised ? "Yes" : "No"}</p>

        <!-- Action Buttons -->
        <div class="actions">
            <!-- Project owner actions -->
            {#if is_owner}
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
            {:else}
                <p><strong>Owner (sha256):</strong> {project.owner}</p>
            {/if}

            <!-- User actions -->
            {#if $connected}
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
            {/if}

            <!-- General actions -->
            <Button style="background-color: orange; color: black; border: none;" on:click={shareProject}>
                Share
            </Button>
        </div>

        <!-- Input field and submit button for actions -->
        {#if show_submit}
            <div>
                <NumberInput
                    bind:value={value_submit}
                    label={label_submit}
                    min="0"
                />
                <Button style="background-color: orange; color: black; border: none;" on:click={function_submit}>
                    Submit
                </Button>
            </div>
        {/if}
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
            <Progress value="{percentage}" type="{typeProgress}" striped style="color: black;">Current: {currentVal}</Progress>
        </div>
        
        <br/>
        <span style="color:white">
            Minimum Amount: {min} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            Maximum Amount: {max}
        </span>
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
    }

    .details {
        width: 30vw;
    }

    .btn-close {
        background-color: transparent; /* Transparent background for close button */
        color: white; /* White text for visibility */
        border: none; /* No border */
        font-size: 1.5rem; /* Larger text size */
        cursor: pointer; /* Pointer cursor on hover */
        position: absolute; /* Position it in the top left */
        top: 1rem;
        left: 1rem;
    }

    .actions {
        margin-top: 1rem;
    }

    .btn-primary {
        background-color: yellow; /* Change button background to yellow */
        color: black; /* Change button text color to black */
        border: none; /* Remove border */
        padding: 0.5rem 1rem;
        border-radius: 4px;
        margin-right: 1rem;
        cursor: pointer; /* Pointer cursor for buttons */
    }

    .btn-primary:hover {
        background-color: #ffeb3b; /* Lighter yellow on hover */
    }

    .extra {
        width: 50vw;
    }

    .timeleft {
        margin-bottom: 50px;
    }

    .timeleft>span{
        font-size: 30px;
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

    .item>div{
        font-size: 40px;
        animation: fade 3s;
        line-height: 30px;
        margin-top: 5px;
    }
    .item>div>h3 {
        margin-top: 15px;
        font-size: 20px;
        font-weight: normal;
    }
</style>
