import type { ErgoWalletAdapter, WalletBalance, WalletEvent, WalletDownloadUrls } from '../types';

export abstract class BaseWalletAdapter implements ErgoWalletAdapter {
  abstract id: string;
  abstract name: string;
  abstract icon: string;
  abstract downloadUrls?: WalletDownloadUrls;
  
  protected eventListeners: Map<WalletEvent, Set<(data: any) => void>> = new Map();
  
  constructor() {
    // Initialize event listener map
    const events: WalletEvent[] = ['connect', 'disconnect', 'addressChanged', 'networkChanged', 'balanceChanged'];
    events.forEach(event => {
      this.eventListeners.set(event, new Set());
    });
  }
  
  // Abstract methods that must be implemented by subclasses
  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): Promise<boolean>;
  abstract getAddresses(): Promise<string[]>;
  abstract getChangeAddress(): Promise<string>;
  abstract getBalance(address?: string): Promise<WalletBalance>;
  abstract signTransaction(unsignedTx: any): Promise<any>;
  abstract submitTransaction(signedTx: any): Promise<string>;
  abstract getNetworkId(): Promise<string>;
  abstract getCurrentHeight(): Promise<number>;
  abstract isInstalled(): boolean;
  
  // Event handling implementation
  on(event: WalletEvent, callback: (data: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
  }
  
  off(event: WalletEvent, callback: (data: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }
  
  protected emit(event: WalletEvent, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in wallet event listener for ${event}:`, error);
        }
      });
    }
  }
  
  // Helper method to convert nanoErgs to ERG
  protected nanoErgsToErg(nanoErgs: number | string): number {
    return Number(nanoErgs) / 1e9;
  }
  
  // Helper method to convert ERG to nanoErgs
  protected ergToNanoErgs(erg: number): bigint {
    return BigInt(Math.floor(erg * 1e9));
  }
  
  // Helper method to handle errors consistently
  protected handleError(error: any, context: string): never {
    console.error(`${this.name} wallet error in ${context}:`, error);
    throw new Error(`${this.name}: ${error.message || error}`);
  }
}
