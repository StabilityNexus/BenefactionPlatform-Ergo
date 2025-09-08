import { BaseWalletAdapter } from './base';
import type { WalletBalance, WalletDownloadUrls } from '../types';

export class NautilusWalletAdapter extends BaseWalletAdapter {
  id = 'nautilus';
  name = 'Nautilus Wallet';
  icon = '/wallet-icons/nautilus.svg';
  downloadUrls: WalletDownloadUrls = {
    chrome: 'https://chrome.google.com/webstore/detail/nautilus-wallet/gjlmehlldlphhljhpnlddaodbjjcchai',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/nautilus/',
    browserExtension: 'https://github.com/capt-nemo429/nautilus-wallet'
  };

  async connect(): Promise<boolean> {
    try {
      if (!this.isInstalled()) {
        throw new Error('Nautilus wallet is not installed');
      }

      const nautilus = window.ergoConnector?.nautilus;
      if (!nautilus) {
        throw new Error('Nautilus connector not available');
      }

      const connected = await nautilus.connect();
      if (connected) {
        this.emit('connect');
        return true;
      }
      return false;
    } catch (error) {
      this.handleError(error, 'connect');
    }
  }

  async disconnect(): Promise<void> {
    try {
      const nautilus = window.ergoConnector?.nautilus;
      if (nautilus) {
        await nautilus.disconnect();
        this.emit('disconnect');
      }
    } catch (error) {
      this.handleError(error, 'disconnect');
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const nautilus = window.ergoConnector?.nautilus;
      if (!nautilus) return false;
      return await nautilus.isConnected();
    } catch (error) {
      return false;
    }
  }

  async getAddresses(): Promise<string[]> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      return await window.ergo!.get_used_addresses();
    } catch (error) {
      this.handleError(error, 'getAddresses');
    }
  }

  async getChangeAddress(): Promise<string> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      return await window.ergo!.get_change_address();
    } catch (error) {
      this.handleError(error, 'getChangeAddress');
    }
  }

  async getBalance(address?: string): Promise<WalletBalance> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }

      const addr = address || await this.getChangeAddress();
      
      // Import explorer_uri from store to use the configured endpoint
      const { get } = await import('svelte/store');
      const { explorer_uri } = await import('../../common/store');
      const apiUrl = get(explorer_uri) || 'https://api.ergoplatform.com';
      
      // Use the configured API endpoint
      const response = await fetch(`${apiUrl}/api/v1/addresses/${addr}/balance/confirmed`).catch(err => {
        console.warn('Balance fetch network error:', err.message);
        return null;
      });
      
      if (!response || !response.ok) {
        console.warn(`Balance API request failed`);
        // Return zero balance on error instead of throwing
        return {
          nanoErgs: BigInt(0),
          tokens: []
        };
      }

      const data = await response.json();
      
      return {
        nanoErgs: BigInt(data.nanoErgs || 0),
        tokens: (data.tokens || []).map((token: any) => ({
          tokenId: token.tokenId,
          amount: BigInt(token.amount || 0),
          name: token.name,
          decimals: token.decimals
        }))
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
    }
  }

  async signTransaction(unsignedTx: any): Promise<any> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      return await window.ergo!.sign_tx(unsignedTx);
    } catch (error) {
      this.handleError(error, 'signTransaction');
    }
  }

  async submitTransaction(signedTx: any): Promise<string> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      return await window.ergo!.submit_tx(signedTx);
    } catch (error) {
      this.handleError(error, 'submitTransaction');
    }
  }

  async getNetworkId(): Promise<string> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      // Import network_id from environment configuration
      const { network_id } = await import('../../ergo/envs');
      return network_id === 'mainnet' ? 'mainnet' : 'testnet';
    } catch (error) {
      this.handleError(error, 'getNetworkId');
    }
  }

  async getCurrentHeight(): Promise<number> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }
      return await window.ergo!.get_current_height();
    } catch (error) {
      this.handleError(error, 'getCurrentHeight');
    }
  }

  isInstalled(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.ergoConnector !== 'undefined' && 
           typeof window.ergoConnector.nautilus !== 'undefined';
  }
}
