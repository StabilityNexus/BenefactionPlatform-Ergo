// Utility functions to handle wallet operations with SAFEW compatibility

import { walletManager } from '../wallet/wallet-manager';

/**
 * Get current blockchain height - SAFEW compatible
 * Uses wallet adapter if available, falls back to API
 */
export async function getCurrentHeight(): Promise<number> {
  try {
    // Check if wallet manager is available and connected
    if (walletManager && walletManager.isConnected()) {
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

  // Fallback to API
  const response = await fetch('https://api.ergoplatform.com/api/v1/blocks?limit=1&offset=0');
  if (!response.ok) {
    throw new Error(`Failed to fetch current height: ${response.status}`);
  }

  const data = await response.json();
  if (data.items && data.items.length > 0) {
    return data.items[0].height;
  }

  throw new Error('Could not determine current blockchain height');
}

/**
 * Get wallet change address - SAFEW compatible
 */
export async function getChangeAddress(): Promise<string> {
  if (walletManager && walletManager.isConnected()) {
    const adapter = walletManager.getConnectedWallet();
    if (adapter) {
      return await adapter.getChangeAddress();
    }
  }

  // Fallback to direct ergo call
  if (typeof window !== 'undefined' && window.ergo) {
    return await window.ergo.get_change_address();
  }

  throw new Error('No wallet connected');
}

/**
 * Sign transaction - SAFEW compatible
 */
export async function signTransaction(unsignedTx: any): Promise<any> {
  if (walletManager && walletManager.isConnected()) {
    const adapter = walletManager.getConnectedWallet();
    if (adapter) {
      return await adapter.signTransaction(unsignedTx);
    }
  }

  // Fallback to direct ergo call
  if (typeof window !== 'undefined' && window.ergo) {
    return await window.ergo.sign_tx(unsignedTx);
  }

  throw new Error('No wallet connected');
}

/**
 * Submit transaction - SAFEW compatible
 */
export async function submitTransaction(signedTx: any): Promise<string> {
  if (walletManager && walletManager.isConnected()) {
    const adapter = walletManager.getConnectedWallet();
    if (adapter) {
      return await adapter.submitTransaction(signedTx);
    }
  }

  // Fallback to direct ergo call
  if (typeof window !== 'undefined' && window.ergo) {
    return await window.ergo.submit_tx(signedTx);
  }

  throw new Error('No wallet connected');
}
