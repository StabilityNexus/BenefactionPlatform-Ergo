// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Project } from '../common/project';
import { fetch_projects } from './fetch';
import { submit_project } from './actions/submit';
import { withdraw } from './actions/withdraw';
import { buy_refund } from './actions/buy_refund';
import { rebalance } from './actions/rebalance';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import { temp_exchange } from './actions/temp_exchange';
import { type contract_version } from './contract';

export class ErgoPlatform implements Platform {

    id = "ergo";
    main_token = "ERG";
    icon = "";
    time_per_block = 2*60*1000;

    async connect(): Promise<void> {
        if (typeof ergoConnector !== 'undefined') {
            const nautilus = ergoConnector.nautilus;
            if (nautilus) {
                if (await nautilus.connect()) {
                    console.log('Connected!');
                    address.set(await ergo.get_change_address());
                    network.set((network_id == "mainnet") ? "ergo-mainnet" : "ergo-testnet");
                    await this.get_balance();
                    connected.set(true);
                } else {
                    alert('Not connected!');
                }
            } else {
                alert('Nautilus Wallet is not active');
            }
            } else {
                alert('No wallet available');
            }
    }

    async get_current_height(): Promise<number> {
        try {
            // If connected to the Ergo wallet, get the current height directly
            return await ergo.get_current_height();
        } catch {
            // Fallback to fetching the current height from the Ergo API
            try {
                const response = await fetch(explorer_uri+'/api/v1/networkState');
                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }
    
                const data = await response.json();
                return data.height; // Extract and return the height
            } catch (error) {
                console.error("Failed to fetch network height from API:", error);
                throw new Error("Unable to get current height.");
            }
        }
    }

    async get_balance(id?: string): Promise<Map<string, number>> {
        const balanceMap = new Map<string, number>();
        const addr = await ergo.get_change_address();

        if (addr) {
            try {
                // Fetch balance for the specific address from the API
                const response = await fetch(explorer_uri+`/api/v1/addresses/${addr}/balance/confirmed`);
                if (!response.ok) {
                    throw new Error(`API request failed with status: ${response.status}`);
                }
    
                const data = await response.json();
    
                // Add nanoErgs balance to the map
                balanceMap.set("ERG", data.nanoErgs);
                balance.set(data.nanoErgs)
    
                // Add tokens balances to the map
                data.tokens.forEach((token: { tokenId: string; amount: number }) => {
                    balanceMap.set(token.tokenId, token.amount);
                });
            } catch (error) {
                console.error(`Failed to fetch balance for address ${addr} from API:`, error);
                throw new Error("Unable to fetch balance.");
            }
        } else {
            throw new Error("Address is required to fetch balance.");
        }
    
        return balanceMap;
    }

    async buy_refund(project: Project, token_amount: number): Promise<string | null> {
        return await buy_refund(project, token_amount);
    }

    async rebalance(project: Project, token_amount: number): Promise<string | null> {
        return await rebalance(project, token_amount);
    }

    async submit(
        version: contract_version,
        token_id: string,
        token_amount: number,
        blockLimit: number,
        exchangeRate: number,
        projectContent: string,
        minimumSold: number,
        title: string
    ): Promise<string | null> {
        return await submit_project(
            version,
            token_id,
            token_amount,
            blockLimit,
            exchangeRate,
            projectContent,
            minimumSold,
            title
        );
    }

    async withdraw(project: Project, amount: number): Promise<string | null> {
        return await withdraw(project, amount);
    }

    async temp_exchange(project: Project, token_amount: number): Promise<string | null> {
        return await temp_exchange(project, token_amount);
    }

    async fetch(): Promise<Map<string, Project>> {
        return await fetch_projects();
    }
}
