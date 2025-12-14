/**
 * Community Voting Contract Helper
 * Handles voting logic for emergency campaign verification
 */

import { ErgoAddress, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import type { Project } from "$lib/common/project";
import { CampaignPhase } from "$lib/common/project";

export interface VoteData {
    campaignId: string;
    voter: string;
    voteType: 'approved' | 'rejected';
    timestamp: number;
}

export interface VotingState {
    approved: number;
    rejected: number;
    total: number;
    voters: string[];
    threshold: number; // Percentage needed to approve (default 60)
}

export class VotingContract {
    private static VOTE_STORAGE_KEY = "ergo_campaign_votes_";
    private static VOTING_THRESHOLD = 60; // 60% approval required
    private static MIN_VOTES_REQUIRED = 20; // Minimum votes needed

    /**
     * Submit a vote for a campaign
     */
    static async submitVote(
        campaignId: string,
        project: Project,
        voteType: 'approved' | 'rejected',
        walletAddress: string
    ): Promise<{ success: boolean; message: string; votingState: VotingState }> {
        try {
            // Validate wallet is connected
            if (!walletAddress) {
                throw new Error("Wallet not connected");
            }

            // Check if user already voted
            const currentVotes = this.getVotesFromStorage(campaignId);
            if (currentVotes.voters.includes(walletAddress)) {
                throw new Error("You have already voted on this campaign");
            }

            // Check if campaign is in verification phase
            if (!project.content.emergency?.phase || 
                (project.content.emergency.phase !== CampaignPhase.PENDING_VERIFICATION && 
                 project.content.emergency.phase !== CampaignPhase.UNDER_REVIEW)) {
                throw new Error("Campaign is not in verification phase");
            }

            // Create vote data
            const voteData: VoteData = {
                campaignId,
                voter: walletAddress,
                voteType,
                timestamp: Date.now()
            };

            // In production, this would create an on-chain transaction
            // For now, we store locally and simulate blockchain
            const updatedVotes = this.addVoteToStorage(campaignId, voteData);

            // Check if threshold is met
            const newPhase = this.calculatePhaseFromVotes(updatedVotes);

            return {
                success: true,
                message: `Vote submitted successfully! ${voteType === 'approved' ? 'Approved' : 'Rejected'}`,
                votingState: updatedVotes
            };

        } catch (error) {
            console.error("Vote submission error:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to submit vote",
                votingState: this.getVotesFromStorage(campaignId)
            };
        }
    }

    /**
     * Get current voting state for a campaign
     */
    static getVotingState(campaignId: string): VotingState {
        return this.getVotesFromStorage(campaignId);
    }

    /**
     * Check if user has voted
     */
    static hasUserVoted(campaignId: string, walletAddress: string): boolean {
        const votes = this.getVotesFromStorage(campaignId);
        return votes.voters.includes(walletAddress);
    }

    /**
     * Get user's vote type
     */
    static getUserVote(campaignId: string, walletAddress: string): 'approved' | 'rejected' | null {
        const storageKey = `${this.VOTE_STORAGE_KEY}${campaignId}`;
        const data = localStorage.getItem(storageKey);
        
        if (!data) return null;
        
        try {
            const votes: VoteData[] = JSON.parse(data);
            const userVote = votes.find(v => v.voter === walletAddress);
            return userVote ? userVote.voteType : null;
        } catch {
            return null;
        }
    }

    /**
     * Check if campaign passed verification
     */
    static isVerificationPassed(campaignId: string): boolean {
        const state = this.getVotesFromStorage(campaignId);
        return this.meetsApprovalThreshold(state);
    }

    /**
     * Calculate new phase based on voting results
     */
    static calculatePhaseFromVotes(votingState: VotingState): CampaignPhase {
        // Not enough votes yet
        if (votingState.total < this.MIN_VOTES_REQUIRED) {
            return CampaignPhase.UNDER_REVIEW;
        }

        const approvalPercentage = (votingState.approved / votingState.total) * 100;

        // Check if approved
        if (approvalPercentage >= this.VOTING_THRESHOLD) {
            return CampaignPhase.APPROVED;
        }

        // Check if definitively rejected (even if more votes come, can't reach threshold)
        const remainingVotes = 100 - votingState.total; // Hypothetical max votes
        const maxPossibleApproval = ((votingState.approved + remainingVotes) / 100) * 100;
        
        if (maxPossibleApproval < this.VOTING_THRESHOLD) {
            return CampaignPhase.REJECTED;
        }

        // Still under review
        return CampaignPhase.UNDER_REVIEW;
    }

    /**
     * Check if approval threshold is met
     */
    private static meetsApprovalThreshold(state: VotingState): boolean {
        if (state.total < this.MIN_VOTES_REQUIRED) return false;
        const approvalPercentage = (state.approved / state.total) * 100;
        return approvalPercentage >= this.VOTING_THRESHOLD;
    }

    /**
     * Get votes from localStorage
     */
    private static getVotesFromStorage(campaignId: string): VotingState {
        const storageKey = `${this.VOTE_STORAGE_KEY}${campaignId}`;
        const data = localStorage.getItem(storageKey);
        
        if (!data) {
            return {
                approved: 0,
                rejected: 0,
                total: 0,
                voters: [],
                threshold: this.VOTING_THRESHOLD
            };
        }

        try {
            const votes: VoteData[] = JSON.parse(data);
            const approved = votes.filter(v => v.voteType === 'approved').length;
            const rejected = votes.filter(v => v.voteType === 'rejected').length;
            const voters = votes.map(v => v.voter);

            return {
                approved,
                rejected,
                total: votes.length,
                voters,
                threshold: this.VOTING_THRESHOLD
            };
        } catch (error) {
            console.error("Error parsing votes from storage:", error);
            return {
                approved: 0,
                rejected: 0,
                total: 0,
                voters: [],
                threshold: this.VOTING_THRESHOLD
            };
        }
    }

    /**
     * Add vote to localStorage
     */
    private static addVoteToStorage(campaignId: string, voteData: VoteData): VotingState {
        const storageKey = `${this.VOTE_STORAGE_KEY}${campaignId}`;
        const existingData = localStorage.getItem(storageKey);
        
        let votes: VoteData[] = [];
        if (existingData) {
            try {
                votes = JSON.parse(existingData);
            } catch {
                votes = [];
            }
        }

        // Add new vote
        votes.push(voteData);

        // Save back to storage
        localStorage.setItem(storageKey, JSON.stringify(votes));

        // Return updated state
        return this.getVotesFromStorage(campaignId);
    }

    /**
     * Clear votes (for testing/admin only)
     */
    static clearVotes(campaignId: string): void {
        const storageKey = `${this.VOTE_STORAGE_KEY}${campaignId}`;
        localStorage.removeItem(storageKey);
    }

    /**
     * Export votes for on-chain submission
     */
    static exportVotesForBlockchain(campaignId: string): VoteData[] {
        const storageKey = `${this.VOTE_STORAGE_KEY}${campaignId}`;
        const data = localStorage.getItem(storageKey);
        
        if (!data) return [];
        
        try {
            return JSON.parse(data);
        } catch {
            return [];
        }
    }
}
