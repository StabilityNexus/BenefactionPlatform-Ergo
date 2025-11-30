// Core wallet types for Ergo RainbowKit-style implementation
export interface ErgoWalletAdapter {
  // Wallet identification
  id: string;
  name: string;
  icon: string;
  downloadUrls?: WalletDownloadUrls;

  // Connection methods
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;

  // Address management
  getAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;

  // Balance queries
  getBalance(address?: string): Promise<WalletBalance>;

  // Transaction methods
  signTransaction(unsignedTx: any): Promise<any>;
  submitTransaction(signedTx: any): Promise<string>;

  // Network info
  getNetworkId(): Promise<string>;
  getCurrentHeight(): Promise<number>;

  // Event handling
  on(event: WalletEvent, callback: (data: any) => void): void;
  off(event: WalletEvent, callback: (data: any) => void): void;

  // Installation detection
  isInstalled(): boolean;
}

export interface WalletBalance {
  nanoErgs: bigint;
  tokens: WalletToken[];
}

export interface WalletToken {
  tokenId: string;
  amount: bigint;
  name?: string;
  decimals?: number;
}

export interface WalletDownloadUrls {
  chrome?: string;
  firefox?: string;
  edge?: string;
  safari?: string;
  browserExtension?: string;
  android?: string;
  ios?: string;
  mobile?: string;
  desktop?: string;
}

export type WalletEvent =
  | "connect"
  | "disconnect"
  | "addressChanged"
  | "networkChanged"
  | "balanceChanged";

export interface WalletInfo {
  adapter: ErgoWalletAdapter;
  address: string;
  addresses: string[];
  balance: WalletBalance;
  networkId: string;
  isConnected: boolean;
}

export interface WalletModalConfig {
  title?: string;
  showRecentTransactions?: boolean;
  showBalance?: boolean;
  theme?: "light" | "dark" | "auto";
}

// Wallet connector interface similar to RainbowKit
export interface WalletConnector {
  id: string;
  name: string;
  shortName?: string;
  iconUrl: string;
  iconBackground: string;
  iconAccent?: string;
  installed?: boolean;
  downloadUrls?: WalletDownloadUrls;
  createConnector: () => ErgoWalletAdapter;
}

// Global wallet state
export interface WalletState {
  connectedWallet: WalletInfo | null;
  availableWallets: WalletConnector[];
  isConnecting: boolean;
  error: string | null;
  modalOpen: boolean;
}
