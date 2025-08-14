import { BaseWalletAdapter } from './base';
import type { WalletBalance, WalletDownloadUrls } from '../types';

export class SafewWalletAdapter extends BaseWalletAdapter {
  id = 'safew';
  name = 'SAFEW';
  icon = '/wallet-icons/safew.svg';
  downloadUrls: WalletDownloadUrls = {
    chrome: 'https://chromewebstore.google.com/detail/safew-simple-and-fast-erg/fmpbldieijjehhalgjblbpgjmijencll',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/safew/',
    browserExtension: 'https://github.com/ThierryM1212/SAFEW/releases/latest'
  };

  async connect(): Promise<boolean> {
    try {
      if (!this.isInstalled()) {
        throw new Error('SAFEW wallet is not installed');
      }

      const safew = window.ergoConnector?.safew;
      if (!safew) {
        throw new Error('SAFEW connector not available');
      }

      const connected = await safew.connect();
      if (connected) {
        this.emit('connect');
        return true;
      }
      return false;
    } catch (error) {
      this.handleError(error, 'connect');
      return false; // This will never be reached due to handleError throwing, but TypeScript needs it
    }
  }

  async disconnect(): Promise<void> {
    try {
      const safew = window.ergoConnector?.safew;
      if (safew) {
        await safew.disconnect();
        this.emit('disconnect');
      }
    } catch (error) {
      console.error('SAFEW disconnect error:', error);
      // Don't throw on disconnect errors, just log them
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const safew = window.ergoConnector?.safew;
      if (!safew) return false;
      return await safew.isConnected();
    } catch (error) {
      console.error('SAFEW isConnected error:', error);
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
      return []; // This will never be reached due to handleError throwing, but prevents hanging promises
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
      return ''; // This will never be reached due to handleError throwing, but prevents hanging promises
    }
  }

  async getBalance(address?: string): Promise<WalletBalance> {
    try {
      if (!(await this.isConnected())) {
        throw new Error('Wallet not connected');
      }

      const addr = address || await this.getChangeAddress();
      
      const response = await fetch(`https://api.ergoplatform.com/api/v1/addresses/${addr}/balance/confirmed`);
      if (!response.ok) {
        throw new Error(`API request failed with status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        nanoErgs: BigInt(data.nanoErgs),
        tokens: data.tokens.map((token: any) => ({
          tokenId: token.tokenId,
          amount: BigInt(token.amount),
          name: token.name,
          decimals: token.decimals
        }))
      };
    } catch (error) {
      this.handleError(error, 'getBalance');
      // This will never be reached due to handleError throwing, but prevents hanging promises
      return { nanoErgs: BigInt(0), tokens: [] };
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
      
      // SafeW doesn't expose get_current_height() method
      // Fetch from Ergo Explorer API instead
      const response = await fetch('https://api.ergoplatform.com/api/v1/blocks?limit=1&offset=0');
      if (!response.ok) {
        throw new Error(`Failed to fetch current height: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].height;
      }
      
      throw new Error('Could not determine current blockchain height');
    } catch (error) {
      this.handleError(error, 'getCurrentHeight');
    }
  }

  isInstalled(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.ergoConnector !== 'undefined' && 
           typeof window.ergoConnector.safew !== 'undefined';
  }
}
