<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$lib/components/ui/button";
    import { Card } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Alert, AlertDescription } from "$lib/components/ui/alert";
    import * as Dialog from "$lib/components/ui/dialog";
    import { walletConnected, walletAddress } from "wallet-svelte-component";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import type { WithdrawalStage } from "$lib/common/project";

    export let campaignId: string;
    export let withdrawalStages: WithdrawalStage[];
    export let totalFundsRaised: number;
    export let currentStage: number = 0;
    export let isOwner: boolean = false;

    let platform = new ErgoPlatform();
    let selectedStage: WithdrawalStage | null = null;
    let showWithdrawDialog = false;
    let showProofDialog = false;
    let proofDescription = "";
    let proofHashes: string[] = [];
    let newProofHash = "";
    let withdrawing = false;
    let submittingProof = false;
    let errorMessage = "";

    $: totalPercentage = withdrawalStages.reduce((sum, stage) => sum + stage.percentage, 0);

    function getStageStatus(stage: WithdrawalStage): string {
        if (stage.status === 'withdrawn') return '✓ Withdrawn';
        if (stage.status === 'approved') return '✓ Approved';
        if (stage.status === 'rejected') return '✗ Rejected';
        if (stage.stageNumber <= currentStage) return '⏳ Pending';
        return '🔒 Locked';
    }

    function getStageColor(stage: WithdrawalStage): string {
        if (stage.status === 'withdrawn') return 'bg-green-500';
        if (stage.status === 'approved') return 'bg-blue-500';
        if (stage.status === 'rejected') return 'bg-red-500';
        if (stage.stageNumber <= currentStage) return 'bg-yellow-500';
        return 'bg-gray-400';
    }

    function canRequestWithdrawal(stage: WithdrawalStage): boolean {
        if (!isOwner) return false;
        if (stage.status !== 'pending' && stage.status !== 'approved') return false;
        if (stage.stageNumber > currentStage + 1) return false;
        return true;
    }

    async function requestWithdrawal(stage: WithdrawalStage) {
        if (!$walletConnected || !canRequestWithdrawal(stage)) return;

        withdrawing = true;
        errorMessage = "";

        try {
            console.log(`Requesting withdrawal for stage ${stage.stageNumber}`);
            
            // TODO: Implement ErgoScript withdrawal transaction
            // This is a placeholder for the actual blockchain interaction
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Update stage status
            stage.status = 'withdrawn';
            stage.withdrawnAt = Date.now();
            
            selectedStage = null;
            showWithdrawDialog = false;
            
        } catch (error) {
            console.error("Withdrawal failed:", error);
            errorMessage = `Failed to withdraw: ${error}`;
        } finally {
            withdrawing = false;
        }
    }

    async function submitProof() {
        if (!$walletConnected || !selectedStage) return;

        if (proofHashes.length === 0) {
            errorMessage = "Please add at least one proof document";
            return;
        }

        submittingProof = true;
        errorMessage = "";

        try {
            console.log(`Submitting proof for stage ${selectedStage.stageNumber}`);
            
            // TODO: Implement proof submission to blockchain/IPFS
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Update stage - move to community voting
            selectedStage.requestedAt = Date.now();
            selectedStage.votesFor = 0;
            selectedStage.votesAgainst = 0;
            
            showProofDialog = false;
            proofHashes = [];
            proofDescription = "";
            
        } catch (error) {
            console.error("Proof submission failed:", error);
            errorMessage = `Failed to submit proof: ${error}`;
        } finally {
            submittingProof = false;
        }
    }

    function addProofHash() {
        if (newProofHash.trim()) {
            proofHashes = [...proofHashes, newProofHash.trim()];
            newProofHash = "";
        }
    }

    function removeProofHash(index: number) {
        proofHashes = proofHashes.filter((_, i) => i !== index);
    }

    function openWithdrawDialog(stage: WithdrawalStage) {
        selectedStage = stage;
        showWithdrawDialog = true;
    }

    function openProofDialog(stage: WithdrawalStage) {
        selectedStage = stage;
        showProofDialog = true;
    }
</script>

<div class="staged-withdrawal-container max-w-5xl mx-auto p-6 space-y-6">
    <div class="header">
        <h2 class="text-3xl font-bold mb-2">💰 Staged Fund Release</h2>
        <p class="text-gray-600 dark:text-gray-400">
            Transparent escrow protection with proof-of-use requirements
        </p>
    </div>

    <!-- Total Funds Summary -->
    <Card class="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
        <div class="grid grid-cols-3 gap-4">
            <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Total Raised</div>
                <div class="text-2xl font-bold">{(totalFundsRaised / 1e9).toFixed(2)} ERG</div>
            </div>
            <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Current Stage</div>
                <div class="text-2xl font-bold">Stage {currentStage + 1} of {withdrawalStages.length}</div>
            </div>
            <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Total Withdrawn</div>
                <div class="text-2xl font-bold text-green-600">
                    {withdrawalStages
                        .filter(s => s.status === 'withdrawn')
                        .reduce((sum, s) => sum + s.amount, 0) / 1e9}
                    ERG
                </div>
            </div>
        </div>
    </Card>

    <!-- Stage Timeline -->
    <div class="stages-timeline space-y-4">
        {#each withdrawalStages as stage, index}
            <Card class="p-6 relative overflow-hidden">
                <!-- Stage Number Badge -->
                <div class="absolute top-4 right-4">
                    <Badge class={`${getStageColor(stage)} text-white px-3 py-1`}>
                        Stage {stage.stageNumber}
                    </Badge>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- Stage Info -->
                    <div class="col-span-2">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="text-3xl font-bold text-blue-600">
                                {stage.percentage}%
                            </div>
                            <div>
                                <div class="font-semibold text-lg">
                                    {(stage.amount / 1e9).toFixed(2)} ERG
                                </div>
                                <div class="text-sm text-gray-600 dark:text-gray-400">
                                    {getStageStatus(stage)}
                                </div>
                            </div>
                        </div>

                        <!-- Stage Conditions -->
                        <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm">
                            <div class="font-semibold mb-1">Release Conditions:</div>
                            {#if stage.stageNumber === 1}
                                <p>✓ Community approval (≥60% votes)</p>
                            {:else if stage.stageNumber === 2}
                                <p>📄 Proof of hospital admission / expense update required</p>
                            {:else if stage.stageNumber === 3}
                                <p>📋 Final report / discharge / authority confirmation required</p>
                            {/if}
                        </div>

                        <!-- Vote Progress (if applicable) -->
                        {#if stage.votesFor !== undefined && stage.votesAgainst !== undefined}
                            <div class="mt-3">
                                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    Community Vote: {stage.votesFor} For / {stage.votesAgainst} Against
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        class="bg-green-500 h-2 rounded-full"
                                        style="width: {(stage.votesFor / (stage.votesFor + stage.votesAgainst)) * 100}%"
                                    ></div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="flex flex-col gap-2 justify-center">
                        {#if stage.status === 'withdrawn'}
                            <div class="text-green-600 font-semibold flex items-center gap-2">
                                <span class="text-2xl">✓</span>
                                <div>
                                    <div>Withdrawn</div>
                                    {#if stage.withdrawnAt}
                                        <div class="text-xs text-gray-500">
                                            {new Date(stage.withdrawnAt).toLocaleDateString()}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {:else if stage.status === 'approved'}
                            {#if isOwner}
                                <Button 
                                    on:click={() => openWithdrawDialog(stage)}
                                    class="bg-green-600 hover:bg-green-700"
                                >
                                    💸 Withdraw {stage.percentage}%
                                </Button>
                            {:else}
                                <div class="text-blue-600 font-semibold">Approved - Awaiting Withdrawal</div>
                            {/if}
                        {:else if stage.status === 'pending' && isOwner && stage.stageNumber > 1}
                            <Button 
                                on:click={() => openProofDialog(stage)}
                                variant="outline"
                                disabled={stage.stageNumber > currentStage + 1}
                            >
                                📤 Submit Proof
                            </Button>
                        {:else if stage.status === 'rejected'}
                            <Alert class="bg-red-50 dark:bg-red-900/20 border-red-500">
                                <AlertDescription class="text-xs">
                                    ✗ Rejected by community. Remaining funds frozen.
                                </AlertDescription>
                            </Alert>
                        {:else}
                            <div class="text-gray-500 text-sm">
                                {#if stage.stageNumber > currentStage + 1}
                                    🔒 Locked - Previous stages must complete first
                                {:else}
                                    ⏳ Awaiting community approval
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Connection Line to Next Stage -->
                {#if index < withdrawalStages.length - 1}
                    <div class="absolute -bottom-4 left-1/2 transform -translate-x-1/2 z-10">
                        <div class="w-1 h-8 bg-gray-300 dark:bg-gray-600"></div>
                        <div class="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-300 dark:border-t-gray-600"></div>
                    </div>
                {/if}
            </Card>
        {/each}
    </div>

    <!-- Auto-Freeze Protection Notice -->
    <Alert class="bg-orange-50 dark:bg-orange-900/20 border-orange-500">
        <AlertDescription>
            <strong>⚠️ Auto-Freeze Protection:</strong> If verification fails at any stage, remaining funds are automatically frozen and can be refunded to donors through a community vote.
        </AlertDescription>
    </Alert>
</div>

<!-- Withdrawal Dialog -->
<Dialog.Root bind:open={showWithdrawDialog}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>Confirm Withdrawal - Stage {selectedStage?.stageNumber}</Dialog.Title>
            <Dialog.Description>
                You are about to withdraw {selectedStage?.percentage}% of the total funds
            </Dialog.Description>
        </Dialog.Header>

        {#if selectedStage}
            <div class="space-y-4 py-4">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div class="font-semibold text-lg mb-2">Withdrawal Amount</div>
                    <div class="text-3xl font-bold text-blue-600">
                        {(selectedStage.amount / 1e9).toFixed(2)} ERG
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {selectedStage.percentage}% of total raised
                    </div>
                </div>

                <Alert>
                    <AlertDescription>
                        Funds will be transferred to your wallet address. This action cannot be undone.
                    </AlertDescription>
                </Alert>

                {#if errorMessage}
                    <Alert class="bg-red-50 dark:bg-red-900/20 border-red-500">
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                {/if}
            </div>

            <Dialog.Footer>
                <Button variant="outline" on:click={() => showWithdrawDialog = false}>
                    Cancel
                </Button>
                <Button 
                    on:click={() => requestWithdrawal(selectedStage)}
                    disabled={withdrawing}
                    class="bg-green-600 hover:bg-green-700"
                >
                    {withdrawing ? '⏳ Processing...' : '✓ Confirm Withdrawal'}
                </Button>
            </Dialog.Footer>
        {/if}
    </Dialog.Content>
</Dialog.Root>

<!-- Proof Submission Dialog -->
<Dialog.Root bind:open={showProofDialog}>
    <Dialog.Content class="max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>Submit Proof - Stage {selectedStage?.stageNumber}</Dialog.Title>
            <Dialog.Description>
                Upload proof documents to request community approval for this withdrawal stage
            </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 py-4">
            <div>
                <label class="block text-sm font-medium mb-2">Proof Description *</label>
                <Textarea 
                    bind:value={proofDescription}
                    placeholder="Describe the documents you're submitting (e.g., Hospital admission bill, Treatment progress report, Discharge summary)"
                    rows="4"
                />
            </div>

            <div>
                <label class="block text-sm font-medium mb-2">Document Proofs (IPFS Hash or Link) *</label>
                <div class="flex gap-2">
                    <Input 
                        bind:value={newProofHash}
                        placeholder="Enter IPFS hash or Google Drive link"
                        on:keypress={(e) => e.key === 'Enter' && addProofHash()}
                    />
                    <Button on:click={addProofHash} variant="outline">Add</Button>
                </div>

                {#if proofHashes.length > 0}
                    <div class="mt-3 space-y-2">
                        {#each proofHashes as hash, index}
                            <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <span class="text-sm font-mono truncate flex-1">{hash}</span>
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    on:click={() => removeProofHash(index)}
                                >
                                    ✕
                                </Button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <Alert class="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500">
                <AlertDescription>
                    📌 Community members will review your proof before approving this withdrawal stage
                </AlertDescription>
            </Alert>

            {#if errorMessage}
                <Alert class="bg-red-50 dark:bg-red-900/20 border-red-500">
                    <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
            {/if}
        </div>

        <Dialog.Footer>
            <Button variant="outline" on:click={() => showProofDialog = false}>
                Cancel
            </Button>
            <Button 
                on:click={submitProof}
                disabled={submittingProof || proofHashes.length === 0}
            >
                {submittingProof ? '⏳ Submitting...' : '📤 Submit for Review'}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<style>
    .staged-withdrawal-container {
        animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
