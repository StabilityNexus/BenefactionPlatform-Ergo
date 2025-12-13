// Mock for wallet-svelte-component to avoid ESM resolution issues in tests
// This module is not needed for contract tests

export const walletManager = {};
export const walletConnected = { subscribe: () => () => {} };
export const walletAddress = { subscribe: () => () => {} };
export const walletBalance = { subscribe: () => () => {} };
export const explorerUri = { subscribe: () => () => {} };

export const getCurrentHeight = async () => 0;
export const getChangeAddress = async () => '';
export const signTransaction = async () => ({});
export const submitTransaction = async () => '';
export const getUtxos = async () => [];

export default {};
