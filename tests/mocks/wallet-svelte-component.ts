// Mock for wallet-svelte-component to allow contract tests to run
// Contract tests use MockChain and don't need actual wallet functionality

import { writable } from 'svelte/store';

// Mock stores
export const walletConnected = writable(false);
export const walletAddress = writable('');
export const explorerUri = writable('https://explorer.ergoplatform.com/en/');

// Mock wallet manager
export const walletManager = {
    connect: async () => false,
    disconnect: async () => { },
    getBalance: async () => 0n,
};

// Mock wallet functions (not used in contract tests but imported by action files)
export const getCurrentHeight = async (): Promise<number> => {
    throw new Error('getCurrentHeight should not be called in contract tests');
};

export const getChangeAddress = async (): Promise<string> => {
    throw new Error('getChangeAddress should not be called in contract tests');
};

export const signTransaction = async (tx: any): Promise<any> => {
    throw new Error('signTransaction should not be called in contract tests');
};

export const submitTransaction = async (tx: any): Promise<string> => {
    throw new Error('submitTransaction should not be called in contract tests');
};

export const getUtxos = async (): Promise<any[]> => {
    throw new Error('getUtxos should not be called in contract tests');
};

export const WalletAddressChangeHandler = () => { };
