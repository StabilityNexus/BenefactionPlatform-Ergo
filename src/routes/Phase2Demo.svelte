<script lang="ts">
    import CommunityVoting from "./CommunityVoting.svelte";
    import StagedWithdrawal from "./StagedWithdrawal.svelte";
    import { Card } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import { CampaignPhase } from "$lib/common/project";
    import type { EmergencyData, WithdrawalStage } from "$lib/common/project";

    // Demo data for testing the voting and withdrawal components
    let demoMode: 'voting' | 'withdrawal' = 'voting';

    // Sample campaign data for voting demo
    const demoCampaignForVoting: EmergencyData = {
        emergencyType: "Medical Emergency",
        communityType: "Regional",
        communityName: "Mumbai Healthcare Community",
        documentHashes: [
            "QmX7H8k9JaKL2MnP4RsT6VwX8YzAbCdEfGhIjKlMnOpQrS",
            "https://drive.google.com/file/d/example123/view",
            "QmY9K2L3MnO5PqR7StU9VxW0YzA1BcD2EfG3HiJ4KlM6NoPq"
        ],
        documentDescription: "Hospital admission bill from Apollo Hospital dated Dec 10, 2025. Medical prescription for emergency surgery. Photos of patient in ICU.",
        phase: CampaignPhase.UNDER_REVIEW,
        verificationVotes: {
            approved: 18,
            rejected: 7,
            total: 25,
            voters: [
                "9ejrqe...1Jsq",
                "8djpqd...2Ktr",
                "7ciopc...3Lus"
            ]
        },
        withdrawalStages: [],
        totalFundsRaised: 0,
        currentStage: 0
    };

    const demoCampaignDetails = {
        title: "Emergency Heart Surgery for 8-Year-Old Child",
        description: "Urgent medical intervention required for congenital heart defect",
        link: "https://example.com",
        image: "https://via.placeholder.com/400x200"
    };

    // Sample data for withdrawal demo
    const demoWithdrawalStages: WithdrawalStage[] = [
        {
            stageNumber: 1,
            percentage: 40,
            amount: 40000000000, // 40 ERG
            status: 'withdrawn',
            requestedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
            approvedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
            withdrawnAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
            votesFor: 22,
            votesAgainst: 3,
            voters: []
        },
        {
            stageNumber: 2,
            percentage: 30,
            amount: 30000000000, // 30 ERG
            status: 'approved',
            requestedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
            approvedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
            votesFor: 19,
            votesAgainst: 5,
            voters: []
        },
        {
            stageNumber: 3,
            percentage: 30,
            amount: 30000000000, // 30 ERG
            status: 'pending',
            votesFor: 0,
            votesAgainst: 0,
            voters: []
        }
    ];

    const totalFundsRaised = 100000000000; // 100 ERG
    const currentStage = 1; // Currently on stage 2
</script>

<div class="phase2-demo-container max-w-7xl mx-auto p-6 space-y-8">
    <!-- Header -->
    <div class="demo-header text-center">
        <h1 class="text-4xl font-bold mb-3">🎯 Phase 2 Features Demo</h1>
        <p class="text-gray-600 dark:text-gray-400 text-lg mb-6">
            Community Voting & Staged Withdrawal System
        </p>
        
        <div class="flex gap-4 justify-center">
            <button
                class="px-6 py-3 rounded-lg font-semibold transition-all {demoMode === 'voting' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700'}"
                on:click={() => demoMode = 'voting'}
            >
                🗳️ Community Voting
            </button>
            <button
                class="px-6 py-3 rounded-lg font-semibold transition-all {demoMode === 'withdrawal' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700'}"
                on:click={() => demoMode = 'withdrawal'}
            >
                💰 Staged Withdrawal
            </button>
        </div>
    </div>

    <!-- Feature Status -->
    <Card class="p-6 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20">
        <h2 class="text-2xl font-bold mb-4">✅ Phase 2 Implementation Status</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <Badge class="bg-green-500 text-white">✓ Complete</Badge>
                    <span>Community Voting UI</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-green-500 text-white">✓ Complete</Badge>
                    <span>Staged Withdrawal UI</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-green-500 text-white">✓ Complete</Badge>
                    <span>Document Review Interface</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-green-500 text-white">✓ Complete</Badge>
                    <span>Vote Progress Tracking</span>
                </div>
            </div>
            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <Badge class="bg-yellow-500 text-white">⏳ Pending</Badge>
                    <span>ErgoScript Voting Logic</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-yellow-500 text-white">⏳ Pending</Badge>
                    <span>Oracle Integration</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-yellow-500 text-white">⏳ Pending</Badge>
                    <span>On-chain Vote Storage</span>
                </div>
                <div class="flex items-center gap-2">
                    <Badge class="bg-yellow-500 text-white">⏳ Pending</Badge>
                    <span>Auto-freeze Smart Contract</span>
                </div>
            </div>
        </div>
    </Card>

    <!-- Demo Content -->
    {#if demoMode === 'voting'}
        <div class="demo-section">
            <div class="section-header mb-6">
                <h2 class="text-3xl font-bold mb-2">🗳️ Community Voting System</h2>
                <p class="text-gray-600 dark:text-gray-400">
                    Democratic verification with 60% approval threshold
                </p>
            </div>
            
            <CommunityVoting 
                campaignId="demo-campaign-001"
                emergencyData={demoCampaignForVoting}
                campaignDetails={demoCampaignDetails}
            />
        </div>
    {:else}
        <div class="demo-section">
            <div class="section-header mb-6">
                <h2 class="text-3xl font-bold mb-2">💰 Staged Fund Release</h2>
                <p class="text-gray-600 dark:text-gray-400">
                    Transparent escrow with proof-of-use requirements
                </p>
            </div>
            
            <StagedWithdrawal 
                campaignId="demo-campaign-001"
                withdrawalStages={demoWithdrawalStages}
                totalFundsRaised={totalFundsRaised}
                currentStage={currentStage}
                isOwner={true}
            />
        </div>
    {/if}

    <!-- Implementation Notes -->
    <Card class="p-6 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500">
        <h3 class="text-xl font-bold mb-3">📝 Implementation Notes</h3>
        <div class="space-y-2 text-sm">
            <p><strong>Current State:</strong> Frontend UI is complete and functional. Backend blockchain integration is pending.</p>
            <p><strong>Next Steps:</strong></p>
            <ul class="list-disc list-inside ml-4 space-y-1">
                <li>Implement ErgoScript voting contract with on-chain vote storage</li>
                <li>Add Oracle integration for off-chain document verification</li>
                <li>Create auto-freeze logic when community rejects withdrawal</li>
                <li>Implement timelock mechanism for staged releases</li>
                <li>Add refund distribution system for frozen funds</li>
            </ul>
            <p class="mt-3"><strong>Testing:</strong> Currently using mock data. Connect wallet and interact with components to see the full user experience.</p>
        </div>
    </Card>

    <!-- Feature Comparison -->
    <Card class="p-6">
        <h3 class="text-xl font-bold mb-4">📊 Feature Comparison</h3>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b">
                        <th class="text-left p-2">Feature</th>
                        <th class="text-left p-2">Traditional Platforms</th>
                        <th class="text-left p-2">Our Implementation</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="border-b">
                        <td class="p-2 font-semibold">Verification</td>
                        <td class="p-2">Manual review (centralized)</td>
                        <td class="p-2 text-green-600">✓ Community voting (decentralized)</td>
                    </tr>
                    <tr class="border-b">
                        <td class="p-2 font-semibold">Fund Release</td>
                        <td class="p-2">All at once (100% risk)</td>
                        <td class="p-2 text-green-600">✓ Staged (40-30-30% with proofs)</td>
                    </tr>
                    <tr class="border-b">
                        <td class="p-2 font-semibold">Fraud Protection</td>
                        <td class="p-2">Trust-based (~15% fraud)</td>
                        <td class="p-2 text-green-600">✓ Multi-layer (<2% fraud target)</td>
                    </tr>
                    <tr class="border-b">
                        <td class="p-2 font-semibold">Transparency</td>
                        <td class="p-2">Limited visibility</td>
                        <td class="p-2 text-green-600">✓ All votes on-chain (public audit)</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Refund Mechanism</td>
                        <td class="p-2">Manual process</td>
                        <td class="p-2 text-green-600">✓ Auto-freeze + smart contract refund</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </Card>
</div>

<style>
    .phase2-demo-container {
        animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    table {
        border-collapse: collapse;
    }

    tr:hover {
        background-color: rgba(59, 130, 246, 0.05);
    }
</style>
