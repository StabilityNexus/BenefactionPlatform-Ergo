<script lang="ts">
    import { type Project, is_ended, max_raised, min_raised } from "$lib/common/project";
    import { address, connected, project_detail, project_token_amount, temporal_token_amount, timer } from "$lib/common/store";
    import { Progress } from "$lib/components/ui/progress";
    import { Button } from "$lib/components/ui/button";
    import { block_to_time } from "$lib/common/countdown";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { web_explorer_uri_tkn, web_explorer_uri_tx } from '$lib/ergo/envs';
    import { mode } from "mode-watcher";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Badge, badgeVariants } from "$lib/components/ui/badge/index.js";
    import { get } from "svelte/store";

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
    let info_type_to_show: "buy"|"dev"|"dev-collect"|"" = "";
    let function_submit = null;
    let value_submit = 0;
    let submit_info = "";
    let hide_submit_info = false;
    let submit_amount_label = "";

    $: submit_info = Number(value_submit * project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '') + "ERGs in total."

    // Project owner actions
    function setupAddTokens() {
        info_type_to_show = "dev";
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
        info_type_to_show = "dev";
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
        info_type_to_show = "dev-collect";
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
        info_type_to_show = "buy";
        label_submit = "How much do you want to contribute?";
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
        info_type_to_show = "";
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
        info_type_to_show = "";
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

    function close_submit_form() {
        show_submit = false;
        transactionId = null;
        errorMessage = null;
        isSubmitting = false;
    }

    let deadline_passed = false;
    let is_min_raised = false;
    let is_max_raised = false;
    let limit_date = "";
    async function load() {
        deadline_passed = await is_ended(project);
        is_min_raised = await min_raised(project)
        is_max_raised = await max_raised(project);
        limit_date = new Date(await block_to_time(project.block_limit, project.platform)).toLocaleString();
    }
    load();

    let is_owner = false;
    async function checkIfIsOwner() {
        is_owner = $connected && await $address === project.constants.owner;
    }
    checkIfIsOwner();

    let timerValue = get(timer);
    let targetDate = timerValue.target;
    let countdownInterval = timerValue.countdownInterval;

    async function setTargetDate() {
        targetDate = await block_to_time(project.block_limit, project.platform);
    }
    setTargetDate()

    let progressColor = 'white';
    let countdownAnimation = false;

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

        if (is_min_raised) {
            progressColor = '#A8E6A1';  // green
        } else {
            if (diff <= 0) {
                progressColor = '#FF6F61';  // red
                countdownAnimation = false;
            } else if (diff < 24 * 60 * 60 * 1000) {
                progressColor = '#FFF5A3';  // yelow
                countdownAnimation = true;
            } else {
                progressColor = 'white';
                countdownAnimation = false;
            }
        }
    }

    countdownInterval = setInterval(updateCountdown, 1000);
    timer.update(current => ({ ...current, countdownInterval }));

    async function get_user_project_tokens(){
        var user_project_tokens = (await platform.get_balance(project.token_id)).get(project.token_id) ?? 0;
        project_token_amount.set((user_project_tokens/Math.pow(10, project.token_details.decimals)).toString()+" "+project.token_details.name);
        
        var temporal_tokens = (await platform.get_balance(project.project_id)).get(project.project_id) ?? 0;
        temporal_token_amount.set(temporal_tokens/Math.pow(10, project.token_details.decimals))
    }
    get_user_project_tokens()

</script>

<!-- Main Project Detail Page -->
<div class="project-detail flex flex-col md:flex-row" style="{$mode === 'light' ? 'color: black;' : 'color: #ddd;'}">
    <!-- Columna izquierda - Descripción -->
    <div class="details w-full md:w-1/2 space-y-4">
        <p>
            <em class="text-2xl font-bold tracking-wide">
                {project.content.title}
            </em>
        </p>
        <div hidden>
        <a href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es" target="_blank"
            class={badgeVariants({ variant: "outline" })}>Contract version: {project.version.replace("_", ".")}</a>
        </div>
        <p>{project.content.description}</p>
        {#if project.content.link !== null}
            <p>More info <a href="{project.content.link}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">here</a>.</p>
        {/if}

        <p>Proof-of-Funding Token:
            <a href="{web_explorer_uri_tkn + project.token_id}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">
               {project.token_details.name}
            </a>
        </p>

        <div 
            class="bg-cover bg-center bg-no-repeat h-64" 
            style="background-image: url({project.content.image});"
        ></div>

        <Button class="bg-gray-500 text-black border-none mt-8" on:click={shareProject}>
            Share
        </Button>
        {#if showCopyMessage}
            <div class="copy-msg mt-4 text-green-500">
                Project page url copied to clipboard!
            </div>
        {/if}
    </div>

    <div class="extra w-full md:w-1/2 mt-4 md:mt-0">
        <div class="timeleft {deadline_passed ? 'ended' : (countdownAnimation ? 'soon' : '')}">
            <span class="timeleft-label">
                {#if deadline_passed}
                  TIME'S UP!  
                  {#if ! is_max_raised}
                  <small class="secondary-text">... But you can still contribute!</small>
                  {/if}
                {:else}
                  TIME LEFT
                {/if}
              </span>
            <div>
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
            <small>Until {limit_date} UTC on block {project.block_limit}</small>
          </div>
        <div class="progress">
            <Progress value="{percentage}" color="{progressColor}" />
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


        {#if $connected}
        <!-- User actions -->
        <div class="user-actions">
          <div class="action-row">
            <Button style="background-color: orange; color: black; border: none;" on:click={setupBuy} disabled={!(project.total_pft_amount !== project.sold_counter)}>
              Contribute
            </Button>
          </div>
          <div class="action-row">
            <Button style="background-color: orange; color: black; border: none;" on:click={setupRefund} disabled={!(deadline_passed && !is_min_raised)}>
              Get a Refund
            </Button>
            <Button style="background-color: orange; color: black; border: none;" on:click={setupTempExchange} disabled={!(is_min_raised)}>
              Collect {project.token_details.name}
            </Button>
          </div>
        </div>
      {/if}
      
      {#if $connected && is_owner}
        <!-- Project owner actions -->
        <div class="owner-actions">
          <div class="action-row">
            <Button style="background-color: orange; color: black; border: none;" on:click={setupAddTokens}>
              Add {project.token_details.name}
            </Button>
            <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawTokens}>
              Withdraw {project.token_details.name}
            </Button>
          </div>
          <div class="action-row">
            <Button style="background-color: orange; color: black; border: none;" on:click={setupWithdrawErg} disabled={!is_min_raised}>
              Collect {platform.main_token}
            </Button>
          </div>
        </div>
      {/if}

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
                        <div class="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 w-full">
                            <div class="md:w-1/6 text-center md:text-left">
                                {#if info_type_to_show === "buy"}
                                    <p>
                                        <strong>Exchange Rate:</strong> 
                                        {(project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '')} 
                                        {platform.main_token}/{project.token_details.name}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev-collect"}
                                    <p><strong>Current ERG balance:</strong> {project.current_value / Math.pow(10, 9)} {platform.main_token}</p>
                                {/if}
                                {#if info_type_to_show === "dev"}
                                    <p><strong>Current PFT balance:</strong> {project.current_pft_amount / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</p>
                                {/if}
                            </div>
                        
                            <div class="md:w-4/6 flex flex-col items-center">
                                <div class="w-full max-w-xs space-y-4 mx-auto">
                                    <!-- svelte-ignore a11y-label-has-associated-control -->
                                    <Label for="number" class="block text-center mb-3">{label_submit}</Label>
                                    <div class="flex items-center mt-3">
                                        <Input
                                            id="number"
                                            type="number"
                                            bind:value={value_submit}
                                            min="0"
                                            step="1"
                                            class="flex-1 ml-2"
                                        />
                                        <span class="ml-4">{submit_amount_label}</span>
                                    </div>
                                    
                                    {#if ! hide_submit_info}
                                        <div class="mt-2 text-center">
                                            <Badge type="primary" rounded>{submit_info}</Badge>
                                        </div>
                                    {/if}
                                    
                                    <div class="mt-6 text-center">
                                        <Button 
                                            on:click={function_submit} 
                                            disabled={isSubmitting} 
                                            style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;"
                                        >
                                            {isSubmitting ? 'Submitting...' : 'Submit'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        
                            <div class="md:w-1/6 hidden md:block"></div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

    </div>
</div>

<style>
    .secondary-text {
    display: block;
    font-size: 0.7em; 
    margin-top: 0.2em;
    }

    @keyframes pulse {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.05); }
        100% { transform: scale(1); }
    }

    .timeleft.soon .item {
        animation: pulse 1s infinite;
        border-color: yellow;
        color: yellow;
    }

    .timeleft.ended {
        opacity: 0.3;
    }

    .result {
        margin-top: 1rem;
    }

    .error {
        color: red;
    }

    .copy-msg {
        color: #28a745;
    }

    .project-detail {
        height: calc(100vh - 120px);
        margin: 0.5rem 0.5rem 40px 0.5rem;
        padding: 1.5rem;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 2rem;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.13) rgba(255, 255, 255, 0.479);
        position: relative;
    }

    .details, .extra {
        width: 100%;
        margin-bottom: 1.5rem;
    }

    .details .bg-cover {
        height: 300px;
        width: 100%;
        background-size: contain;
        background-position: center;
        margin-bottom: 1rem;
    }

    @media (min-width: 1000px) {
        .project-detail {
            flex-direction: row;
            gap: 2rem;
            height: calc(100vh - 120px);
        }
        
        .details {
            width: 40%;
            padding-right: 1rem;
            overflow-y: auto;
        }

        .extra {
            width: 60%;
            padding-left: 1rem;
            overflow-y: auto;
        }
        
        .timeleft {
            margin-top: 0;
        }
        
        .progress {
            margin: 1rem 0;
        }
    }

    @media (max-width: 1000px) {
        .project-detail {
            height: calc(100vh - 206px);
        }
    }

    .user-actions, .owner-actions {
        margin-top: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    
    .action-row {
        display: flex;
        justify-content: center;
        gap: 1rem;
        width: 100%;
        margin-bottom: 1rem;
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
        max-width: 80%;
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