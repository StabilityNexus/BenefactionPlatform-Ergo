<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$lib/components/ui/button";
    import { Card } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Alert, AlertDescription } from "$lib/components/ui/alert";
    import { address, connected } from "$lib/common/store";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { CampaignPhase, type EmergencyData, type Project } from "$lib/common/project";
    import { VotingContract } from "$lib/ergo/voting/voting_contract";

    export let campaignId: string;
    export let project: Project;
    export let emergencyData: EmergencyData;
    export let campaignDetails: any;
    export let onVoteSubmitted: (newPhase: CampaignPhase) => void = () => {};

    let platform = new ErgoPlatform();
    let isVoting = false;
    let hasVoted = false;
    let userVote: 'approved' | 'rejected' | null = null;
    let voteSubmitting = false;
    let showDocuments = false;
    let votingError = "";
    let votingSuccess = "";

    // Real-time voting state from VotingContract
    let votingState = VotingContract.getVotingState(campaignId);

    $: isVerificationPhase = emergencyData.phase === CampaignPhase.PENDING_VERIFICATION || 
                             emergencyData.phase === CampaignPhase.UNDER_REVIEW;

    $: approvalPercentage = votingState.total > 0
        ? Math.round((votingState.approved / votingState.total) * 100) 
        : 0;

    $: threshold = votingState.threshold;
    $: isApproved = approvalPercentage >= threshold && votingState.total >= 20;

    onMount(() => {
        loadVotingState();
        checkIfUserVoted();
    });

    function loadVotingState() {
        votingState = VotingContract.getVotingState(campaignId);
        
        // Update emergency data with real voting state
        if (emergencyData.votes) {
            emergencyData.votes.approved = votingState.approved;
            emergencyData.votes.rejected = votingState.rejected;
            emergencyData.votes.total = votingState.total;
            emergencyData.votes.voters = votingState.voters;
        } else {
            emergencyData.votes = votingState;
        }
    }

    function checkIfUserVoted() {
        if (!$address) return;
        
        hasVoted = VotingContract.hasUserVoted(campaignId, $address);
        if (hasVoted) {
            userVote = VotingContract.getUserVote(campaignId, $address);
        }
    }

    async function submitVote(vote: 'approved' | 'rejected') {
        if (!$connected || !$address) {
            votingError = "Please connect your wallet to vote";
            return;
        }

        if (hasVoted) {
            votingError = "You have already voted on this campaign";
            return;
        }

        voteSubmitting = true;
        votingError = "";
        votingSuccess = "";

        try {
            console.log(`Submitting ${vote} vote for campaign ${campaignId}`);
            
            // Submit vote using VotingContract
            const result = await VotingContract.submitVote(
                campaignId,
                project,
                vote,
                $address
            );

            if (!result.success) {
                throw new Error(result.message);
            }
            
            // Update local state
            votingState = result.votingState;
            hasVoted = true;
            userVote = vote;
            
            // Update emergency data
            emergencyData.votes = votingState;
            
            // Calculate new phase
            const newPhase = VotingContract.calculatePhaseFromVotes(votingState);
            
            // Show success message
            votingSuccess = `✓ Vote submitted successfully! ${vote === 'approved' ? 'Approved' : 'Rejected'}`;
            
            // Check if threshold reached
            if (newPhase === CampaignPhase.APPROVED) {
                votingSuccess += "\n🎉 Campaign APPROVED! Donors can now contribute.";
                onVoteSubmitted(newPhase);
            } else if (newPhase === CampaignPhase.REJECTED) {
                votingSuccess += "\n❌ Campaign REJECTED. Verification failed.";
                onVoteSubmitted(newPhase);
            }
            
            // Auto-hide success message after 5 seconds
            setTimeout(() => {
                votingSuccess = "";
            }, 5000);
            
        } catch (error) {
            console.error("Voting failed:", error);
            votingError = error instanceof Error ? error.message : "Failed to submit vote";
        } finally {
            voteSubmitting = false;
        }
    }

    function getPhaseColor(phase: CampaignPhase): string {
        switch (phase) {
            case CampaignPhase.PENDING_VERIFICATION:
                return "bg-yellow-500";
            case CampaignPhase.UNDER_REVIEW:
                return "bg-blue-500";
            case CampaignPhase.APPROVED:
                return "bg-green-500";
            case CampaignPhase.REJECTED:
                return "bg-red-500";
            case CampaignPhase.ACTIVE:
                return "bg-emerald-500";
            default:
                return "bg-gray-500";
        }
    }
</script>

<div class="community-voting-container max-w-4xl mx-auto p-6 space-y-6">
    <!-- Phase Status -->
    <div class="phase-status">
        <Badge class={`${getPhaseColor(emergencyData.phase || CampaignPhase.PENDING_VERIFICATION)} text-white text-sm px-4 py-2`}>
            Phase 2: {emergencyData.phase || 'Pending Verification'}
        </Badge>
    </div>

    <!-- Voting Progress Card -->
    <Card class="p-6">
        <h2 class="text-2xl font-bold mb-4">🗳️ Community Verification Vote</h2>
        
        <div class="voting-stats space-y-4">
            <!-- Progress Bar -->
            <div class="progress-section">
                <div class="flex justify-between mb-2">
                    <span class="text-sm font-medium">Approval Progress</span>
                    <span class="text-sm font-bold">{approvalPercentage}% ({votingState.total} votes)</span>
                </div>
                
                <div class="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                    <div 
                        class="h-4 rounded-full transition-all duration-500 {isApproved ? 'bg-green-500' : 'bg-blue-500'}" 
                        style="width: {approvalPercentage}%"
                    ></div>
                </div>
                
                <div class="flex justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>0%</span>
                    <span class="font-bold text-orange-600">Threshold: {threshold}%</span>
                    <span>100%</span>
                </div>
            </div>

            <!-- Vote Breakdown -->
            <div class="grid grid-cols-2 gap-4 mt-4">
                <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div class="text-green-700 dark:text-green-400 font-bold text-2xl">
                        {votingState.approved}
                    </div>
                    <div class="text-sm text-green-600 dark:text-green-300">✓ Approved</div>
                </div>
                
                <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <div class="text-red-700 dark:text-red-400 font-bold text-2xl">
                        {votingState.rejected}
                    </div>
                    <div class="text-sm text-red-600 dark:text-red-300">✗ Rejected</div>
                </div>
            </div>
        </div>

        {#if isApproved && emergencyData.verificationVotes && emergencyData.verificationVotes.total >= 20}
            <Alert class="mt-4 bg-green-50 dark:bg-green-900/20 border-green-500">
                <AlertDescription>
                    ✅ Campaign has reached {threshold}% approval threshold with minimum 20 votes. Ready to proceed to donation phase!
                </AlertDescription>
            </Alert>
        {:else if emergencyData.verificationVotes && emergencyData.verificationVotes.total >= 20}
            <Alert class="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500">
                <AlertDescription>
                    ⚠️ Campaign needs {threshold}% approval to proceed. Current: {approvalPercentage}%
                </AlertDescription>
            </Alert>
        {:else}
            <Alert class="mt-4 bg-blue-50 dark:bg-blue-900/20 border-blue-500">
                <AlertDescription>
                    📊 Minimum 20 votes required. Current: {emergencyData.verificationVotes?.total || 0} votes
                </AlertDescription>
            </Alert>
        {/if}
    </Card>

    <!-- Emergency Details for Review -->
    <Card class="p-6">
        <h3 class="text-xl font-bold mb-4">📋 Campaign Details for Review</h3>
        
        <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="font-semibold">Emergency Type:</span>
                    <Badge class="ml-2">{emergencyData.type || 'N/A'}</Badge>
                </div>
                <div>
                    <span class="font-semibold">Community:</span>
                    <Badge class="ml-2">{emergencyData.communityType || 'N/A'}</Badge>
                </div>
            </div>
            
            <div>
                <span class="font-semibold">Community Name:</span>
                <span class="ml-2">{emergencyData.communityName || 'N/A'}</span>
            </div>

            <div>
                <span class="font-semibold">Campaign Title:</span>
                <span class="ml-2">{campaignDetails?.title || 'N/A'}</span>
            </div>
        </div>

        <!-- Document Review Section -->
        <div class="mt-6">
            <Button 
                variant="outline" 
                on:click={() => showDocuments = !showDocuments}
                class="w-full"
            >
                📄 {showDocuments ? 'Hide' : 'View'} Supporting Documents
            </Button>
            
            {#if showDocuments}
                <div class="mt-4 space-y-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p class="font-semibold">Document Description:</p>
                    <p class="text-sm">{emergencyData.documentDescription || 'No description provided'}</p>
                    
                    {#if emergencyData.documentHashes && emergencyData.documentHashes.length > 0}
                        <div class="mt-3">
                            <p class="font-semibold mb-2">Document Proofs:</p>
                            <ul class="space-y-1">
                                {#each emergencyData.documentHashes as hash, index}
                                    <li class="text-sm">
                                        <span class="font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                            {index + 1}. {hash.substring(0, 50)}...
                                        </span>
                                        {#if hash.startsWith('http')}
                                            <a href={hash} target="_blank" class="ml-2 text-blue-500 hover:underline">
                                                🔗 View
                                            </a>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {:else}
                        <p class="text-sm text-gray-500 italic">No documents provided</p>
                    {/if}
                </div>
            {/if}
        </div>
    </Card>

    <!-- Voting Actions -->
    {#if isVerificationPhase && $connected}
        <Card class="p-6">
            <h3 class="text-xl font-bold mb-4">🗳️ Cast Your Vote</h3>
            
            {#if hasVoted}
                <Alert class="bg-blue-50 dark:bg-blue-900/20 border-blue-500">
                    <AlertDescription>
                        ✓ You have already voted: <strong>{userVote === 'approved' ? 'APPROVED' : 'REJECTED'}</strong>
                    </AlertDescription>
                </Alert>
            {:else}
                <div class="space-y-4">
                    <Alert class="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500">
                        <AlertDescription>
                            ⚠️ <strong>Community Responsibility:</strong> Review all documents carefully. Your vote helps protect donors from fraud while ensuring genuine emergencies get help.
                        </AlertDescription>
                    </Alert>

                    <div class="grid grid-cols-2 gap-4">
                        <Button 
                            on:click={() => submitVote('approved')}
                            disabled={voteSubmitting}
                            class="bg-green-600 hover:bg-green-700 text-white h-16 text-lg"
                        >
                            {#if voteSubmitting}
                                ⏳ Submitting...
                            {:else}
                                ✓ Approve Campaign
                            {/if}
                        </Button>
                        
                        <Button 
                            on:click={() => submitVote('rejected')}
                            disabled={voteSubmitting}
                            variant="destructive"
                            class="h-16 text-lg"
                        >
                            {#if voteSubmitting}
                                ⏳ Submitting...
                            {:else}
                                ✗ Reject Campaign
                            {/if}
                        </Button>
                    </div>

                    {#if votingError}
                        <Alert class="bg-red-50 dark:bg-red-900/20 border-red-500">
                            <AlertDescription>{votingError}</AlertDescription>
                        </Alert>
                    {/if}
                </div>
            {/if}
        </Card>
    {:else if !$connected}
        <Alert class="bg-orange-50 dark:bg-orange-900/20 border-orange-500">
            <AlertDescription>
                🔒 Please connect your wallet to participate in community voting
            </AlertDescription>
        </Alert>
    {/if}

    <!-- Voting Rules -->
    <Card class="p-6 bg-blue-50 dark:bg-blue-900/20">
        <h3 class="text-lg font-bold mb-3">🛡️ Voting Rules & Anti-Corruption Measures</h3>
        <ul class="space-y-2 text-sm">
            <li>✓ One wallet = One vote (no double voting)</li>
            <li>✓ Minimum 20 verified community members required</li>
            <li>✓ At least 60% approval needed to proceed</li>
            <li>✓ All votes are publicly auditable on-chain</li>
            <li>✓ Voters must be from the same region or institution</li>
            <li>✓ Vote cannot be changed once submitted</li>
        </ul>
    </Card>
</div>

<style>
    .community-voting-container {
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
