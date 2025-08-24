<script lang="ts">
    import { type Project, is_ended, max_raised, min_raised } from "$lib/common/project";
    import { address, connected, project_detail, project_token_amount, temporal_token_amount, timer, balance } from "$lib/common/store";
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

    import { onDestroy } from 'svelte';


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
    let function_submit: ((event?: any) => Promise<void>) | null = null;
    let value_submit = 0;
    let submit_info = "";
    let hide_submit_info = false;
    let submit_amount_label = "";

    $: submit_info = (() => {
        const isERGBase = !project.base_token_id || project.base_token_id === "";
        if (isERGBase) {
            return Number(value_submit * project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '') + " ERGs in total.";
        } else {
            // For non-ERG base tokens, show the base token amount
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            const baseTokenName = project.base_token_details?.name || "tokens";
            return Number(value_submit * project.exchange_rate / Math.pow(10, baseTokenDecimals)).toFixed(10).replace(/\.?0+$/, '') + ` ${baseTokenName} in total.`;
        }
    })()

    
    let daysValue = 0;
    let hoursValue = 0;
    let minutesValue = 0;
    let secondsValue = 0;

    // Balance-aware variables
    let userErgBalance = 0; // User's ERG balance
    let userProjectTokenBalance = 0; // User's project token balance  
    let userTemporalTokenBalance = 0; // User's temporal token balance
    let maxContributeAmount = 0; // Maximum amount user can contribute
    let maxRefundAmount = 0; // Maximum amount user can refund
    let maxCollectAmount = 0; // Maximum amount user can collect
    let maxWithdrawTokenAmount = 0; // Maximum amount project owner can withdraw
    let maxWithdrawErgAmount = 0; // Maximum amount project owner can withdraw

    async function getWalletBalances() {
        // Get ERG balance
        userErgBalance = ($balance || 0) / Math.pow(10, 9);
        
        // Fetch project token balances
        const userTokens = await platform.get_balance();
        
        // Get project token balance
        userProjectTokenBalance = (userTokens.get(project.token_id) || 0) / Math.pow(10, project.token_details.decimals);
        
        // Get temporal token balance
        userTemporalTokenBalance = (userTokens.get(project.project_id) || 0) / Math.pow(10, project.token_details.decimals);
        
        // Calculate maximum contribution amount based on base token balance and available tokens
        const isERGBase = !project.base_token_id || project.base_token_id === "";
        let balanceLimitedAmount;
        
        if (isERGBase) {
            balanceLimitedAmount = userErgBalance / (project.exchange_rate * Math.pow(10, project.token_details.decimals - 9));
        } else {
            // For non-ERG base tokens, get user's base token balance
            const baseTokenBalance = (userTokens.get(project.base_token_id) || 0) / Math.pow(10, project.base_token_details?.decimals || 0);
            balanceLimitedAmount = baseTokenBalance / (project.exchange_rate / Math.pow(10, project.base_token_details?.decimals || 0));
        }
        
        const projectLimitedAmount = (project.total_pft_amount - project.sold_counter) / Math.pow(10, project.token_details.decimals);
        maxContributeAmount = Math.min(balanceLimitedAmount, projectLimitedAmount);
        
        // Calculate maximum refund amount based on user's project tokens
        maxRefundAmount = userProjectTokenBalance;
        
        // Calculate maximum collect amount based on user's temporal tokens
        maxCollectAmount = userTemporalTokenBalance;
        
        // For project owner
        maxWithdrawTokenAmount = project.current_pft_amount / Math.pow(10, project.token_details.decimals);
        
        // Calculate max withdraw amount based on base token type
        if (isERGBase) {
            maxWithdrawErgAmount = project.current_value / Math.pow(10, 9);
        } else {
            // For non-ERG base tokens, find the base token amount in project box assets
            let baseTokenAmount = 0;
            for (const asset of project.box.assets) {
                if (asset.tokenId === project.base_token_id) {
                    baseTokenAmount = Number(asset.amount);
                    break;
                }
            }
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            maxWithdrawErgAmount = baseTokenAmount / Math.pow(10, baseTokenDecimals);
        }
    }

    // Add balance check after connection state changes
    $: if ($connected) {
        getWalletBalances();
    }

    // Real-time updates when value_submit changes
    $: if (value_submit && show_submit) {
        // Update max amounts reactively when input changes
        if (function_submit === buy && value_submit > maxContributeAmount) {
            value_submit = maxContributeAmount;
        } else if (function_submit === refund && value_submit > maxRefundAmount) {
            value_submit = maxRefundAmount;
        } else if (function_submit === temp_exchange && value_submit > maxCollectAmount) {
            value_submit = maxCollectAmount;
        } else if (function_submit === withdraw_tokens && value_submit > maxWithdrawTokenAmount) {
            value_submit = maxWithdrawTokenAmount;
        } else if (function_submit === withdraw_erg && value_submit > maxWithdrawErgAmount) {
            value_submit = maxWithdrawErgAmount;
        }
    }

    // Project owner actions
    function setupAddTokens() {
        getWalletBalances(); // Refresh balances before opening modal
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
        getWalletBalances(); // Refresh balances before opening modal
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
        getWalletBalances(); // Refresh balances before opening modal
        info_type_to_show = "dev-collect";
        const isERGBase = !project.base_token_id || project.base_token_id === "";
        const baseTokenName = isERGBase ? "ERGs" : (project.base_token_details?.name || "tokens");
        label_submit = `How many ${baseTokenName} do you want to withdraw?`;
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = baseTokenName;
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
        getWalletBalances(); // Refresh balances before opening modal
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
        getWalletBalances(); // Refresh balances before opening modal
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
        getWalletBalances(); // Refresh balances before opening modal
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
        const connected = await $connected;
        const address = await $address; 
        is_owner = connected && await address === project.constants.owner;
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
            // Use reactive variables instead of DOM manipulation
            daysValue = Math.floor(diff / (1000 * 60 * 60 * 24));
            hoursValue = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            minutesValue = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            secondsValue = Math.floor((diff % (1000 * 60)) / 1000);
        } 
        else {
            daysValue = 0;
            hoursValue = 0;
            minutesValue = 0;
            secondsValue = 0;
        }

        if (is_min_raised) {
            progressColor = '#A8E6A1';  
        } else {
            if (diff <= 0) {
                progressColor = '#FF6F61';  
                countdownAnimation = false;
            } else if (diff < 24 * 60 * 60 * 1000) {
                progressColor = '#FFF5A3';  
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
    
    // Call getWalletBalances initially to set up values
    getWalletBalances();
    
    onDestroy(() => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    });

</script>

<!-- Main Project Detail Page -->
<div class="project-detail" style="{$mode === 'light' ? 'color: black;' : 'color: #ddd;'}">
    <div class="project-container">
        <!-- Left Column - Project Information -->
        <div class="project-info">
            <div class="project-header">
                <h1 class="project-title">{project.content.title}</h1>
                <div class="project-badge" style="display: none;">
        <a href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es" target="_blank"
            class={badgeVariants({ variant: "outline" })}>Contract version: {project.version.replace("_", ".")}</a>
                </div>
            </div>
            
            <div class="project-image" 
                style="background-image: url({project.content.image});">
            </div>

            <div class="project-description">
        <p>{project.content.description}</p>
        {#if project.content.link !== null}
            <p>More info <a href="{project.content.link}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">here</a>.</p>
        {/if}
            </div>

            <div class="token-info">
        <p>Proof-of-Funding Token:
            <a href="{web_explorer_uri_tkn + project.token_id}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">
               {project.token_details.name}
            </a>
        </p>
            </div>

            <div class="share-button">
                <Button class="share-btn" on:click={shareProject}>
                    Share Project
        </Button>
        {#if showCopyMessage}
                    <div class="copy-msg">
                Project page url copied to clipboard!
            </div>
        {/if}
            </div>
    </div>

        <!-- Right Column - Project Stats & Actions -->
        <div class="project-stats">
            <!-- Countdown Timer -->
            <div class="countdown-container">
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
                    <div class="countdown-items">
              <div class="item">
                <div>{daysValue}</div>
                <div class="h3"><h3>Days</h3></div>
              </div>
              <div class="item">
                <div>{hoursValue}</div>
                <div class="h3"><h3>Hours</h3></div>
              </div>
              <div class="item">
                <div>{minutesValue}</div>
                <div class="h3"><h3>Minutes</h3></div>
              </div>
              <div class="item">
                <div>{secondsValue}</div>
                <div class="h3"><h3>Seconds</h3></div>
              </div>
            </div>
                    <small class="deadline-info">Until {limit_date} UTC on block {project.block_limit}</small>
          </div>
        </div>

            <!-- Progress Bar -->
            <div class="progress-container">
                <Progress value="{percentage}" color="{progressColor}" />
                
                <div class="amounts-info">
                    <div class="amount-item">
                        <div class="amount-label">Minimum Amount</div>
                        <div class="amount-value">{min / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                        <div class="amount-ergs">{(() => {
                            const isERGBase = !project.base_token_id || project.base_token_id === "";
                            if (isERGBase) {
                                return ((min * project.exchange_rate) / Math.pow(10, 9)) + " " + platform.main_token;
                            } else {
                                const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                const baseTokenName = project.base_token_details?.name || "tokens";
                                return ((min * project.exchange_rate) / Math.pow(10, baseTokenDecimals)) + " " + baseTokenName;
                            }
                        })()}</div>
            </div>
            
                    <div class="amount-item current">
                        <div class="amount-label">Current Amount</div>
                        <div class="amount-value">{currentVal / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                        <div class="amount-ergs">{(() => {
                            const isERGBase = !project.base_token_id || project.base_token_id === "";
                            if (isERGBase) {
                                return ((currentVal * project.exchange_rate) / Math.pow(10, 9)) + " " + platform.main_token;
                            } else {
                                const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                const baseTokenName = project.base_token_details?.name || "tokens";
                                return ((currentVal * project.exchange_rate) / Math.pow(10, baseTokenDecimals)) + " " + baseTokenName;
                            }
                        })()}</div>
            </div>
            
                    <div class="amount-item">
                        <div class="amount-label">Maximum Amount</div>
                        <div class="amount-value">{max / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</div>
                        <div class="amount-ergs">{(() => {
                            const isERGBase = !project.base_token_id || project.base_token_id === "";
                            if (isERGBase) {
                                return ((max * project.exchange_rate) / Math.pow(10, 9)) + " " + platform.main_token;
                            } else {
                                const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                const baseTokenName = project.base_token_details?.name || "tokens";
                                return ((max * project.exchange_rate) / Math.pow(10, baseTokenDecimals)) + " " + baseTokenName;
                            }
                        })()}</div>
                    </div>
            </div>
        </div>

            <!-- User Actions -->
        {#if $connected}
            <div class="actions-section">
                <h2 class="actions-title">Actions</h2>
                <div class="action-buttons">
                    <Button 
                        class="action-btn primary" 
                        style="background-color: #FFA500; color: black;" 
                        on:click={setupBuy} 
                        disabled={!$connected || maxContributeAmount <= 0 || project.sold_counter >= project.total_pft_amount}
                        title={!$connected ? "Connect your wallet to contribute" : 
                               maxContributeAmount <= 0 ? (() => {
                                   const isERGBase = !project.base_token_id || project.base_token_id === "";
                                   if (isERGBase) {
                                       return `Need at least ${(project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(4)} ${platform.main_token} to contribute`;
                                   } else {
                                       const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                       const baseTokenName = project.base_token_details?.name || "tokens";
                                       return `Need at least ${(project.exchange_rate / Math.pow(10, baseTokenDecimals)).toFixed(4)} ${baseTokenName} to contribute`;
                                   }
                               })() :
                               project.sold_counter >= project.total_pft_amount ? "Project has reached maximum funding" :
                               `You can contribute up to ${maxContributeAmount.toFixed(4)} ${project.token_details.name}`}
                    >
                      Contribute
                    </Button>
                    {#if $connected && maxContributeAmount <= 0 && project.sold_counter < project.total_pft_amount}
                        <div class="insufficient-funds-message">
                            {#if userErgBalance <= 0}
                                Insufficient funds for contribution. You need {platform.main_token} in your wallet.
                            {:else}
                                Insufficient funds for contribution. Need at least {(() => {
                                    const isERGBase = !project.base_token_id || project.base_token_id === "";
                                    if (isERGBase) {
                                        return (project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(4) + " " + platform.main_token;
                                    } else {
                                        const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                        const baseTokenName = project.base_token_details?.name || "tokens";
                                        return (project.exchange_rate / Math.pow(10, baseTokenDecimals)).toFixed(4) + " " + baseTokenName;
                                    }
                                })()}
                            {/if}
                        </div>
                    {/if}
                    
                    <Button 
                        class="action-btn" 
                        style="background-color: #FF8C00; color: black;" 
                        on:click={setupRefund} 
                        disabled={!$connected || !(deadline_passed && !is_min_raised) || maxRefundAmount <= 0}
                        title={!$connected ? "Connect your wallet to get refund" :
                               !deadline_passed ? "Refunds available after deadline" :
                               is_min_raised ? "Refunds not available - minimum goal reached" :
                               maxRefundAmount <= 0 ? "You have no tokens to refund" :
                               `You can refund up to ${maxRefundAmount.toFixed(4)} ${project.token_details.name}`}
                    >
                      Get a Refund
                    </Button>
                    {#if $connected && maxRefundAmount <= 0 && (deadline_passed && !is_min_raised)}
                        <div class="insufficient-funds-message">
                            No tokens available for refund
                        </div>
                    {/if}
                    
                    <Button 
                        class="action-btn" 
                        style="background-color: #FF8C00; color: black;" 
                        on:click={setupTempExchange} 
                        disabled={!$connected || !is_min_raised || maxCollectAmount <= 0}
                        title={!$connected ? "Connect your wallet to collect tokens" :
                               !is_min_raised ? "Collection available after minimum goal is reached" :
                               maxCollectAmount <= 0 ? "You have no temporal tokens to collect" :
                               `You can collect up to ${maxCollectAmount.toFixed(4)} ${project.token_details.name}`}
                    >
                      Collect {project.token_details.name}
                    </Button>
                    {#if $connected && maxCollectAmount <= 0 && is_min_raised}
                        <div class="insufficient-funds-message">
                            No temporal tokens available for collection
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
      
            <!-- Project Owner Actions -->
      {#if $connected && is_owner}
            <div class="actions-section owner">
                <h2 class="actions-title">Owner Actions</h2>
                <div class="action-buttons">
                    <Button 
                        class="action-btn" 
                        style="background-color: #FF8C00; color: black;" 
                        on:click={setupAddTokens}
                    >
                      Add {project.token_details.name}
                    </Button>
                    
                    <Button 
                        class="action-btn" 
                        style="background-color: #FF8C00; color: black;" 
                        on:click={setupWithdrawTokens}
                        disabled={!$connected || maxWithdrawTokenAmount <= 0}
                        title={!$connected ? "Connect your wallet to withdraw tokens" :
                               maxWithdrawTokenAmount <= 0 ? "No tokens available for withdrawal" :
                               `You can withdraw up to ${maxWithdrawTokenAmount.toFixed(4)} ${project.token_details.name}`}
                    >
                      Withdraw {project.token_details.name}
                    </Button>
                    {#if $connected && maxWithdrawTokenAmount <= 0}
                        <div class="insufficient-funds-message">
                            No tokens available for withdrawal
                        </div>
                    {/if}
                    
                    <Button 
                        class="action-btn" 
                        style="background-color: #FF8C00; color: black;" 
                        on:click={setupWithdrawErg} 
                        disabled={!$connected || !is_min_raised || maxWithdrawErgAmount <= 0}
                        title={!$connected ? `Connect your wallet to collect ${(!project.base_token_id || project.base_token_id === "") ? "ERG" : (project.base_token_details?.name || "tokens")}` :
                               !is_min_raised ? `${(!project.base_token_id || project.base_token_id === "") ? "ERG" : (project.base_token_details?.name || "tokens")} collection available after minimum goal is reached` :
                               maxWithdrawErgAmount <= 0 ? `No ${(!project.base_token_id || project.base_token_id === "") ? "ERG" : (project.base_token_details?.name || "tokens")} available for withdrawal` :
                               `You can withdraw up to ${maxWithdrawErgAmount.toFixed(4)} ${(!project.base_token_id || project.base_token_id === "") ? platform.main_token : (project.base_token_details?.name || "tokens")}`}
                    >
                      Collect {(!project.base_token_id || project.base_token_id === "") ? platform.main_token : (project.base_token_details?.name || "tokens")}
                    </Button>
                    {#if $connected && (!is_min_raised || maxWithdrawErgAmount <= 0)}
                        <div class="insufficient-funds-message">
                            {!is_min_raised ? 'Minimum funding goal not reached' : `No ${(!project.base_token_id || project.base_token_id === "") ? "ERG" : (project.base_token_details?.name || "tokens")} available for withdrawal`}
                        </div>
                    {/if}
                </div>
            </div>
      {/if}
        </div>
    </div>

    <!-- Transaction Form Modal -->
        {#if show_submit}
    <div class="modal-overlay">
        <div class="actions-form" style="{$mode === 'light' ? 'background: white;' : 'background: #2a2a2a;'}">
            <div class="close-button" on:click={close_submit_form}>
                    &times;
                </div>
                <div class="centered-form">
                    {#if transactionId}
                        <div class="result">
                            <p>
                                <strong>Transaction ID:</strong>
                            <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" class="transaction-link">
                                    {transactionId.slice(0,16)}
                                </a>
                            </p>
                        </div>
                    {:else if errorMessage}
                        <div class="error">
                            <p>{errorMessage}</p>
                        </div>
                    {:else}
                    <div class="form-container">
                        <div class="form-info">
                                {#if info_type_to_show === "buy"}
                                    <p>
                                        <strong>Exchange Rate:</strong> 
                                        {(() => {
                                            const isERGBase = !project.base_token_id || project.base_token_id === "";
                                            if (isERGBase) {
                                                return (project.exchange_rate * Math.pow(10, project.token_details.decimals - 9)).toFixed(10).replace(/\.?0+$/, '') + " " + platform.main_token + "/" + project.token_details.name;
                                            } else {
                                                const baseTokenDecimals = project.base_token_details?.decimals || 0;
                                                const baseTokenName = project.base_token_details?.name || "tokens";
                                                return (project.exchange_rate / Math.pow(10, baseTokenDecimals)).toFixed(10).replace(/\.?0+$/, '') + " " + baseTokenName + "/" + project.token_details.name;
                                            }
                                        })()}
                                    </p>
                                    <p>
                                        <strong>Available Balance:</strong> 
                                        {userErgBalance.toFixed(4)} {platform.main_token}
                                    </p>
                                    <p>
                                        <strong>Maximum Contribution:</strong> 
                                        {maxContributeAmount.toFixed(4)} {project.token_details.name}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev-collect"}
                                    <p><strong>Current ERG balance:</strong> {project.current_value / Math.pow(10, 9)} {platform.main_token}</p>
                                    <p><strong>Maximum Withdrawal:</strong> {maxWithdrawErgAmount.toFixed(4)} {platform.main_token}</p>
                                {/if}
                                {#if info_type_to_show === "dev"}
                                    <p><strong>Current PFT balance:</strong> {project.current_pft_amount / Math.pow(10, project.token_details.decimals)} {project.token_details.name}</p>
                                    <p><strong>Maximum Withdrawal:</strong> {maxWithdrawTokenAmount.toFixed(4)} {project.token_details.name}</p>
                                {/if}
                                {#if function_submit === refund}
                                    <p><strong>Your Token Balance:</strong> {userProjectTokenBalance.toFixed(4)} {project.token_details.name}</p>
                                    <p><strong>Maximum Refund:</strong> {maxRefundAmount.toFixed(4)} {project.token_details.name}</p>
                                {/if}
                                {#if function_submit === temp_exchange}
                                    <p><strong>Your Temporal Token Balance:</strong> {userTemporalTokenBalance.toFixed(4)} APT</p>
                                    <p><strong>Maximum Collection:</strong> {maxCollectAmount.toFixed(4)} {project.token_details.name}</p>
                                {/if}
                            </div>
                        
                        <div class="form-content">
                            <Label for="amount-input" class="form-label">{label_submit}</Label>
                            <div class="input-container">
                                        <Input
                                            id="amount-input"
                                            type="number"
                                            bind:value={value_submit}
                                            min="0"
                                            max={function_submit === buy ? maxContributeAmount : 
                                                 function_submit === refund ? maxRefundAmount : 
                                                 function_submit === temp_exchange ? maxCollectAmount :
                                                 function_submit === withdraw_tokens ? maxWithdrawTokenAmount :
                                                 function_submit === withdraw_erg ? maxWithdrawErgAmount : null}
                                            step="0.001"
                                            class="form-input"
                                        />
                                <span class="input-suffix">{submit_amount_label}</span>
                                    </div>
                                    
                                    {#if ! hide_submit_info}
                                <div class="info-badge">
                                            <Badge type="primary" rounded>{submit_info}</Badge>
                                        </div>
                                    {/if}
                                    
                                        <Button 
                                            on:click={function_submit} 
                                            disabled={isSubmitting || value_submit <= 0 || 
                                                     (function_submit === buy && value_submit > maxContributeAmount) ||
                                                     (function_submit === refund && value_submit > maxRefundAmount) ||
                                                     (function_submit === temp_exchange && value_submit > maxCollectAmount) ||
                                                     (function_submit === withdraw_tokens && value_submit > maxWithdrawTokenAmount) ||
                                                     (function_submit === withdraw_erg && value_submit > maxWithdrawErgAmount)}
                                            class="submit-btn"
                                            style="background-color: #FF8C00; color: black;"
                                        >
                                            {isSubmitting ? 'Processing...' : 'Submit'}
                                        </Button>
                                    </div>
                        </div>
                    {/if}
            </div>
                </div>
            </div>
        {/if}
</div>

<style>
    /* Base Layout */
    .project-detail {
        min-height: 100vh;
        height: auto;
        width: 100%;
        padding: 2rem;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
    }

    .project-container {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        overflow: visible;
    }

    /* Project Information Section */
    .project-info {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow: visible;
    }

    .project-header {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .project-title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0;
        line-height: 1.2;
    }

    .project-badge {
        margin-bottom: 1rem;
    }

    .project-image {
        width: 100%;
        height: 300px;
        border-radius: 8px;
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .project-description {
        font-size: 1rem;
        line-height: 1.6;
    }

    .token-info {
        margin-top: 0.5rem;
    }

    .share-button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    .share-btn {
        background-color: #6B7280;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .share-btn:hover {
        background-color: #4B5563;
    }

    .copy-msg {
        color: #10B981;
        font-size: 0.875rem;
    }

    /* Project Stats Section */
    .project-stats {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        overflow: visible;
    }

    /* Countdown Timer */
    .countdown-container {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .timeleft {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .timeleft-label {
        font-size: 1.5rem;
        font-weight: 600;
        text-align: center;
    }

    .secondary-text {
        display: block;
        font-size: 0.875rem;
        opacity: 0.8;
        margin-top: 0.25rem;
    }

    .countdown-items {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .item {
        width: 80px;
        height: 80px;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border: 2px solid;
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .item > div {
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1;
    }

    .item > div > h3 {
        font-size: 0.875rem;
        font-weight: 400;
        margin-top: 0.5rem;
    }

    .deadline-info {
        font-size: 0.75rem;
        opacity: 0.8;
        text-align: center;
    }

    /* Progress Bar */
    .progress-container {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .progress {
        height: 10px;
        margin-bottom: 1.5rem;
    }

    .amounts-info {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-top: 1rem;
    }

    .amount-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 0.75rem;
        border-radius: 6px;
        background-color: rgba(255, 255, 255, 0.03);
    }

    .amount-item.current {
        background-color: rgba(255, 165, 0, 0.1);
        border: 1px solid rgba(255, 165, 0, 0.3);
    }

    .amount-label {
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .amount-value {
        font-size: 0.95rem;
        font-weight: 500;
    }

    .amount-ergs {
        font-size: 0.75rem;
        opacity: 0.8;
        margin-top: 0.25rem;
    }

    /* Action Sections */
    .actions-section {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .actions-section.owner {
        background-color: rgba(255, 165, 0, 0.05);
        border: 1px solid rgba(255, 165, 0, 0.2);
    }

    .actions-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 1rem;
    }

    .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
    }

    .action-btn {
        color: black;
        border: none;
        padding: 0.75rem 1.25rem;
        border-radius: 4px;
        font-weight: 600;
        transition: all 0.2s ease;
        flex: 1;
        min-width: 140px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .action-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .action-btn:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
    }

    .action-btn.primary {
        font-weight: 700;
        letter-spacing: 0.5px;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .actions-form {
        position: relative;
        width: 90%;
        max-width: 600px;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }

    .close-button {
        position: absolute;
        top: 1rem;
        right: 1.5rem;
        font-size: 1.5rem;
        cursor: pointer;
        width: 30px;
        height: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        transition: background-color 0.2s;
    }

    .close-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    .centered-form {
        width: 100%;
    }

    .form-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .form-info {
        background-color: rgba(255, 255, 255, 0.05);
        padding: 0.75rem;
        border-radius: 6px;
    }

    .form-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .form-label {
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        text-align: center;
    }

    .input-container {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .form-input {
        flex: 1;
        padding: 0.75rem;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background-color: rgba(255, 255, 255, 0.05);
        color: inherit;
        font-size: 1rem;
    }

    .input-suffix {
        font-size: 0.9rem;
        font-weight: 500;
        min-width: 50px;
    }

    .info-badge {
        margin-top: 0.5rem;
        text-align: center;
    }

    .submit-btn {
        color: black;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        font-weight: 600;
        margin-top: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
        align-self: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .submit-btn:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .result {
        text-align: center;
        padding: 1rem;
    }

    .transaction-link {
        color: #FF8C00;
        text-decoration: underline;
    }

    .error {
        color: #EF5350;
        text-align: center;
        padding: 1rem;
    }

    /* Animation */
    @keyframes pulse {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.05); }
        100% { transform: scale(1); }
    }

    .timeleft.soon .item {
        animation: pulse 1.2s infinite;
        border-color: #FFC107;
        color: #FFC107;
    }

    .timeleft.ended {
        opacity: 0.6;
    }

    /* Responsive Design */
    @media (min-width: 768px) {
        .project-container {
            grid-template-columns: 1fr 1fr;
        }

        .action-buttons {
            display: flex;
            flex-wrap: wrap;
        }

        .form-container {
            flex-direction: row;
        }

        .form-info {
            flex: 1;
        }

        .form-content {
            flex: 2;
        }
    }

    @media (max-width: 767px) {
        .project-detail {
            padding: 1rem;
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .countdown-items {
            gap: 0.5rem;
        }

        .item {
            width: 70px;
            height: 70px;
        }

        .amounts-info {
            grid-template-columns: 1fr;
        }

        .action-buttons {
            flex-direction: column;
        }

        .actions-form {
            padding: 1.5rem;
        }
    }

    .insufficient-funds-message {
        margin-top: 8px;
        padding: 8px 12px;
        background-color: rgba(255, 99, 71, 0.1);
        border: 1px solid rgba(255, 99, 71, 0.3);
        border-radius: 4px;
        color: #ff6347;
        font-size: 0.875rem;
        text-align: center;
    }
</style>
