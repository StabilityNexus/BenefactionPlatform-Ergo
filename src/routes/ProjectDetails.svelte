<script lang="ts">
    import {
        type Project,
        is_ended,
        max_raised,
        min_raised,
        CampaignPhase,
        type WithdrawalStage,
    } from "$lib/common/project";
    import {
        address,
        connected,
        project_detail,
        project_token_amount,
        temporal_token_amount,
        timer,
        balance,
        explorer_uri,
    } from "$lib/common/store";
    import { Progress } from "$lib/components/ui/progress";
    import { Button } from "$lib/components/ui/button";
    import { Alert, AlertDescription } from "$lib/components/ui/alert";
    import { block_to_time } from "$lib/common/countdown";
    import { formatTransactionError } from "$lib/common/error-utils";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import {
        web_explorer_uri_tkn,
        web_explorer_uri_tx,
    } from "$lib/common/store";
    import { mode } from "mode-watcher";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label/index.js";
    import { badgeVariants } from "$lib/components/ui/badge/index.js";
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import { fetchProjects } from "$lib/ergo/fetch";
    import { marked } from "marked";
    import { Forum, web_explorer_uri_addr } from "forum-application";
    import { VotingContract } from "$lib/ergo/voting/voting_contract";
    import CommunityVoting from "./CommunityVoting.svelte";

    // --- ANIMATION IMPORTS ---
    import { fade, fly, scale, slide } from "svelte/transition";
    import { quintOut, elasticOut } from "svelte/easing";
    import { ErgoAddress } from "@fleet-sdk/core";

    let project: Project = $project_detail;

    let platform = new ErgoPlatform();

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let showCopyMessage = false;

    // --- TRANSACTION COPY LOGIC ---
    let clipboardCopied = false;
    let clipboardTimeout;

    function copyTransactionId() {
        if (!transactionId) return;
        navigator.clipboard
            .writeText(transactionId)
            .then(() => {
                clipboardCopied = true;
                if (clipboardTimeout) clearTimeout(clipboardTimeout);
                clipboardTimeout = setTimeout(() => {
                    clipboardCopied = false;
                }, 2000);
            })
            .catch((err) => console.error("Failed to copy ID: ", err));
    }

    // Make these reactive to project changes - FIXED: Current amount = sold - refunded
    $: currentVal = project.sold_counter - project.refund_counter;
    $: min = project.minimum_amount;
    $: max = project.current_pft_amount;
    $: percentage = parseInt(((currentVal / max) * 100).toString());
    $: baseTokenName =
        !project.base_token_id || project.base_token_id === ""
            ? platform.main_token
            : project.base_token_details?.name || "tokens";

    // Calculate project funds correctly based on base token type
    $: projectFundsAmount = (() => {
        const isERGBase =
            !project.base_token_id || project.base_token_id === "";
        if (isERGBase) {
            return project.current_value / Math.pow(10, 9);
        } else {
            let baseTokenAmount = 0;
            for (const asset of project.box.assets) {
                if (asset.tokenId === project.base_token_id) {
                    baseTokenAmount = Number(asset.amount);
                    break;
                }
            }
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            return baseTokenAmount / Math.pow(10, baseTokenDecimals);
        }
    })();

    // Calculate display-friendly exchange rate
    $: displayExchangeRate = (() => {
        const isERGBase =
            !project.base_token_id || project.base_token_id === "";
        if (isERGBase) {
            return (
                project.exchange_rate *
                Math.pow(10, project.token_details.decimals - 9)
            );
        } else {
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            return (
                project.exchange_rate *
                Math.pow(10, project.token_details.decimals - baseTokenDecimals)
            );
        }
    })();

    // States for amounts
    let show_submit = false;
    let label_submit = "";
    let info_type_to_show: "buy" | "dev" | "dev-collect" | "dev-withdraw" | "" =
        "";
    let function_submit: ((event?: any) => Promise<void>) | null = null;
    let value_submit = 0;
    let submit_info = {
        prefix: "",
        amount: "",
        token: "",
    };
    let hide_submit_info = false;
    let submit_amount_label = "";

    $: submit_info = (() => {
        const cleanAmount = (num) =>
            Number(num)
                .toFixed(10)
                .replace(/\.?0+$/, "");

        if (function_submit === add_tokens) {
            return {
                prefix: "Add:",
                amount: cleanAmount(value_submit),
                token: project.token_details.name,
            };
        }
        if (function_submit === withdraw_tokens) {
            return {
                prefix: "Withdraw:",
                amount: cleanAmount(value_submit),
                token: project.token_details.name,
            };
        }
        if (function_submit === withdraw_erg) {
            const isERGBase =
                !project.base_token_id || project.base_token_id === "";
            const tokenName = isERGBase
                ? platform.main_token
                : project.base_token_details?.name || "tokens";
            return {
                prefix: "Withdraw:",
                amount: cleanAmount(value_submit),
                token: tokenName,
            };
        }
        if (function_submit === refund) {
            const isERGBase =
                !project.base_token_id || project.base_token_id === "";
            let baseAmount, tokenName;
            if (isERGBase) {
                const actualRate =
                    project.exchange_rate *
                    Math.pow(10, project.token_details.decimals - 9);
                baseAmount = value_submit * actualRate;
                tokenName = platform.main_token;
            } else {
                const baseTokenDecimals =
                    project.base_token_details?.decimals || 0;
                tokenName = project.base_token_details?.name || "tokens";
                const actualRate =
                    project.exchange_rate *
                    Math.pow(
                        10,
                        project.token_details.decimals - baseTokenDecimals,
                    );
                baseAmount = value_submit * actualRate;
            }
            return {
                prefix: "Refund:",
                amount: cleanAmount(baseAmount),
                token: tokenName,
            };
        }
        if (function_submit === buy) {
            const isERGBase =
                !project.base_token_id || project.base_token_id === "";
            let tokens;
            if (isERGBase) {
                const actualRate =
                    project.exchange_rate *
                    Math.pow(10, project.token_details.decimals - 9);
                tokens = value_submit / actualRate;
            } else {
                const baseTokenDecimals =
                    project.base_token_details?.decimals || 0;
                const actualRate =
                    project.exchange_rate *
                    Math.pow(
                        10,
                        project.token_details.decimals - baseTokenDecimals,
                    );
                tokens = value_submit / actualRate;
            }
            return {
                prefix: "You will receive:",
                amount: cleanAmount(tokens),
                token: project.token_details.name,
            };
        }
        if (function_submit === temp_exchange) {
            return {
                prefix: "Exchange:",
                amount: cleanAmount(value_submit),
                token: project.token_details.name,
            };
        }
        return {
            prefix: "Action:",
            amount: cleanAmount(value_submit),
            token: "tokens",
        };
    })();

    let daysValue = 0;
    let hoursValue = 0;
    let minutesValue = 0;
    let secondsValue = 0;
    // Balance-aware variables
    let userErgBalance = 0;
    let userProjectTokenBalance = 0;
    let userTemporalTokenBalance = 0;
    let userTokens = new Map();
    let maxContributeAmount = 0;
    let maxRefundAmount = 0;
    let maxCollectAmount = 0;
    let maxWithdrawTokenAmount = 0;
    let maxWithdrawErgAmount = 0;
    let maxAddTokenAmount = 0;

    // Check if donations are allowed based on verification status
    $: isEmergencyCampaign = !!project.content.emergency;
    $: campaignPhase = project.content.emergency?.phase || CampaignPhase.PENDING_VERIFICATION;
    $: isDonationAllowed = !isEmergencyCampaign || 
                           campaignPhase === CampaignPhase.APPROVED || 
                           campaignPhase === CampaignPhase.ACTIVE;
    $: verificationPending = isEmergencyCampaign && 
                             (campaignPhase === CampaignPhase.PENDING_VERIFICATION || 
                              campaignPhase === CampaignPhase.UNDER_REVIEW);
    $: verificationRejected = isEmergencyCampaign && 
                              campaignPhase === CampaignPhase.REJECTED;

    async function getWalletBalances() {
        const isERGBase =
            !project.base_token_id || project.base_token_id === "";
        userTokens = await platform.get_balance();

        if (isERGBase) {
            userErgBalance = ($balance || 0) / Math.pow(10, 9);
        } else {
            const rawBaseToken = userTokens.get(project.base_token_id) || 0;
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            userErgBalance = rawBaseToken / Math.pow(10, baseTokenDecimals);
        }

        const rawProjectTokens = userTokens.get(project.pft_token_id) || 0;
        const decimalDivisor = Math.pow(10, project.token_details.decimals);
        userProjectTokenBalance = rawProjectTokens / decimalDivisor;

        const rawTemporalTokens = userTokens.get(project.project_id) || 0;
        userTemporalTokenBalance = rawTemporalTokens / decimalDivisor;

        let maxBaseTokenContribution;

        if (isERGBase) {
            maxBaseTokenContribution = userErgBalance;
        } else {
            maxBaseTokenContribution =
                (userTokens.get(project.base_token_id) || 0) /
                Math.pow(10, project.base_token_details?.decimals || 0);
        }

        const maxSellablePftTokens = Math.max(
            0,
            project.total_pft_amount - project.sold_counter,
        );
        const remainingProjectTokens =
            maxSellablePftTokens / Math.pow(10, project.token_details.decimals);
        let maxBaseTokensForRemainingTokens;

        if (isERGBase) {
            const actualRate =
                project.exchange_rate *
                Math.pow(10, project.token_details.decimals - 9);
            maxBaseTokensForRemainingTokens =
                remainingProjectTokens * actualRate;
        } else {
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            const actualRate =
                project.exchange_rate *
                Math.pow(
                    10,
                    project.token_details.decimals - baseTokenDecimals,
                );
            maxBaseTokensForRemainingTokens =
                remainingProjectTokens * actualRate;
        }

        const rawMaxContribute = Math.min(
            maxBaseTokenContribution,
            maxBaseTokensForRemainingTokens,
        );
        maxContributeAmount = Math.round(rawMaxContribute * 1e12) / 1e12;
        maxRefundAmount = userTemporalTokenBalance;

        const smallestPftUnitFactor = Math.pow(
            10,
            project.token_details.decimals,
        );
        const availablePftForExchange = Math.max(0, project.current_pft_amount);
        const availablePftInNormalUnits =
            availablePftForExchange / smallestPftUnitFactor;

        maxCollectAmount = Math.min(
            userTemporalTokenBalance,
            availablePftInNormalUnits,
        );
        maxCollectAmount = Math.round(maxCollectAmount * 1e12) / 1e12;

        const maxWithdrawableRaw = project.unsold_pft_amount;
        if (maxWithdrawableRaw <= 0) {
            maxWithdrawTokenAmount = 0;
        } else {
            maxWithdrawTokenAmount = maxWithdrawableRaw / smallestPftUnitFactor;
            maxWithdrawTokenAmount =
                Math.round(maxWithdrawTokenAmount * 1e12) / 1e12;
        }

        maxAddTokenAmount = userProjectTokenBalance;
        if (isERGBase) {
            const rawAmount = project.current_value / Math.pow(10, 9);
            maxWithdrawErgAmount = Math.round(rawAmount * 1e12) / 1e12;
        } else {
            let baseTokenAmount = 0;
            for (const asset of project.box.assets) {
                if (asset.tokenId === project.base_token_id) {
                    baseTokenAmount = Number(asset.amount);
                    break;
                }
            }
            const baseTokenDecimals = project.base_token_details?.decimals || 0;
            const rawAmount = baseTokenAmount / Math.pow(10, baseTokenDecimals);
            maxWithdrawErgAmount = Math.round(rawAmount * 1e12) / 1e12;
        }
    }

    $: if ($connected) {
        getWalletBalances();
    }

    $: if (value_submit && show_submit) {
        if (function_submit === buy && value_submit > maxContributeAmount) {
            value_submit = maxContributeAmount;
        } else if (
            function_submit === refund &&
            value_submit > maxRefundAmount
        ) {
            value_submit = maxRefundAmount;
        } else if (
            function_submit === temp_exchange &&
            value_submit > maxCollectAmount
        ) {
            value_submit = maxCollectAmount;
        } else if (
            function_submit === add_tokens &&
            value_submit > maxAddTokenAmount
        ) {
            value_submit = maxAddTokenAmount;
        } else if (
            function_submit === withdraw_tokens &&
            value_submit > maxWithdrawTokenAmount
        ) {
            value_submit = maxWithdrawTokenAmount;
        } else if (
            function_submit === withdraw_erg &&
            value_submit > maxWithdrawErgAmount
        ) {
            value_submit = maxWithdrawErgAmount;
        }
    }

    function setupAddTokens() {
        getWalletBalances();
        info_type_to_show = "dev";
        label_submit = "How many tokens do you want to add?";
        function_submit = add_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = project.token_details.name;
    }

    async function add_tokens() {
        isSubmitting = true;
        try {
            const result = await platform.rebalance(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = formatTransactionError(error);
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawTokens() {
        getWalletBalances();
        info_type_to_show = "dev-withdraw";
        label_submit = "How many tokens do you want to withdraw?";
        function_submit = withdraw_tokens;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = project.token_details.name;
    }

    async function withdraw_tokens() {
        isSubmitting = true;
        try {
            const result = await platform.rebalance(project, -1 * value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = formatTransactionError(error);
        } finally {
            isSubmitting = false;
        }
    }

    function setupWithdrawErg() {
        getWalletBalances();
        info_type_to_show = "dev-collect";
        const isERGBase =
            !project.base_token_id || project.base_token_id === "";
        const baseTokenName = isERGBase
            ? "ERGs"
            : project.base_token_details?.name || "tokens";
        label_submit = `How many ${baseTokenName} do you want to withdraw?`;
        function_submit = withdraw_erg;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = baseTokenName;
    }

    async function withdraw_erg() {
        isSubmitting = true;
        try {
            const result = await platform.withdraw(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage = formatTransactionError(error);
        } finally {
            isSubmitting = false;
        }
    }

    function setupBuy() {
        getWalletBalances();
        info_type_to_show = "buy";
        const isERGBase =
            !project.base_token_id || project.base_token_id === "";
        const baseTokenName = isERGBase
            ? platform.main_token
            : project.base_token_details?.name || "tokens";
        label_submit = `How many ${baseTokenName} do you want to contribute?`;
        function_submit = buy;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = baseTokenName;
    }

    async function buy() {
        isSubmitting = true;
        try {
            const isERGBase =
                !project.base_token_id || project.base_token_id === "";
            let token_amount = 0;
            if (isERGBase) {
                const actualRate =
                    project.exchange_rate *
                    Math.pow(10, project.token_details.decimals - 9);
                token_amount = value_submit / actualRate;
            } else {
                const baseTokenDecimals =
                    project.base_token_details?.decimals || 0;
                const actualRate =
                    project.exchange_rate *
                    Math.pow(
                        10,
                        project.token_details.decimals - baseTokenDecimals,
                    );
                token_amount = value_submit / actualRate;
            }
            const result = await platform.buy_refund(project, token_amount);
            transactionId = result;
            if (result) {
                await refreshProjectFromContract();
            }
        } catch (error) {
            errorMessage =
                error.message || "Error occurred while buying tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupRefund() {
        getWalletBalances();
        info_type_to_show = "";
        label_submit = "How many APT do you want to refund?";
        function_submit = refund;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = false;
        submit_amount_label = "APT";
    }

    async function refund() {
        isSubmitting = true;
        try {
            const result = await platform.buy_refund(
                project,
                -1 * value_submit,
            );
            transactionId = result;
            if (result) {
                await refreshProjectFromContract();
            }
        } catch (error) {
            errorMessage =
                error.message || "Error occurred while refunding tokens";
        } finally {
            isSubmitting = false;
        }
    }

    function setupTempExchange() {
        getWalletBalances();
        info_type_to_show = "";
        label_submit =
            "Exchange " +
            project.content.title +
            " APT per " +
            project.token_details.name;
        function_submit = temp_exchange;
        value_submit = 0;
        show_submit = true;
        hide_submit_info = true;
        submit_amount_label = project.token_details.name;
    }

    async function temp_exchange() {
        isSubmitting = true;
        try {
            const result = await platform.temp_exchange(project, value_submit);
            transactionId = result;
        } catch (error) {
            errorMessage =
                error.message || "Error occurred while exchange TFT <-> PFT";
        } finally {
            isSubmitting = false;
        }
    }

    function shareProject() {
        navigator.clipboard
            .writeText(window.location.href)
            .then(() => {
                showCopyMessage = true;
                setTimeout(() => {
                    showCopyMessage = false;
                }, 2000);
            })
            .catch((err) => console.error("Failed to copy text: ", err));
    }

    // Emergency Verification Voting Handler - Using VotingContract
    async function handleVerificationVote(voteType: 'approve' | 'reject') {
        if (!$connected || !project.content.emergency) return;
        
        const walletAddr = $address;
        if (!walletAddr) {
            alert('Please connect your wallet first.');
            return;
        }
        
        isSubmitting = true;
        errorMessage = null;
        
        try {
            // Use VotingContract to submit vote
            const result = await VotingContract.submitVote(
                project.id,
                project,
                voteType === 'approve' ? 'approved' : 'rejected',
                walletAddr
            );
            
            if (!result.success) {
                throw new Error(result.message);
            }
            
            // Update project with new voting state
            project.content.emergency.verificationVotes = result.votingState;
            
            // Calculate new phase
            const newPhase = VotingContract.calculatePhaseFromVotes(result.votingState);
            project.content.emergency.phase = newPhase;
            
            // Update project store
            project = { ...project };
            project_detail.set(project);
            
            // Show appropriate alert
            if (newPhase === CampaignPhase.APPROVED) {
                alert('✅ Campaign APPROVED! Donations are now enabled.');
            } else if (newPhase === CampaignPhase.REJECTED) {
                alert('❌ Campaign REJECTED. Verification failed.');
            } else {
                alert(`Vote recorded: ${voteType === 'approve' ? '✓ Approved' : '✕ Rejected'}`);
            }
            
        } catch (error) {
            console.error('Voting error:', error);
            errorMessage = error instanceof Error ? error.message : 'Failed to submit vote. Please try again.';
            alert(errorMessage);
        } finally {
            isSubmitting = false;
        }
    }

    // Withdrawal Stage Management Functions
    async function requestWithdrawalStage(stageNumber: number) {
        if (!project.content.emergency?.withdrawalStages) return;
        
        const stage = project.content.emergency.withdrawalStages[stageNumber - 1];
        if (!stage) return;
        
        // Set stage to pending with request timestamp
        stage.status = 'pending';
        stage.requestedAt = Date.now();
        stage.votesFor = 0;
        stage.votesAgainst = 0;
        stage.amount = projectFundsAmount * (stage.percentage / 100);
        
        // Update project
        project = { ...project };
        project_detail.set(project);
        
        alert(`✓ Withdrawal request submitted for Stage ${stageNumber}!\nCommunity voting is now open.`);
    }

    async function voteOnWithdrawal(stageNumber: number, voteType: 'approve' | 'reject') {
        if (!$connected || !project.content.emergency?.withdrawalStages) return;
        
        const walletAddr = $address;
        if (!walletAddr) {
            alert('Please connect your wallet first.');
            return;
        }
        
        const stage = project.content.emergency.withdrawalStages[stageNumber - 1];
        if (!stage) return;
        
        // Initialize voters array if not exists
        if (!stage.voters) {
            stage.voters = [];
        }
        
        // Check if already voted on this stage
        if (stage.voters.includes(walletAddr)) {
            alert('⚠️ You have already voted on this withdrawal stage.');
            return;
        }
        
        // Record vote
        stage.voters.push(walletAddr);
        if (voteType === 'approve') {
            stage.votesFor = (stage.votesFor || 0) + 1;
        } else {
            stage.votesAgainst = (stage.votesAgainst || 0) + 1;
        }
        
        const totalVotes = (stage.votesFor || 0) + (stage.votesAgainst || 0);
        const approvalRate = (stage.votesFor || 0) / totalVotes * 100;
        
        // Check if enough votes to finalize (minimum 5 votes)
        if (totalVotes >= 5) {
            if (approvalRate >= 60) {
                stage.status = 'approved';
                stage.approvedAt = Date.now();
                // Set timelock based on stage
                const delays = [0, 7 * 24 * 60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000]; // 0, 7, 14 days in ms
                stage.timelock = Date.now() + delays[stageNumber - 1];
                alert(`✅ Stage ${stageNumber} APPROVED!\nTime lock: ${delays[stageNumber - 1] / (24 * 60 * 60 * 1000)} days`);
            } else if (approvalRate < 40) {
                stage.status = 'rejected';
                alert(`❌ Stage ${stageNumber} REJECTED by community.`);
            }
        }
        
        // Update project
        project = { ...project };
        project_detail.set(project);
        
        alert(`Vote recorded: ${voteType === 'approve' ? '✓ Approved' : '✕ Rejected'}`);
    }

    function checkWithdrawalTimelock(stage: WithdrawalStage | undefined): boolean {
        if (!stage || !stage.timelock) return false;
        return Date.now() >= stage.timelock;
    }

    function getTimelockRemaining(stage: WithdrawalStage | undefined): string {
        if (!stage || !stage.timelock) return '';
        
        const remaining = stage.timelock - Date.now();
        if (remaining <= 0) return 'Ready';
        
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        
        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
    }

    async function executeWithdrawal(stageNumber: number, amount: string) {
        if (!project.content.emergency?.withdrawalStages) return;
        
        const stage = project.content.emergency.withdrawalStages[stageNumber - 1];
        if (!stage || !checkWithdrawalTimelock(stage)) {
            alert('⏳ Time lock is still active. Please wait.');
            return;
        }
        
        isSubmitting = true;
        try {
            // TODO: Actual blockchain withdrawal transaction
            // For now, simulate the withdrawal
            
            stage.status = 'withdrawn';
            stage.withdrawnAt = Date.now();
            
            // Update project
            project = { ...project };
            project_detail.set(project);
            
            alert(`✅ Stage ${stageNumber} withdrawn successfully!\nAmount: ${amount} ${baseTokenName}`);
            
            // Move to next stage
            const nextStage = project.content.emergency.withdrawalStages[stageNumber];
            if (nextStage && nextStage.status === 'pending') {
                project.content.emergency.currentStage = stageNumber + 1;
            }
            
        } catch (error) {
            console.error('Withdrawal error:', error);
            errorMessage = 'Failed to execute withdrawal. Please try again.';
        } finally {
            isSubmitting = false;
        }
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
        is_min_raised = await min_raised(project);
        is_max_raised = await max_raised(project);

        // Handle both timestamp and block height modes
        if (project.is_timestamp_limit) {
            // In timestamp mode, block_limit is already a timestamp in milliseconds
            // Display in local time for better user experience
            limit_date = new Date(project.block_limit).toLocaleString();
        } else {
            // In block height mode, convert block to time
            limit_date = new Date(
                await block_to_time(project.block_limit, project.platform),
            ).toLocaleString();
        }
    }
    load();

    let is_owner = false;
    async function checkIfIsOwner() {
        const connected = await $connected;
        const address = await $address;
        is_owner =
            connected &&
            ErgoAddress.fromBase58((await address) ?? "").ergoTree ===
                project.constants.owner;
    }
    checkIfIsOwner();
    let timerValue = get(timer);
    let targetDate = timerValue.target;
    let countdownInterval = timerValue.countdownInterval;
    async function setTargetDate() {
        if (project.is_timestamp_limit) {
            // In timestamp mode, block_limit is already a timestamp
            targetDate = project.block_limit;
        } else {
            // In block height mode, convert block to time
            targetDate = await block_to_time(
                project.block_limit,
                project.platform,
            );
        }
    }
    setTargetDate();

    let progressColor = "white";
    let countdownAnimation = false;
    function updateCountdown() {
        var currentDate = new Date().getTime();
        var diff = targetDate - currentDate;

        if (diff > 0) {
            daysValue = Math.floor(diff / (1000 * 60 * 60 * 24));
            hoursValue = Math.floor(
                (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
            );
            minutesValue = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            secondsValue = Math.floor((diff % (1000 * 60)) / 1000);
        } else {
            daysValue = 0;
            hoursValue = 0;
            minutesValue = 0;
            secondsValue = 0;
        }

        if (is_min_raised) {
            progressColor = "#A8E6A1";
        } else {
            if (diff <= 0) {
                progressColor = "#FF6F61";
                countdownAnimation = false;
            } else if (diff < 24 * 60 * 60 * 1000) {
                progressColor = "#FFF5A3";
                countdownAnimation = true;
            } else {
                progressColor = "white";
                countdownAnimation = false;
            }
        }
    }

    countdownInterval = setInterval(updateCountdown, 1000);
    timer.update((current) => ({ ...current, countdownInterval }));

    async function get_user_project_tokens() {
        var user_project_tokens =
            (await platform.get_balance(project.pft_token_id)).get(
                project.pft_token_id,
            ) ?? 0;
        const formattedProjectTokens =
            (
                user_project_tokens /
                Math.pow(10, project.token_details.decimals)
            ).toString() +
            " " +
            project.token_details.name;
        project_token_amount.set(formattedProjectTokens);

        var temporal_tokens =
            (await platform.get_balance(project.project_id)).get(
                project.project_id,
            ) ?? 0;
        const normalizedTemporalTokens =
            temporal_tokens / Math.pow(10, project.token_details.decimals);
        temporal_token_amount.set(normalizedTemporalTokens);
    }
    get_user_project_tokens();

    async function refreshProjectFromContract() {
        try {
            const updatedProjects = await fetchProjects();
            const updatedProject = updatedProjects.get(project.project_id);
            if (updatedProject) {
                project = {
                    ...project,
                    sold_counter: updatedProject.sold_counter,
                    current_value: updatedProject.current_value,
                    refund_counter: updatedProject.refund_counter,
                    current_idt_amount: updatedProject.current_idt_amount,
                    current_pft_amount: updatedProject.current_pft_amount,
                    box: updatedProject.box,
                };
                project_detail.set(project);
                await getWalletBalances();
                await get_user_project_tokens();
            }
        } catch (error) {
            console.error("Error refreshing project data:", error);
        }
    }

    getWalletBalances();
    onDestroy(() => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    });
</script>

<div
    class="project-detail"
    style={$mode === "light" ? "color: black;" : "color: #ddd;"}
>
    <div class="project-container">
        <div
            class="project-info"
            in:fly={{ y: 30, duration: 800, delay: 200, easing: quintOut }}
        >
            <div class="project-header">
                <h1 class="project-title">{project.content.title}</h1>
                <div class="project-badge" style="display: none;">
                    <a
                        href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es"
                        target="_blank"
                        class={badgeVariants({ variant: "outline" })}
                        >Contract version: {project.version.replace(
                            "_",
                            ".",
                        )}</a
                    >
                </div>
            </div>

            <div
                class="project-image"
                style="background-image: url({project.content.image});"
            ></div>

            <div class="project-description">
                <div class="markdown-content">
                    {@html marked.parse(project.content.description || "", {
                        breaks: true,
                    })}
                </div>
                {#if project.content.link !== null}
                    <p>
                        More info <a
                            href={project.content.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-500 underline">here</a
                        >.
                    </p>
                {/if}
            </div>

            <div class="token-info">
                <p>
                    Proof-of-Funding Token:
                    <a
                        href={get(web_explorer_uri_tkn) + project.pft_token_id}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-500 underline"
                    >
                        {project.token_details.name}
                    </a>
                </p>
            </div>

            <div class="share-button">
                <Button class="share-btn" on:click={shareProject}>
                    Share Project
                </Button>
                {#if showCopyMessage}
                    <div class="copy-msg" transition:fade>
                        Project page url copied to clipboard!
                    </div>
                {/if}
            </div>
        </div>

        <div
            class="project-stats"
            in:fly={{ y: 30, duration: 800, delay: 400, easing: quintOut }}
        >
            <div class="countdown-container">
                <div
                    class="timeleft {deadline_passed
                        ? 'ended'
                        : countdownAnimation
                          ? 'soon'
                          : ''}"
                >
                    <span class="timeleft-label">
                        {#if deadline_passed}
                            TIME'S UP!
                            {#if !is_max_raised}
                                <small class="secondary-text"
                                    >... But you can still contribute!</small
                                >
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

                    <small class="deadline-info">
                        {#if project.is_timestamp_limit}
                            <span
                                title="This project has a fixed deadline at a specific date and time, regardless of blockchain block height"
                            >
                                🕐 Deadline (by time): {limit_date}
                            </span>
                        {:else}
                            <span
                                title="This project's deadline is tied to the Ergo blockchain reaching block #{project.block_limit}. The estimated time may vary based on network conditions"
                            >
                                ⛓️ Deadline (by block): {limit_date}
                                <br />
                                <span style="opacity: 0.7; font-size: 0.9em;">
                                    (at block #{project.block_limit})
                                </span>
                            </span>
                        {/if}
                    </small>
                </div>
            </div>

            <div class="progress-container">
                <Progress value={percentage} color={progressColor} />

                <div class="amounts-info">
                    <div class="amount-item">
                        <div class="amount-label">Minimum Amount</div>
                        <div class="amount-value">
                            {min / Math.pow(10, project.token_details.decimals)}
                            {project.token_details.name}
                        </div>
                        <div class="amount-ergs">
                            {(() => {
                                const isERGBase =
                                    !project.base_token_id ||
                                    project.base_token_id === "";
                                if (isERGBase) {
                                    return (
                                        (min * project.exchange_rate) /
                                            Math.pow(10, 9) +
                                        " " +
                                        platform.main_token
                                    );
                                } else {
                                    const baseTokenDecimals =
                                        project.base_token_details?.decimals ||
                                        0;
                                    const baseTokenName =
                                        project.base_token_details?.name ||
                                        "tokens";
                                    return (
                                        (min * project.exchange_rate) /
                                            Math.pow(10, baseTokenDecimals) +
                                        " " +
                                        baseTokenName
                                    );
                                }
                            })()}
                        </div>
                    </div>

                    <div class="amount-item current">
                        <div class="amount-label">Current Amount</div>
                        <div class="amount-value">
                            {currentVal /
                                Math.pow(10, project.token_details.decimals)}
                            {project.token_details.name}
                        </div>
                        <div class="amount-ergs">
                            {(() => {
                                const isERGBase =
                                    !project.base_token_id ||
                                    project.base_token_id === "";
                                if (isERGBase) {
                                    return (
                                        (currentVal * project.exchange_rate) /
                                            Math.pow(10, 9) +
                                        " " +
                                        platform.main_token
                                    );
                                } else {
                                    const baseTokenDecimals =
                                        project.base_token_details?.decimals ||
                                        0;
                                    const baseTokenName =
                                        project.base_token_details?.name ||
                                        "tokens";
                                    return (
                                        (currentVal * project.exchange_rate) /
                                            Math.pow(10, baseTokenDecimals) +
                                        " " +
                                        baseTokenName
                                    );
                                }
                            })()}
                        </div>
                    </div>

                    <div class="amount-item">
                        <div class="amount-label">Maximum Amount</div>
                        <div class="amount-value">
                            {max / Math.pow(10, project.token_details.decimals)}
                            {project.token_details.name}
                        </div>
                        <div class="amount-ergs">
                            {(() => {
                                const isERGBase =
                                    !project.base_token_id ||
                                    project.base_token_id === "";
                                if (isERGBase) {
                                    return (
                                        (max * project.exchange_rate) /
                                            Math.pow(10, 9) +
                                        " " +
                                        platform.main_token
                                    );
                                } else {
                                    const baseTokenDecimals =
                                        project.base_token_details?.decimals ||
                                        0;
                                    const baseTokenName =
                                        project.base_token_details?.name ||
                                        "tokens";
                                    return (
                                        (max * project.exchange_rate) /
                                            Math.pow(10, baseTokenDecimals) +
                                        " " +
                                        baseTokenName
                                    );
                                }
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Emergency Verification Voting Section -->
            {#if project.content.emergency && (project.content.emergency.phase === CampaignPhase.PENDING_VERIFICATION || project.content.emergency.phase === CampaignPhase.UNDER_REVIEW)}
                <div class="verification-section" transition:slide>
                    <!-- Use the CommunityVoting Component -->
                    <CommunityVoting 
                        campaignId={project.id}
                        project={project}
                        emergencyData={project.content.emergency}
                        campaignDetails={{
                            title: project.content.title,
                            description: project.content.description
                        }}
                        onVoteSubmitted={(newPhase) => {
                            // Update project phase when vote is submitted
                            if (project.content.emergency) {
                                project.content.emergency.phase = newPhase;
                                project = { ...project };
                                project_detail.set(project);
                            }
                        }}
                    />
                    
                    <!-- Info Box -->
                    <div class="verification-info mt-6 p-4 border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <p class="info-text text-sm">
                            ⚠️ <strong>Important:</strong> This campaign cannot accept donations until community verification is complete. 
                            Review the evidence carefully before voting.
                        </p>
                    </div>
                </div>
            {/if}

            <div class="actions-section">
                <h2 class="actions-title">Actions</h2>
                
                <!-- Emergency Campaign Verification Block -->
                {#if project.content.emergency && (project.content.emergency.phase === CampaignPhase.PENDING_VERIFICATION || project.content.emergency.phase === CampaignPhase.UNDER_REVIEW)}
                    <div class="verification-block">
                        <div class="block-icon">🔒</div>
                        <h3 class="block-title">Donations Blocked - Verification Required</h3>
                        <p class="block-message">
                            This emergency campaign is currently under community verification. 
                            Donations will be enabled once the campaign receives ≥60% approval from verified community members.
                        </p>
                        <div class="block-status">
                            {#if project.content.emergency.phase === CampaignPhase.PENDING_VERIFICATION}
                                <span class="status-badge pending">⏳ Awaiting Initial Votes</span>
                            {:else}
                                <span class="status-badge reviewing">👥 Under Review</span>
                            {/if}
                        </div>
                    </div>
                {:else if project.content.emergency && project.content.emergency.phase === CampaignPhase.REJECTED}
                    <div class="verification-block rejected">
                        <div class="block-icon">❌</div>
                        <h3 class="block-title">Campaign Rejected</h3>
                        <p class="block-message">
                            This emergency campaign did not pass community verification. 
                            Donations are permanently disabled for this campaign.
                        </p>
                        <div class="block-status">
                            <span class="status-badge rejected-badge">✕ Verification Failed</span>
                        </div>
                    </div>
                {:else}
                    <!-- Normal Actions (only shown if not blocked) -->
                    <div class="action-buttons">
                        {#if verificationPending}
                            <Alert class="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 mb-4">
                                <AlertDescription>
                                    ⏳ <strong>Verification Pending:</strong> This emergency campaign is currently under community review. Donations will be enabled once verification reaches 60% approval with minimum 20 votes.
                                </AlertDescription>
                            </Alert>
                        {:else if verificationRejected}
                            <Alert class="bg-red-50 dark:bg-red-900/20 border-red-500 mb-4">
                                <AlertDescription>
                                    ❌ <strong>Verification Failed:</strong> This campaign did not pass community verification. Donations are disabled.
                                </AlertDescription>
                            </Alert>
                        {/if}
                        
                        <Button
                            class="action-btn primary"
                            style="background-color: #FFA500; color: black;"
                            on:click={setupBuy}
                            disabled={!$connected ||
                                !isDonationAllowed ||
                                maxContributeAmount <= 0 ||
                                project.sold_counter >= project.total_pft_amount}
                            title={!$connected
                                ? "Connect your wallet to contribute"
                                : !isDonationAllowed
                                  ? verificationPending 
                                    ? "Waiting for community verification" 
                                    : "Campaign verification failed"
                                : maxContributeAmount <= 0
                                  ? "Insufficient funds"
                                  : "Contribute"}
                        >
                            {#if verificationPending}
                                ⏳ Verification Pending
                            {:else if verificationRejected}
                                ❌ Verification Failed
                            {:else}
                                Contribute
                            {/if}
                        </Button>

                        <Button
                            class="action-btn"
                            style="background-color: #FF8C00; color: black;"
                            on:click={setupRefund}
                            disabled={!$connected ||
                                !(deadline_passed && !is_min_raised) ||
                                maxRefundAmount <= 0}
                            title="Get a Refund"
                        >
                            Get a Refund
                        </Button>

                        <Button
                            class="action-btn"
                            style="background-color: #FF8C00; color: black;"
                            on:click={setupTempExchange}
                            disabled={!$connected ||
                                !is_min_raised ||
                                maxCollectAmount <= 0}
                            title="Collect Tokens"
                        >
                            Collect {project.token_details.name}
                        </Button>
                    </div>
                {/if}
            </div>

            {#if is_owner}
                <!-- Emergency Staged Withdrawal Section -->
                {#if project.content.emergency}
                    <div class="actions-section emergency-withdrawal" transition:slide>
                        <h2 class="actions-title">🚨 Emergency Fund Withdrawal (Staged Release)</h2>
                        <p class="text-sm text-muted-foreground mb-4">
                            Funds are released in 3 stages: 40% → 30% → 30% with time delays and community approval
                        </p>
                        
                        <div class="withdrawal-stages space-y-4">
                            {#each [
                                { stage: 1, percentage: 40, delay: '0 days' },
                                { stage: 2, percentage: 30, delay: '7 days' },
                                { stage: 3, percentage: 30, delay: '14 days' }
                            ] as stageInfo}
                                {@const stageData = project.content.emergency.withdrawalStages?.[stageInfo.stage - 1]}
                                {@const stageStatus = stageData?.status || 'pending'}
                                {@const stageAmount = (projectFundsAmount * (stageInfo.percentage / 100)).toFixed(4)}
                                
                                <div class="withdrawal-stage-card border rounded-lg p-4 {
                                    stageStatus === 'withdrawn' ? 'bg-green-500/5 border-green-500/30' :
                                    stageStatus === 'approved' ? 'bg-blue-500/5 border-blue-500/30' :
                                    stageStatus === 'rejected' ? 'bg-red-500/5 border-red-500/30' :
                                    'bg-yellow-500/5 border-yellow-500/30'
                                }">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold text-lg">Stage {stageInfo.stage}</span>
                                            <span class="text-sm text-muted-foreground">({stageInfo.percentage}%)</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            {#if stageStatus === 'withdrawn'}
                                                <span class="px-3 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                                                    ✓ Withdrawn
                                                </span>
                                            {:else if stageStatus === 'approved'}
                                                <span class="px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                    ✓ Approved
                                                </span>
                                            {:else if stageStatus === 'rejected'}
                                                <span class="px-3 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                                                    ✕ Rejected
                                                </span>
                                            {:else}
                                                <span class="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                                    ⏳ Pending
                                                </span>
                                            {/if}
                                        </div>
                                    </div>
                                    
                                    <div class="flex items-center justify-between text-sm mb-3">
                                        <span class="text-muted-foreground">Amount:</span>
                                        <span class="font-semibold">{stageAmount} {baseTokenName}</span>
                                    </div>
                                    
                                    <div class="flex items-center justify-between text-sm mb-3">
                                        <span class="text-muted-foreground">Time Delay:</span>
                                        <span>{stageInfo.delay} from approval</span>
                                    </div>
                                    
                                    {#if stageData?.votesFor !== undefined}
                                        <div class="flex items-center justify-between text-xs mb-2">
                                            <span class="text-muted-foreground">Community Votes:</span>
                                            <span class="text-green-400">{stageData.votesFor} For</span>
                                            <span class="text-red-400">{stageData.votesAgainst || 0} Against</span>
                                        </div>
                                    {/if}
                                    
                                    {#if stageStatus === 'pending' && stageInfo.stage === 1}
                                        <Button
                                            class="w-full mt-2"
                                            style="background-color: #FF8C00; color: black;"
                                            disabled={!is_min_raised}
                                            on:click={() => requestWithdrawalStage(stageInfo.stage)}
                                            title="Request withdrawal approval from community"
                                        >
                                            Request Stage {stageInfo.stage} Withdrawal
                                        </Button>
                                    {:else if stageStatus === 'approved'}
                                        {@const canWithdraw = checkWithdrawalTimelock(stageData)}
                                        <Button
                                            class="w-full mt-2"
                                            style="background-color: #10b981; color: white;"
                                            disabled={!canWithdraw}
                                            on:click={() => executeWithdrawal(stageInfo.stage, stageAmount)}
                                            title={canWithdraw ? "Withdraw approved funds" : "Time lock active - please wait"}
                                        >
                                            {canWithdraw ? `Withdraw ${stageAmount} ${baseTokenName}` : `⏳ Time Lock (${getTimelockRemaining(stageData)})`}
                                        </Button>
                                    {:else if stageStatus === 'withdrawn'}
                                        <div class="w-full mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-center text-xs text-green-400">
                                            ✓ Withdrawn on {stageData?.withdrawnAt ? new Date(stageData.withdrawnAt).toLocaleDateString() : 'N/A'}
                                        </div>
                                    {/if}
                                    
                                    <!-- Voting Section for Withdrawal Approval -->
                                    {#if stageData?.status === 'pending' && stageData?.requestedAt}
                                        <div class="stage-voting mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                                            <p class="text-xs font-semibold mb-2">Community Approval Required</p>
                                            <div class="mini-vote-bars mb-2">
                                                <div class="mini-bar approve">
                                                    <div class="bar-fill" style="width: {(stageData.votesFor || 0) / Math.max((stageData.votesFor || 0) + (stageData.votesAgainst || 0), 1) * 100}%"></div>
                                                    <span class="text-xs">✓ {stageData.votesFor || 0}</span>
                                                </div>
                                                <div class="mini-bar reject">
                                                    <div class="bar-fill" style="width: {(stageData.votesAgainst || 0) / Math.max((stageData.votesFor || 0) + (stageData.votesAgainst || 0), 1) * 100}%"></div>
                                                    <span class="text-xs">✕ {stageData.votesAgainst || 0}</span>
                                                </div>
                                            </div>
                                            {#if $connected}
                                                <div class="flex gap-2">
                                                    <button
                                                        class="flex-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded text-xs text-green-400"
                                                        on:click={() => voteOnWithdrawal(stageInfo.stage, 'approve')}
                                                    >
                                                        ✓ Approve
                                                    </button>
                                                    <button
                                                        class="flex-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-xs text-red-400"
                                                        on:click={() => voteOnWithdrawal(stageInfo.stage, 'reject')}
                                                    >
                                                        ✕ Reject
                                                    </button>
                                                </div>
                                            {:else}
                                                <p class="text-xs text-muted-foreground text-center">Connect wallet to vote</p>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                        
                        <div class="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs">
                            <p class="text-blue-200">ℹ️ <strong>How it works:</strong> Each stage requires community approval (≥60% votes). After approval, there's a mandatory waiting period before withdrawal is allowed. This ensures accountability and proper fund usage.</p>
                        </div>
                    </div>
                {/if}

                <div class="actions-section owner" transition:slide>
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
                            disabled={!$connected ||
                                maxWithdrawTokenAmount <= 0}
                        >
                            Withdraw {project.token_details.name}
                        </Button>

                        <Button
                            class="action-btn"
                            style="background-color: #FF8C00; color: black;"
                            on:click={setupWithdrawErg}
                            disabled={!$connected ||
                                !is_min_raised ||
                                maxWithdrawErgAmount <= 0}
                        >
                            Collect {!project.base_token_id ||
                            project.base_token_id === ""
                                ? platform.main_token
                                : project.base_token_details?.name || "tokens"}
                        </Button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    {#if show_submit}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
            class="modal-overlay"
            transition:fade={{ duration: 200 }}
            on:click|self={close_submit_form}
        >
            <div
                class="actions-form"
                class:light-mode={$mode === "light"}
                style={$mode === "light"
                    ? "background: white;"
                    : "background: #2a2a2a;"}
                transition:scale={{
                    start: 0.95,
                    duration: 300,
                    easing: quintOut,
                }}
            >
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="close-button" on:click={close_submit_form}>
                    &times;
                </div>
                <div class="centered-form">
                    {#if transactionId}
                        <div
                            class="result"
                            in:slide={{ duration: 300, easing: quintOut }}
                        >
                            <div class="result-content">
                                <span class="result-label">Transaction ID</span>
                                <a
                                    href={$web_explorer_uri_tx + transactionId}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="transaction-link"
                                    class:light-mode={$mode === "light"}
                                >
                                    <span>{transactionId.slice(0, 8)}...</span>
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                                        ></path><polyline
                                            points="15 3 21 3 21 9"
                                        ></polyline><line
                                            x1="10"
                                            y1="14"
                                            x2="21"
                                            y2="3"
                                        ></line></svg
                                    >
                                </a>
                            </div>

                            <button
                                class="copy-btn"
                                class:success={clipboardCopied}
                                on:click={copyTransactionId}
                                aria-label="Copy Transaction ID"
                            >
                                {#if clipboardCopied}
                                    <div
                                        in:scale={{
                                            duration: 400,
                                            start: 0.5,
                                            easing: elasticOut,
                                        }}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="3"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            style="width: 18px; height: 18px;"
                                        >
                                            <polyline points="20 6 9 17 4 12"
                                            ></polyline>
                                        </svg>
                                    </div>
                                {:else}
                                    <div
                                        in:scale={{ duration: 200, start: 0.8 }}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            style="width: 18px; height: 18px;"
                                        >
                                            <rect
                                                x="9"
                                                y="9"
                                                width="13"
                                                height="13"
                                                rx="2"
                                                ry="2"
                                            ></rect>
                                            <path
                                                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                            ></path>
                                        </svg>
                                    </div>
                                {/if}
                            </button>
                        </div>
                    {:else if errorMessage}
                        <div class="error" in:slide>
                            <p>{errorMessage}</p>
                        </div>
                    {:else}
                        <div class="form-container" in:slide>
                            <div class="form-info">
                                {#if info_type_to_show === "buy"}
                                    <p>
                                        <strong>Exchange Rate:</strong>
                                        {displayExchangeRate.toFixed(6)}
                                        {baseTokenName} / {project.token_details
                                            .name}
                                    </p>
                                    <p>
                                        <strong>Your Wallet Balance:</strong>
                                        {userErgBalance.toFixed(4)}
                                        {baseTokenName}
                                    </p>
                                    <p>
                                        <strong>Max You Can Buy:</strong>
                                        {maxContributeAmount.toFixed(4)}
                                        {baseTokenName}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev-collect"}
                                    <p>
                                        <strong>Project Funds:</strong>
                                        {projectFundsAmount.toFixed(4)}
                                        {baseTokenName}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev"}
                                    <p>
                                        <strong>Your Token Balance:</strong>
                                        {userProjectTokenBalance.toFixed(2)}
                                        {project.token_details.name}
                                    </p>
                                {/if}
                                {#if info_type_to_show === "dev-withdraw"}
                                    <p>
                                        <strong>Project Unsold Balance:</strong>
                                        {(
                                            project.unsold_pft_amount /
                                            Math.pow(
                                                10,
                                                project.token_details.decimals,
                                            )
                                        ).toFixed(2)}
                                        {project.token_details.name}
                                    </p>
                                {/if}
                                {#if function_submit === refund}
                                    <p>
                                        <strong>Refundable Amount:</strong>
                                        {maxRefundAmount} APT
                                    </p>
                                {/if}
                                {#if function_submit === temp_exchange}
                                    <p>
                                        <strong>Exchangeable Amount:</strong>
                                        {maxCollectAmount.toFixed(4)}
                                        {project.token_details.name}
                                    </p>
                                {/if}
                            </div>

                            <div class="form-content">
                                <Label for="amount-input" class="form-label"
                                    >{label_submit}</Label
                                >
                                <div class="input-container">
                                    <Input
                                        id="amount-input"
                                        type="number"
                                        bind:value={value_submit}
                                        min="0"
                                        step="0.001"
                                        class="form-input"
                                    />
                                    <span class="input-suffix"
                                        >{submit_amount_label}</span
                                    >
                                </div>

                                {#if !hide_submit_info}
                                    <Label for="amount-input" class="form-label"
                                        >{submit_info.prefix}</Label
                                    >
                                    <div class="input-container">
                                        <Input
                                            disabled={true}
                                            type="number"
                                            value={submit_info.amount}
                                            class="form-input"
                                        />
                                        <span class="input-suffix"
                                            >{submit_info.token}</span
                                        >
                                    </div>
                                {/if}

                                <Button
                                    on:click={function_submit}
                                    disabled={isSubmitting || value_submit <= 0}
                                    class="submit-btn"
                                    style="background-color: #FF8C00; color: black;"
                                >
                                    {isSubmitting ? "Processing..." : "Submit"}
                                </Button>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <div class="forum-section" in:fly={{ y: 20, delay: 600 }}>
        <Forum topic_id={project.project_id} 
            connect_executed={$connected}
            explorer_uri={explorer_uri} 
            web_explorer_uri_addr={web_explorer_uri_addr}
            web_explorer_uri_tkn={web_explorer_uri_tkn}
            web_explorer_uri_tx={web_explorer_uri_tx}
            connected={$connected}
            />
    </div>
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
        max-width: 1600px;
        margin: 0 auto;
        overflow: visible;
    }

    .project-info,
    .project-stats {
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
        transition: transform 0.3s ease; /* Hover effect for image */
    }
    .project-image:hover {
        transform: scale(1.01);
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
        background-color: #6b7280;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition:
            background-color 0.2s,
            transform 0.1s;
    }
    .share-btn:hover {
        background-color: #4b5563;
    }
    .share-btn:active {
        transform: scale(0.98);
    }

    .copy-msg {
        color: #10b981;
        font-size: 0.875rem;
    }

    /* Countdown Timer */
    .countdown-container,
    .progress-container,
    .actions-section {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(5px); /* Enhanced Glassmorphism */
        transition:
            transform 0.3s ease,
            box-shadow 0.3s ease;
    }

    .countdown-container:hover,
    .progress-container:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 12px rgba(0, 0, 0, 0.2);
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
    .item:hover {
        transform: scale(1.05);
        border-color: #ffb74d;
    } /* Interactive timer items */

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

    /* Progress & Amounts */
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
        transition: background-color 0.2s;
    }
    .amount-item:hover {
        background-color: rgba(255, 255, 255, 0.08);
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

    /* Actions */
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
        transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
        flex: 1;
        min-width: 140px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .action-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
    }
    .action-btn:active:not(:disabled) {
        transform: translateY(0) scale(0.98);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

    /* Modal Overlay */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px); /* Increased blur */
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    }

    /* Modal Box */
    .actions-form {
        position: relative;
        width: 95%;
        max-width: 540px;
        border-radius: 20px;
        padding: 3.5rem 2.5rem 2.5rem 2.5rem; /* Increased top padding to clear close button */
        background: linear-gradient(
            145deg,
            rgba(30, 30, 30, 0.95),
            rgba(20, 20, 20, 0.95)
        );
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 152, 0, 0.15);
    }

    .close-button {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        font-size: 1.8rem;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        transition:
            background 0.2s,
            transform 0.2s,
            color 0.2s;
        color: #ccc;
        z-index: 10;
    }
    .close-button:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: rotate(90deg);
        color: #fff;
    }

    .form-info {
        background: rgba(255, 255, 255, 0.05);
        padding: 1.2rem 1.4rem;
        border-radius: 12px;
        border-left: 5px solid #ff9800;
        line-height: 1.5;
        font-size: 0.95rem;
        margin-bottom: 1.5rem;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .form-label {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        text-align: center;
        color: #f5f5f5;
    }
    .input-container {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .form-input {
        flex: 1;
        padding: 1rem 1.2rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.1);
        font-size: 1.05rem;
        color: #fff;
        transition:
            border 0.2s,
            background 0.2s,
            box-shadow 0.2s;
    }
    .form-input:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.18);
        border-color: #ff9800;
        box-shadow: 0 0 8px rgba(255, 152, 0, 0.3);
    }

    .input-suffix {
        font-size: 1.05rem;
        font-weight: 600;
        color: #ffb74d;
        padding-right: 1rem;
    }

    .submit-btn {
        width: 100%;
        padding: 1rem 1.5rem;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, #ffa726, #fb8c00);
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        margin-top: 1.5rem;
        color: #1a1a1a;
        transition:
            transform 0.1s,
            box-shadow 0.2s,
            background 0.2s;
    }
    .submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(255, 152, 0, 0.4);
    }
    .submit-btn:active:not(:disabled) {
        transform: translateY(0) scale(0.98);
    }
    .submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Transaction Result Card */
    .result {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(76, 175, 80, 0.12);
        border: 1px solid rgba(76, 175, 80, 0.4);
        border-radius: 12px;
        padding: 0.8rem 1.2rem;
        margin-top: 1rem;
        gap: 1rem;
        backdrop-filter: blur(5px);
        transition:
            border-color 0.2s ease,
            box-shadow 0.2s;
    }
    .result:hover {
        border-color: rgba(76, 175, 80, 0.8);
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.2);
    }

    .result-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        overflow: hidden;
        text-align: left;
    }
    .result-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #81c784;
        font-weight: 600;
    }
    .result-link {
        font-family: "SF Mono", "Roboto Mono", monospace;
        font-size: 1rem;
        color: #ffffff;
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
    }
    .result-link:hover {
        text-decoration: underline;
        text-decoration-thickness: 2px;
        text-decoration-color: #4caf50;
    }
    .icon-link {
        width: 14px;
        height: 14px;
        opacity: 0.6;
    }

    .actions-form.light-mode .result-label {
        color: #155724;
    }
    .actions-form.light-mode .close-button {
        color: #666;
        background: transparent;
    }
    .actions-form.light-mode .close-button:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #000;
    }

    .copy-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid transparent;
        color: #e0e0e0;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
    }
    .copy-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        transform: scale(1.05);
    }
    .copy-btn.success {
        background: #4caf50;
        color: white;
        border-color: #4caf50;
    }

    .error {
        background: rgba(244, 67, 54, 0.15);
        color: #f44336;
        text-align: center;
        padding: 1.4rem;
        font-size: 1.05rem;
        border-radius: 12px;
        margin-top: 1rem;
    }

    @media (min-width: 1024px) {
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
    }
    
    @media (max-width: 1023px) {
        .project-title {
            font-size: 1.5rem;
            word-break: break-word;
        }

        .project-image {
            height: 200px;
        }
        
        .countdown-container,
        .progress-container,
        .actions-section {
            padding: 1rem;
        }

        .amounts-info {
            grid-template-columns: 1fr; 
            gap: 1.5rem;
        }

        .item {
            width: 70px;
            height: 70px;
        }

        .item > div {
            font-size: 1.5rem;
        }

        .forum-section {
            padding: 1rem;
            margin-top: 1.5rem;
        }
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }
    .timeleft.soon .item {
        animation: pulse 1.2s infinite;
        border-color: #ffc107;
        color: #ffc107;
    }
    .timeleft.ended {
        opacity: 0.6;
    }

    /* Forum Section */
    .forum-section {
        grid-column: 1 / -1;
        margin-top: 3rem;
        padding: 2rem;
        background: var(--card);
        border-radius: 0.5rem;
        border: 1px solid var(--border);
    }
    /* Markdown Content Styles */
    .markdown-content {
        line-height: 1.6;
        color: inherit;
    }
    .markdown-content :global(p) {
        margin-bottom: 1em;
    }
    .markdown-content :global(h1),
    .markdown-content :global(h2),
    .markdown-content :global(h3),
    .markdown-content :global(h4) {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        font-weight: 700;
        line-height: 1.2;
    }
    .markdown-content :global(h1) {
        font-size: 1.8em;
    }
    .markdown-content :global(h2) {
        font-size: 1.5em;
    }
    .markdown-content :global(h3) {
        font-size: 1.25em;
    }

    .markdown-content :global(ul),
    .markdown-content :global(ol) {
        margin-bottom: 1em;
        padding-left: 1.5em;
    }
    .markdown-content :global(ul) {
        list-style-type: disc;
    }
    .markdown-content :global(ol) {
        list-style-type: decimal;
    }

    .markdown-content :global(li) {
        margin-bottom: 0.25em;
    }

    .markdown-content :global(blockquote) {
        border-left: 4px solid #ccc;
        padding-left: 1em;
        margin-left: 0;
        margin-bottom: 1em;
        font-style: italic;
    }

    .markdown-content :global(strong) {
        font-weight: bold;
    }

    .markdown-content :global(em) {
        font-style: italic;
    }

    .markdown-content :global(a) {
        color: #3b82f6;
        text-decoration: underline;
    }
    .markdown-content :global(a:hover) {
        color: #2563eb;
    }
    .markdown-content :global(code) {
        background-color: rgba(127, 127, 127, 0.2);
        padding: 0.2em 0.4em;
        border-radius: 4px;
        font-family: monospace;
    }
    .markdown-content :global(pre) {
        background-color: rgba(0, 0, 0, 0.1);
        padding: 1em;
        border-radius: 8px;
        overflow-x: auto;
        margin-bottom: 1em;
    }

    /* Emergency Withdrawal Stages */
    .emergency-withdrawal {
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.05) 0%, rgba(239, 68, 68, 0.02) 100%);
        border: 2px solid rgba(220, 38, 38, 0.2) !important;
    }

    .withdrawal-stages {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .withdrawal-stage-card {
        transition: all 0.3s ease;
    }

    .withdrawal-stage-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    /* Community Verification Section */
    .verification-section {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.02) 100%);
        border: 2px solid rgba(59, 130, 246, 0.3);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 2rem;
        backdrop-filter: blur(10px);
    }

    .verification-header {
        text-align: center;
        margin-bottom: 1.5rem;
    }

    .verification-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: #3b82f6;
        margin-bottom: 0.5rem;
    }

    .verification-subtitle {
        font-size: 0.875rem;
        opacity: 0.8;
    }

    .emergency-details {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .detail-row:last-child {
        border-bottom: none;
    }

    .detail-label {
        font-weight: 600;
        opacity: 0.8;
    }

    .detail-value {
        font-weight: 500;
    }

    .document-evidence {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .evidence-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
    }

    .evidence-description {
        font-size: 0.875rem;
        line-height: 1.6;
        margin-bottom: 1rem;
    }

    .document-hashes {
        margin-top: 1rem;
    }

    .hash-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        margin-bottom: 0.5rem;
        font-family: monospace;
        font-size: 0.75rem;
    }

    .hash-number {
        color: #3b82f6;
        font-weight: 600;
    }

    .hash-value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .voting-stats {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .stats-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .stats-title {
        font-size: 1rem;
        font-weight: 600;
    }

    .approval-rate {
        font-size: 1.25rem;
        font-weight: 700;
        color: #f59e0b;
    }

    .approval-rate.passing {
        color: #10b981;
    }

    .vote-bars {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .vote-bar {
        position: relative;
        height: 2.5rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 6px;
        overflow: hidden;
    }

    .vote-bar.approve .bar-fill {
        background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    }

    .vote-bar.reject .bar-fill {
        background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
    }

    .bar-fill {
        height: 100%;
        transition: width 0.5s ease;
    }

    .bar-label {
        position: absolute;
        left: 1rem;
        top: 50%;
        transform: translateY(-50%);
        font-weight: 600;
        font-size: 0.875rem;
        z-index: 1;
    }

    .threshold-info {
        text-align: center;
        font-size: 0.75rem;
        opacity: 0.8;
    }

    .voting-actions {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .vote-btn {
        flex: 1;
        padding: 1rem;
        font-weight: 600;
        border-radius: 8px;
        transition: all 0.3s ease;
    }

    .approve-btn {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        border: none;
    }

    .approve-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }

    .reject-btn {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        border: none;
    }

    .reject-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    }

    .connect-prompt {
        text-align: center;
        padding: 2rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        font-size: 0.875rem;
        opacity: 0.8;
    }

    .verification-info {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
        padding: 1rem;
    }

    .info-text {
        font-size: 0.875rem;
        line-height: 1.6;
        margin: 0;
    }

    /* Verification Block (Donation Blocker) */
    .verification-block {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
        border: 2px solid rgba(251, 191, 36, 0.3);
        border-radius: 12px;
        padding: 2rem;
        text-align: center;
        margin-bottom: 1rem;
    }

    .verification-block.rejected {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
        border-color: rgba(239, 68, 68, 0.3);
    }

    .block-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .block-title {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
        color: #fbbf24;
    }

    .verification-block.rejected .block-title {
        color: #ef4444;
    }

    .block-message {
        font-size: 0.875rem;
        line-height: 1.6;
        opacity: 0.9;
        margin-bottom: 1.5rem;
        max-width: 600px;
        margin-left: auto;
        margin-right: auto;
    }

    .block-status {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
    }

    .status-badge {
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
    }

    .status-badge.pending {
        background: rgba(251, 191, 36, 0.2);
        color: #fbbf24;
        border: 1px solid rgba(251, 191, 36, 0.4);
    }

    .status-badge.reviewing {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        border: 1px solid rgba(59, 130, 246, 0.4);
    }

    .status-badge.rejected-badge {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.4);
    }

    /* Withdrawal Stage Voting */
    .stage-voting {
        animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .mini-vote-bars {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .mini-bar {
        position: relative;
        height: 1.5rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
    }

    .mini-bar .bar-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        transition: width 0.5s ease;
    }

    .mini-bar.approve .bar-fill {
        background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    }

    .mini-bar.reject .bar-fill {
        background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
    }

    .mini-bar span {
        position: relative;
        z-index: 1;
        font-weight: 600;
    }
</style>
