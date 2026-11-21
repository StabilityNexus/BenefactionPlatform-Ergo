import { writable } from "svelte/store";

export interface MockWalletHandlers {
    getCurrentHeight: () => Promise<number>;
    getChangeAddress: () => Promise<string>;
    getUtxos: () => Promise<any[]>;
    signTransaction: (unsignedTx: any) => Promise<any>;
    submitTransaction: (signedTx: any) => Promise<string>;
}

let activeHandlers: MockWalletHandlers = {
    getCurrentHeight: async () => 800_000,
    getChangeAddress: async () => "",
    getUtxos: async () => [],
    signTransaction: async (tx) => tx,
    submitTransaction: async () => "mock_tx_id",
};

export function __setMockWallet(handlers: Partial<MockWalletHandlers>): void {
    activeHandlers = { ...activeHandlers, ...handlers };
}

export const walletConnected = writable<boolean>(false);
export const walletAddress = writable<string>("");
export const explorerUri = writable<string>("https://api.ergoplatform.com");

export const walletManager = {
    isConnected: () => false,
    getConnectedWallet: () => null,
    connectWallet: async (_name: string) => {},
};

export async function getCurrentHeight(): Promise<number> {
    return activeHandlers.getCurrentHeight();
}

export async function getChangeAddress(): Promise<string> {
    return activeHandlers.getChangeAddress();
}

export async function getUtxos(): Promise<any[]> {
    return activeHandlers.getUtxos();
}

export async function signTransaction(unsignedTx: any): Promise<any> {
    return activeHandlers.signTransaction(unsignedTx);
}

export async function submitTransaction(signedTx: any): Promise<string> {
    return activeHandlers.submitTransaction(signedTx);
}
