// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Project } from '../common/project';
import { fetch_projects } from './fetch';
import { submit_project } from './submit';
import { withdraw } from './withdraw';
import { exchange } from './exchange';
import { rebalance } from './rebalance';
import { explorer_uri, ergo_tree_template_hash } from './envs';
import { address, connected, network, balance } from "../common/store";

export class ErgoPlatform implements Platform {

    async connect(): Promise<void> {
        if (typeof ergoConnector !== 'undefined') {
            const nautilus = ergoConnector.nautilus;
            if (nautilus) {
                if (await nautilus.connect()) {
                    console.log('Connected!');
                    address.set(await ergo.get_change_address());
                    network.set("ergo-mainnet");
                    balance.set(await ergo.get_balance("ERG"));
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
        return await ergo.get_current_height();
    }

    async get_balance(id?: string): Promise<Map<string, number>> {
        const balanceMap = new Map<string, number>();

        if (id) {
            const balanceString = await ergo.get_balance(id);
            balanceMap.set(id, Number(balanceString));
        } else {
            const balancesArray = await ergo.get_balance("all");
            balancesArray.forEach(asset => {
                balanceMap.set(asset.tokenId, Number(asset.balance));
            });
        }

        return balanceMap;
    }

    async exchange(project: Project, token_amount: number): Promise<string | null> {
        return await exchange(project, token_amount);
    }

    async rebalance(project: Project, token_amount: number): Promise<string | null> {
        return await rebalance(project, token_amount);
    }

    async submit(data: {
        token_id: string | null;
        token_amount: number | null;
        blockLimit: number;     
        exchangeRate: number;   
        projectLink: string;    
        minimumSold: number;     
    }): Promise<string | null> {
        return await submit_project(
            data.token_id,
            data.token_amount,
            data.blockLimit,
            data.exchangeRate,
            data.projectLink,
            data.minimumSold
        );
    }

    async withdraw(project: Project, amount: number): Promise<string | null> {
        return await withdraw(project, amount);
    }

    async fetch(): Promise<any> {
        return await fetch_projects(explorer_uri, ergo_tree_template_hash, await ergo);
    }
}
