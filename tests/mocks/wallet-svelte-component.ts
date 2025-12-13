// Minimal Node-friendly mock for wallet-svelte-component used by backend tests

// Simple writable store implementation compatible with basic subscribe/set usage
export type Unsubscriber = () => void;

export interface Writable<T> {
  subscribe(run: (value: T) => void): Unsubscriber;
  set(value: T): void;
  update(updater: (value: T) => T): void;
}

function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();

  function subscribe(run: (v: T) => void): Unsubscriber {
    subscribers.add(run);
    // Emit current value on subscribe
    try { run(value); } catch {}
    return () => subscribers.delete(run);
  }

  function set(v: T) {
    value = v;
    for (const s of subscribers) {
      try { s(value); } catch {}
    }
  }

  function update(updater: (v: T) => T) {
    set(updater(value));
  }

  return { subscribe, set, update };
}

// Stores exposed by the real library
export const walletConnected: Writable<boolean> = writable(false);
export const walletAddress: Writable<string> = writable("");
export const explorerUri: Writable<string | null> = writable(null);

// Wallet manager mock
export const walletManager = {
  async connectWallet(_name?: string): Promise<void> {
    walletConnected.set(true);
  },
  async disconnect(): Promise<void> {
    walletConnected.set(false);
  },
};

// Node-side helpers used by actions (provide harmless stubs)
export async function getCurrentHeight(): Promise<number> {
  return 0;
}

export async function getChangeAddress(): Promise<string> {
  // Dummy P2PK address (not actually used in unit tests)
  return "9fMockChangeAddress000000000000000000000000000000000000000000000000000";
}

export async function getUtxos(_amount?: string): Promise<any[]> {
  // Return empty list for tests that don't require wallet UTXOs
  return [];
}

export async function signTransaction<T>(unsigned: T): Promise<T> {
  // Echo back unsigned transaction for tests that don't submit
  return unsigned;
}

export async function submitTransaction(_signed: any): Promise<string> {
  // Return a dummy transaction id
  return "mock-tx-id";
}