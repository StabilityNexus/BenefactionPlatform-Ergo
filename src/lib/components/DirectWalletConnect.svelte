<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { onMount } from "svelte";
    
    let connecting = false;
    let connected = false;
    let error = "";
    let walletAddress = "";
    let diagnostics = "";

    async function connectNautilus() {
        connecting = true;
        error = "";
        diagnostics = "Starting connection...\n";
        
        try {
            // Detailed diagnostics
            diagnostics += `Window object exists: ${typeof window !== 'undefined'}\n`;
            diagnostics += `ergoConnector exists: ${typeof (window as any).ergoConnector !== 'undefined'}\n`;
            
            if (typeof (window as any).ergoConnector !== 'undefined') {
                const connector = (window as any).ergoConnector;
                diagnostics += `Available wallets: ${Object.keys(connector).join(', ')}\n`;
                diagnostics += `Nautilus exists: ${typeof connector.nautilus !== 'undefined'}\n`;
            }

            // Check if Nautilus is available
            if (!(window as any).ergoConnector || !(window as any).ergoConnector.nautilus) {
                throw new Error("Nautilus wallet not found. Please make sure:\n1. Nautilus extension is installed\n2. Nautilus is enabled in browser extensions\n3. Page has been refreshed after installing Nautilus");
            }

            diagnostics += "Calling nautilus.connect()...\n";
            console.log("Attempting to connect to Nautilus...");
            
            // Connect to Nautilus
            const nautilusApi = await (window as any).ergoConnector.nautilus.connect();
            diagnostics += "Connection API received\n";
            console.log("Nautilus API obtained:", nautilusApi);
            
            // Check if wallet is connected
            const isConnected = await nautilusApi.isConnected();
            diagnostics += `Wallet connected: ${isConnected}\n`;
            console.log("Is connected:", isConnected);
            
            if (isConnected) {
                // Get wallet address
                const changeAddress = await nautilusApi.get_change_address();
                walletAddress = changeAddress;
                connected = true;
                diagnostics += `Success! Address: ${changeAddress}\n`;
                console.log("Successfully connected! Address:", walletAddress);
            } else {
                throw new Error("Wallet API received but wallet shows as not connected. Try:\n1. Opening Nautilus extension\n2. Unlocking with password\n3. Clicking connect again");
            }
            
        } catch (err: any) {
            console.error("Connection error:", err);
            diagnostics += `ERROR: ${err.message}\n`;
            error = err.message || "Failed to connect to Nautilus";
            connected = false;
        } finally {
            connecting = false;
        }
    }

    onMount(() => {
        // Check what's available
        const hasErgoConnector = typeof (window as any).ergoConnector !== 'undefined';
        const hasNautilus = hasErgoConnector && typeof (window as any).ergoConnector.nautilus !== 'undefined';
        
        diagnostics = `On Mount Check:\nergoConnector: ${hasErgoConnector}\nNautilus: ${hasNautilus}\n`;
        
        if (hasErgoConnector) {
            const wallets = Object.keys((window as any).ergoConnector);
            diagnostics += `Available wallets: ${wallets.join(', ')}\n`;
        }
        
        console.log("DirectWalletConnect mounted:", diagnostics);
    });
</script>

<div class="direct-wallet-connect">
    {#if !connected}
        <Button 
            on:click={connectNautilus} 
            disabled={connecting}
            class="connect-btn"
        >
            {#if connecting}
                Connecting to Nautilus...
            {:else}
                🔗 Direct Connect Nautilus
            {/if}
        </Button>
    {:else}
        <div class="connected-info">
            <span class="success-icon">✅</span>
            <span class="address">{walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 6)}</span>
        </div>
    {/if}
    
    {#if error}
        <div class="error-message">
            ⚠️ {error}
        </div>
    {/if}
    
    {#if diagnostics}
        <details class="diagnostics">
            <summary>🔍 Connection Diagnostics (Click to expand)</summary>
            <pre>{diagnostics}</pre>
        </details>
    {/if}
</div>

<style>
    .direct-wallet-connect {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: center;
    }
    
    .connect-btn {
        min-width: 200px;
    }
    
    .connected-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: #10b981;
        color: white;
        border-radius: 0.5rem;
        font-weight: 500;
    }
    
    .success-icon {
        font-size: 1.2rem;
    }
    
    .error-message {
        padding: 0.75rem;
        background: #fee2e2;
        color: #991b1b;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        text-align: center;
        max-width: 400px;
        white-space: pre-wrap;
    }
    
    .diagnostics {
        margin-top: 1rem;
        padding: 0.5rem;
        background: #f3f4f6;
        border-radius: 0.375rem;
        font-size: 0.75rem;
        text-align: left;
        max-width: 500px;
    }
    
    .diagnostics summary {
        cursor: pointer;
        font-weight: 500;
        color: #4b5563;
        padding: 0.25rem;
    }
    
    .diagnostics pre {
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: white;
        border-radius: 0.25rem;
        overflow-x: auto;
        font-size: 0.7rem;
        color: #1f2937;
    }
</style>
