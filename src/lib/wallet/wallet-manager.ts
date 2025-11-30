import { writable, derived, get } from 'svelte/store';
import type { WalletState, WalletInfo, WalletConnector, ErgoWalletAdapter } from './types';
import { NautilusWalletAdapter } from './adapters/nautilus';
import { SafewWalletAdapter } from './adapters/safew';

// Create wallet store
const createWalletStore = () => {
  const { subscribe, set, update } = writable<WalletState>({
    connectedWallet: null,
    availableWallets: [],
    isConnecting: false,
    error: null,
    modalOpen: false,
  });

  return {
    subscribe,
    set,
    update,

    // Actions
    setConnectedWallet: (wallet: WalletInfo | null) =>
      update((state) => ({ ...state, connectedWallet: wallet })),

    setConnecting: (isConnecting: boolean) => update((state) => ({ ...state, isConnecting })),

    setError: (error: string | null) => update((state) => ({ ...state, error })),

    setModalOpen: (modalOpen: boolean) => update((state) => ({ ...state, modalOpen })),

    setAvailableWallets: (wallets: WalletConnector[]) =>
      update((state) => ({ ...state, availableWallets: wallets })),
  };
};

export const walletStore = createWalletStore();

// Derived stores for easy access
export const walletConnected = derived(walletStore, ($store) => !!$store.connectedWallet);
export const walletAddress = derived(
  walletStore,
  ($store) => $store.connectedWallet?.address || ''
);
export const walletBalance = derived(
  walletStore,
  ($store) => $store.connectedWallet?.balance || { nanoErgs: 0n, tokens: [] }
);
export const walletError = derived(walletStore, ($store) => $store.error);
export const walletConnecting = derived(walletStore, ($store) => $store.isConnecting);
export const walletModalOpen = derived(walletStore, ($store) => $store.modalOpen);
export const availableWallets = derived(walletStore, ($store) => $store.availableWallets);

// Wallet connectors configuration
const walletConnectors: WalletConnector[] = [
  {
    id: 'nautilus',
    name: 'Nautilus Wallet',
    shortName: 'Nautilus',
    iconUrl: '/wallet-icons/nautilus.png',
    iconBackground: '#1a73e8',
    iconAccent: '#4285f4',
    downloadUrls: {
      chrome:
        'https://chrome.google.com/webstore/detail/nautilus-wallet/gjlmehlldlphhljhpnlddaodbjjcchai',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/nautilus/',
      browserExtension: 'https://github.com/capt-nemo429/nautilus-wallet',
    },
    createConnector: () => new NautilusWalletAdapter(),
  },
  {
    id: 'safew',
    name: 'SAFEW',
    shortName: 'SAFEW',
    iconUrl: '/wallet-icons/safew.png',
    iconBackground: '#ff6b35',
    iconAccent: '#ff8c42',
    downloadUrls: {
      chrome: 'https://chrome.google.com/webstore/detail/safew/jkcclpkbediabkjkoeghfimdcjnggpan',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/safew/',
      browserExtension: 'https://github.com/ThierryM1212/SAFEW',
    },
    createConnector: () => new SafewWalletAdapter(),
  },
];

// Wallet manager class
export class WalletManager {
  private currentAdapter: ErgoWalletAdapter | null = null;
  private balanceUpdateInterval: number | null = null;
  private addressPollInterval: number | null = null;

  constructor() {
    this.initializeWallets();
    this.setupAutoReconnect();
  }

  private initializeWallets() {
    // Check which wallets are installed and update the store
    const availableWallets = walletConnectors.map((connector) => ({
      ...connector,
      installed: connector.createConnector().isInstalled(),
    }));

    walletStore.setAvailableWallets(availableWallets);
  }

  async connectWallet(walletId: string): Promise<boolean> {
    try {
      console.log(`WalletManager: Connecting to wallet ${walletId}...`);
      walletStore.setConnecting(true);
      walletStore.setError(null);

      // Ensure any previous adapter is disconnected first
      if (this.currentAdapter) {
        try {
          await this.currentAdapter.disconnect();
        } catch (error) {
          console.warn('Error disconnecting previous adapter:', error);
        }
        this.currentAdapter = null;
      }

      const connector = walletConnectors.find((w) => w.id === walletId);
      if (!connector) {
        throw new Error(`Wallet ${walletId} not found`);
      }
      console.log(`WalletManager: Found connector for ${connector.name}`);

      const adapter = connector.createConnector();
      console.log(`WalletManager: Created adapter for ${connector.name}`);

      if (!adapter.isInstalled()) {
        console.log(`WalletManager: ${connector.name} is not installed`);
        throw new Error(`${connector.name} is not installed`);
      }
      console.log(`WalletManager: Installation check passed for ${connector.name}`);

      console.log(`WalletManager: Calling connect() on ${connector.name} adapter...`);

      // Add timeout to prevent hanging connections
      const connectPromise = adapter.connect();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000);
      });

      const connected = await Promise.race([connectPromise, timeoutPromise]);
      console.log(`WalletManager: Connect result for ${connector.name}:`, connected);

      if (!connected) {
        throw new Error(`Failed to connect to ${connector.name}`);
      }

      // Get wallet info
      console.log(`WalletManager: Getting wallet info for ${connector.name}...`);
      const address = await adapter.getChangeAddress();
      const addresses = await adapter.getAddresses();

      // Handle balance fetching with error handling
      let balance;
      try {
        balance = await adapter.getBalance();
        console.log(`WalletManager: Balance fetched successfully`);
      } catch (error) {
        console.warn(`WalletManager: Balance fetch failed, using default:`, error);
        balance = { nanoErgs: BigInt(0), tokens: [] };
      }

      const networkId = await adapter.getNetworkId();

      const walletInfo: WalletInfo = {
        adapter,
        address,
        addresses,
        balance,
        networkId,
        isConnected: true,
      };

      this.currentAdapter = adapter;
      walletStore.setConnectedWallet(walletInfo);

      // Sync with old stores for backward compatibility
      await this.syncWithOldStores(walletInfo);

      // Setup event listeners
      this.setupWalletEventListeners(adapter);

      // Start balance updates
      this.startBalanceUpdates();

      // Store connection for auto-reconnect
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ergo_wallet_connection', walletId);
        // Also store connection timestamp for debugging
        localStorage.setItem('ergo_wallet_connection_time', new Date().toISOString());
      }

      walletStore.setModalOpen(false);
      return true;
    } catch (error) {
      console.error('Wallet connection error:', error);
      walletStore.setError(error instanceof Error ? error.message : 'Connection failed');
      return false;
    } finally {
      walletStore.setConnecting(false);
    }
  }

  private async syncWithOldStores(walletInfo: WalletInfo): Promise<void> {
    try {
      // Import the old stores to maintain compatibility
      const { address, connected, balance, network, user_tokens } = await import('../common/store');

      // Update old stores with new wallet info
      address.set(walletInfo.address);
      connected.set(true);
      balance.set(Number(walletInfo.balance.nanoErgs));
      network.set(walletInfo.networkId === 'mainnet' ? 'ergo-mainnet' : 'ergo-testnet');

      // Clear cached token data to ensure fresh data for this wallet
      user_tokens.set(new Map());

      console.log('Synced new wallet system with old stores and cleared token cache');
    } catch (error) {
      console.error('Failed to sync with old stores:', error);
    }
  }

  async disconnectWallet(): Promise<void> {
    try {
      // Import the old stores to maintain compatibility
      const { address, connected, balance, network, user_tokens } = await import('../common/store');

      if (this.currentAdapter) {
        try {
          // Try to disconnect from wallet, but don't fail if it doesn't work
          await this.currentAdapter.disconnect();
        } catch (error) {
          console.warn('Wallet disconnect method failed, continuing with cleanup:', error);
        }
        this.currentAdapter = null;
      }

      this.stopBalanceUpdates();

      // Update new wallet stores
      walletStore.setConnectedWallet(null);
      walletStore.setError(null);

      // Update old stores for backward compatibility
      address.set(null);
      connected.set(false);
      balance.set(null);
      network.set(null);

      // Clear cached token data to ensure fresh data on next connection
      user_tokens.set(new Map());

      // Clear stored connection
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('ergo_wallet_connection');
      }

      // Small delay to ensure proper cleanup before next connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log('Wallet disconnected successfully');
    } catch (error) {
      console.error('Wallet disconnection error:', error);
      walletStore.setError(error instanceof Error ? error.message : 'Disconnection failed');
    }
  }

  async refreshBalance(): Promise<void> {
    const state = get(walletStore);
    if (!state.connectedWallet || !this.currentAdapter) return;

    try {
      const balance = await this.currentAdapter.getBalance();
      walletStore.update((state) => ({
        ...state,
        connectedWallet: state.connectedWallet
          ? {
              ...state.connectedWallet,
              balance,
            }
          : null,
      }));
    } catch (error) {
      console.error('Balance refresh error:', error);
    }
  }

  private async checkAddressChange(): Promise<void> {
    const state = get(walletStore);
    if (!state.connectedWallet || !this.currentAdapter) return;

    try {
      const newAddress = await this.currentAdapter.getChangeAddress();
      if (newAddress && newAddress !== state.connectedWallet.address) {
        let addresses: string[] = state.connectedWallet.addresses;
        try {
          addresses = await this.currentAdapter.getAddresses();
        } catch (_err) {
          // keep previous addresses if fetching fails
          console.log('Using cached addresses due to fetch failure', _err);
        }
        walletStore.update((s) => ({
          ...s,
          connectedWallet: s.connectedWallet
            ? {
                ...s.connectedWallet,
                address: newAddress,
                addresses,
              }
            : null,
        }));
      }
    } catch (_err) {
      // ignore transient errors
      console.log('Address polling error, ignoring', _err);
    }
  }

  private setupWalletEventListeners(adapter: ErgoWalletAdapter) {
    adapter.on('disconnect', () => {
      this.disconnectWallet();
    });

    adapter.on('addressChanged', async () => {
      try {
        const address = await adapter.getChangeAddress();
        const addresses = await adapter.getAddresses();
        walletStore.update((state) => ({
          ...state,
          connectedWallet: state.connectedWallet
            ? {
                ...state.connectedWallet,
                address,
                addresses,
              }
            : null,
        }));
      } catch (error) {
        console.error('Address change error:', error);
      }
    });

    adapter.on('balanceChanged', () => {
      this.refreshBalance();
    });
  }

  private startBalanceUpdates() {
    this.stopBalanceUpdates();
    // Update balance every 60 seconds instead of 30 to reduce API calls
    this.balanceUpdateInterval = setInterval(() => {
      this.refreshBalance();
    }, 60000);

    // Poll for address changes less frequently (every 5 seconds instead of 3)
    // to reduce performance impact
    this.addressPollInterval = setInterval(() => {
      void this.checkAddressChange();
    }, 5000);
  }

  private stopBalanceUpdates() {
    if (this.balanceUpdateInterval) {
      clearInterval(this.balanceUpdateInterval);
      this.balanceUpdateInterval = null;
    }
    if (this.addressPollInterval) {
      clearInterval(this.addressPollInterval);
      this.addressPollInterval = null;
    }
  }

  private async setupAutoReconnect() {
    if (typeof window === 'undefined') return;

    // Wait for wallets to be available
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const storedWalletId = localStorage.getItem('ergo_wallet_connection');
    if (storedWalletId) {
      try {
        // Attempt to reconnect to the stored wallet
        await this.connectWallet(storedWalletId);
      } catch (error) {
        console.error('Auto-reconnect failed:', error);
        localStorage.removeItem('ergo_wallet_connection');
      }
    }
  }

  openModal() {
    walletStore.setModalOpen(true);
  }

  closeModal() {
    walletStore.setModalOpen(false);
  }

  isConnected(): boolean {
    return this.currentAdapter !== null;
  }

  getConnectedWallet(): ErgoWalletAdapter | null {
    return this.currentAdapter;
  }
}

// Create singleton instance
export const walletManager = new WalletManager();
