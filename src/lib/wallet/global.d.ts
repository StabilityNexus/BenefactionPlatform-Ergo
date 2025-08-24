// Global type declarations for Ergo wallet connectors
declare global {
  interface Window {
    ergoConnector?: {
      nautilus?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
        disconnect(): Promise<void>;
        getContext(): Promise<any>;
      };
      safew?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
        disconnect(): Promise<void>;
        getContext(): Promise<any>;
      };
      [key: string]: any;
    };
    
    ergo?: {
      get_utxos(amount?: string, token_id?: string): Promise<any[]>;
      get_balance(token_id?: string): Promise<string>;
      get_used_addresses(): Promise<string[]>;
      get_unused_addresses(): Promise<string[]>;
      get_change_address(): Promise<string>;
      sign_tx(tx: any): Promise<any>;
      submit_tx(tx: any): Promise<string>;
      get_current_height(): Promise<number>;
      get_network_id(): Promise<number>;
    };
  }
}

export {};
