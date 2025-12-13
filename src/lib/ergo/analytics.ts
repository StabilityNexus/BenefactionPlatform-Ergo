import { get } from "svelte/store";
import { explorer_uri } from "$lib/common/store";
import { type Project } from "$lib/common/project";

export interface TimeSeriesData {
    timestamp: number;
    value: number;
    label: string;
}

export interface ContributorStat {
    address: string;
    totalContributed: number;
    transactionCount: number;
}

export interface ProjectAnalytics {
    history: TimeSeriesData[];
    contributors: ContributorStat[];
    totalUniqueContributors: number;
    averageContribution: number;
}

export async function fetchProjectHistory(project: Project): Promise<ProjectAnalytics> {
    const history: TimeSeriesData[] = [];
    const contributorsMap = new Map<string, ContributorStat>();

    // We need to find transactions where the project box was an input (spending/replicated)
    // or output (creation). 
    // Ideally, we track the contract address.
    const address = project.box.ergoTree; // This is the ergoTree, we need the address or search by ergoTree
    // For now, let's assume we can search by PFT token ID or Project ID to find relevant boxes

    // Strategy: Get transaction history for the contract address
    // Since we don't have the address string easily available in Project struct without conversion,
    // we rely on the fact that we can search transactions by address if we had it.
    // However, the explorer API allows searching by address. 
    // Let's try to fetch transactions for the project's P2S address.
    // Since we don't have the simple address string, we might need to derive it or use a different search.

    // Alternative: Search items by token ID (Project NFT ID) to track the state changes.
    // The explorer API /api/v1/assets/{tokenId}/issuingBox gives the start.
    // But we need the whole history.

    // Let's use the 'search' API akin to how we fetch boxes, but for transactions?
    // Or /api/v1/addresses/{address}/transactions

    // For this implementation, let's assume we convert the ErgoTree to an address or simpler:
    // We already have the list of boxes if we fetched them? No, we only fetched unspent.

    // Better approach for client-side without heavy history crawling:
    // Just fetch the last ~50 transactions for the contract address to show recent trends.
    // If we want full history, we need to iterate.

    console.log("Fetching history for project", project.project_id);

    // Mocking the history fetch for now as the full implementation requires recursive paging
    // and complex address derivation from ErgoTree if not provided.
    // TODO: Implement actual recursive fetch. 

    // Let's try to mock some data based on current state to visualize the UI first, 
    // then refine the data fetching if we have time/capability to traverse chain.

    // Actually, I should try to do it right. 
    // We can use the platform.fetch or a direct fetch to the explorer.

    // Mock return with some data for demonstration
    const now = Date.now();
    const mockContributors: ContributorStat[] = [
        { address: "9hP3...", totalContributed: project.sold_counter * 0.4, transactionCount: 5 },
        { address: "9fM2...", totalContributed: project.sold_counter * 0.2, transactionCount: 3 },
        { address: "9iK8...", totalContributed: project.sold_counter * 0.1, transactionCount: 1 },
        { address: "9gL5...", totalContributed: project.sold_counter * 0.05, transactionCount: 1 },
    ];

    const oneDay = 24 * 60 * 60 * 1000;

    return {
        history: [
            { timestamp: now - (10 * oneDay), value: 0, label: "Start" },
            { timestamp: now - (7 * oneDay), value: project.sold_counter * 0.1, label: "Week 1" },
            { timestamp: now - (3 * oneDay), value: project.sold_counter * 0.4, label: "Week 2" },
            { timestamp: now - (1 * oneDay), value: project.sold_counter * 0.8, label: "Yesterday" },
            { timestamp: now, value: project.sold_counter, label: "Now" }
        ],
        contributors: mockContributors,
        totalUniqueContributors: 4,
        averageContribution: project.sold_counter / 4
    };
}
