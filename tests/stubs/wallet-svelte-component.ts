// Stub for wallet-svelte-component.
//
// The published package ships Svelte components and extensionless ESM imports that Node cannot
// resolve, so vitest dies during collection with ERR_MODULE_NOT_FOUND before running a single
// test - including the tests already in the repo. It is pulled in transitively by $lib, so
// aliasing it to this module in vitest.config.ts is what lets the suite run at all.
//
// The surface here is deliberately the smallest thing that keeps module initialisation working:
// stores that can be subscribed to and written, and wallet calls that refuse loudly. Nothing
// under tests/ signs or submits anything, so a test that reaches one of these has gone wrong and
// should say so rather than quietly do nothing.
import { writable } from "svelte/store";

export const explorerUri = writable<string>("https://api.ergoplatform.com");
export const walletConnected = writable<boolean>(false);
export const walletAddress = writable<string>("");

const notInTests = (name: string) => async () => {
    throw new Error(`${name}() is not available in tests: the wallet is stubbed out`);
};

export const walletManager = {
    connectWallet: notInTests("walletManager.connectWallet"),
    disconnect: notInTests("walletManager.disconnect"),
};

export const getCurrentHeight = notInTests("getCurrentHeight");
export const getChangeAddress = notInTests("getChangeAddress");
export const signTransaction = notInTests("signTransaction");
export const submitTransaction = notInTests("submitTransaction");
export const getUtxos = notInTests("getUtxos");

export const WalletAddressChangeHandler = {};

export default {};
