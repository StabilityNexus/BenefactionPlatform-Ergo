// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Project } from '../common/project';
import { submit_project } from './actions/submit';
import { withdraw } from './actions/withdraw';
import { buy_refund } from './actions/buy_refund';
import { rebalance } from './actions/rebalance';
import { balance, explorer_uri } from "../common/store";
import { walletManager, walletConnected, walletAddress, explorerUri as libExplorerUri } from "wallet-svelte-component";
import { get } from "svelte/store";
import { temp_exchange } from './actions/temp_exchange';
import { type contract_version } from './contract';

export class ErgoPlatform implements Platform {

    id = "ergo";
    main_token = "ERG";
    icon = "";
    time_per_block = 2 * 60 * 1000;  // every 2 minutes
    last_version: contract_version = "v2";

    constructor() {
        // Sync explorer URI from app to wallet library
        explorer_uri.subscribe(uri => {
            if (uri) {
                libExplorerUri.set(uri);
            }
        });
    }

    async connect(): Promise<void> {
        // This method is now deprecated - wallet connection is handled by WalletManager
        // Check if already connected via new wallet system
        const isConnected = get(walletConnected);
        if (isConnected) {
            console.log('Already connected via new wallet system');
            return;
        }

        console.warn('ErgoPlatform.connect() is deprecated. Use WalletManager instead.');
        // For backward compatibility, try to connect to Nautilus if available
        try {
            await walletManager.connectWallet('nautilus');
        } catch (error) {
            console.error('Failed to connect via WalletManager:', error);
        }
    }

    async get_current_height(): Promise<number> {
        try {
            // Check if wallet manager is available and connected
            if (walletManager && walletManager.isConnected()) {
                // Use wallet adapter's getCurrentHeight method which handles SafeW correctly
                const adapter = walletManager.getConnectedWallet();
                if (adapter && adapter.getCurrentHeight) {
                    return await adapter.getCurrentHeight();
                }
            }

            // Try direct window.ergo if available (for legacy compatibility with Nautilus)
            if (typeof window !== 'undefined' && window.ergo && window.ergo.get_current_height) {
                return await window.ergo.get_current_height();
            }
        } catch (error) {
            console.warn('Failed to get height from wallet, falling back to API:', error);
        }

        // Fallback to fetching the current height from the Ergo API
        try {
            const response = await fetch(get(explorer_uri) + '/api/v1/networkState');
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

    async get_balance(id?: string): Promise<Map<string, number>> {
        const balanceMap = new Map<string, number>();

        // Get address from new wallet system or fallback to ergo global
        let addr: string | null = null;
        try {
            const walletAddr = get(walletAddress);
            if (walletAddr) {
                addr = walletAddr;
            } else if (typeof window !== 'undefined' && window.ergo) {
                addr = await window.ergo.get_change_address();
            }
        } catch (error) {
            console.error('Failed to get wallet address:', error);
        }

        if (addr) {
            try {
                // Try to get balance from wallet manager first
                let walletBalance: any = null;
                
                if (walletManager && walletManager.isConnected()) {
                    const adapter = walletManager.getConnectedWallet();
                    if (adapter && adapter.getBalance) {
                        walletBalance = await adapter.getBalance();
                        console.log("💰 Wallet balance from adapter:", walletBalance);
                    }
                }
                
                // Fallback to window.ergo for Nautilus
                if (!walletBalance && typeof window !== 'undefined' && window.ergo) {
                    walletBalance = await window.ergo.get_balance();
                    console.log("💰 Wallet balance from window.ergo:", walletBalance);
                }

                if (walletBalance) {
                    // Handle different balance response formats
                    let ergBalance: bigint;
                    let tokensList: any[] = [];
                    
                    // Format 1: {nanoErgs: bigint, tokens: [...]}
                    if (walletBalance.nanoErgs !== undefined) {
                        ergBalance = typeof walletBalance.nanoErgs === 'bigint' 
                            ? walletBalance.nanoErgs 
                            : BigInt(walletBalance.nanoErgs);
                        tokensList = walletBalance.tokens || [];
                    }
                    // Format 2: {balance: string, tokens: [...]}
                    else if (walletBalance.balance !== undefined) {
                        ergBalance = BigInt(walletBalance.balance);
                        tokensList = walletBalance.tokens || [];
                    }
                    // Format 3: direct bigint value
                    else if (typeof walletBalance === 'bigint' || typeof walletBalance === 'number' || typeof walletBalance === 'string') {
                        ergBalance = BigInt(walletBalance);
                    }
                    else {
                        throw new Error("Unrecognized wallet balance format");
                    }
                    
                    // Add ERG balance to the map
                    balanceMap.set("ERG", ergBalance);
                    balance.set(ergBalance);

                    // Add tokens balances to the map
                    if (tokensList.length > 0) {
                        tokensList.forEach((token: { tokenId: string; amount: string | bigint }) => {
                            const tokenAmount = typeof token.amount === 'bigint' 
                                ? token.amount 
                                : BigInt(token.amount);
                            balanceMap.set(token.tokenId, tokenAmount);
                        });
                    }
                    console.log("✅ Balance loaded:", balanceMap.size, "items (ERG + " + tokensList.length + " tokens)");
                } else {
                    throw new Error("Could not retrieve balance from wallet");
                }
            } catch (error) {
                console.error(`Failed to fetch balance from wallet:`, error);
                throw new Error("Unable to fetch balance from wallet.");
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

    async *submit(
        version: contract_version,
        token_id: string,
        token_amount: number,
        blockLimit: number,
        is_timestamp_limit: boolean,
        exchangeRate: number,
        projectContent: string,
        minimumSold: number,
        title: string,
        base_token_id: string = "",
        owner_ergotree: string = ""
    ): AsyncGenerator<string, string | null, void> {
        return yield* submit_project(
            version,
            token_id,
            token_amount,
            blockLimit,
            is_timestamp_limit,
            exchangeRate,
            projectContent,
            minimumSold,
            title,
            base_token_id,
            owner_ergotree
        );
    }

    async withdraw(project: Project, amount: number): Promise<string | null> {
        return await withdraw(project, amount);
    }

    async temp_exchange(project: Project, token_amount: number): Promise<string | null> {
        return await temp_exchange(project, token_amount);
    }

    async fetch(offset: number = 0): Promise<Map<string, Project>> {
        return await new Map();
    }
}