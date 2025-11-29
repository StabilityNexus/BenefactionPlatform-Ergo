<script lang="ts">
  import { walletManager,availableWallets, walletConnecting, walletError, walletConnected } from '$lib/wallet/wallet-manager';
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Alert from "$lib/components/ui/alert";
  import { ExternalLink, Download, Loader2, AlertCircle } from "lucide-svelte";

  export let open = false;
  let connectingWalletId: string | null = null;

  $: if (!open) {
    walletManager.closeModal();
  }

  // Auto-close modal when wallet connects successfully
  $: if ($walletConnected && open) {
    open = false;
    connectingWalletId = null;
  }

  async function handleWalletConnect(walletId: string) {
    connectingWalletId = walletId;
    const success = await walletManager.connectWallet(walletId);
    if (!success) {
      connectingWalletId = null;
    }
    // If successful, the modal will auto-close via the reactive statement above
  }

  function handleInstallWallet(downloadUrls: any) {
    // Detect browser and open appropriate download link
    const userAgent = navigator.userAgent.toLowerCase();
    let downloadUrl = downloadUrls.browserExtension;

    if (userAgent.includes('chrome') && downloadUrls.chrome) {
      downloadUrl = downloadUrls.chrome;
    } else if (userAgent.includes('firefox') && downloadUrls.firefox) {
      downloadUrl = downloadUrls.firefox;
    } else if (userAgent.includes('edge') && downloadUrls.edge) {
      downloadUrl = downloadUrls.edge;
    } else if (userAgent.includes('safari') && downloadUrls.safari) {
      downloadUrl = downloadUrls.safari;
    }

    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-center text-xl font-semibold">
        Connect Wallet
      </Dialog.Title>
      <Dialog.Description class="text-center text-sm text-muted-foreground">
        Choose your preferred Ergo wallet to connect
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      {#if $walletError}
        <Alert.Root variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <Alert.Title>Connection Error</Alert.Title>
          <Alert.Description>{$walletError}</Alert.Description>
        </Alert.Root>
      {/if}

      <div class="space-y-2">
        {#each $availableWallets as wallet (wallet.id)}
          <div class="wallet-option">
            {#if wallet.installed}
              <Button
                variant="outline"
                class="w-full h-16 justify-between p-4 hover:bg-accent/50 transition-colors"
                disabled={$walletConnecting || connectingWalletId === wallet.id}
                on:click={() => handleWalletConnect(wallet.id)}
              >
                <div class="flex items-center space-x-3">
                  <div 
                    class="w-8 h-8 rounded-full flex items-center justify-center"
                    style="background-color: {wallet.iconBackground}"
                  >
                    <img 
                      src={wallet.iconUrl} 
                      alt={wallet.name}
                      class="w-6 h-6"
                      on:error={(e) => {
                        // Fallback to a generic wallet icon if image fails to load
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                  <div class="text-left">
                    <div class="font-medium">{wallet.name}</div>
                    <div class="text-xs text-muted-foreground">
                      {wallet.shortName || wallet.name}
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center space-x-2">
                  {#if connectingWalletId === wallet.id}
                    <Badge variant="secondary" class="text-xs">
                      Connecting...
                    </Badge>
                    <Loader2 class="h-4 w-4 animate-spin" />
                  {:else}
                    <Badge variant="secondary" class="text-xs">
                      Installed
                    </Badge>
                  {/if}
                </div>
              </Button>
            {:else}
              <div class="wallet-option-disabled">
                <div class="flex items-center justify-between w-full p-4">
                  <div class="flex items-center space-x-3">
                    <div 
                      class="w-8 h-8 rounded-full flex items-center justify-center opacity-50"
                      style="background-color: {wallet.iconBackground}"
                    >
                      <img 
                        src={wallet.iconUrl} 
                        alt={wallet.name}
                        class="w-6 h-6 opacity-50"
                        on:error={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div class="text-left">
                      <div class="font-medium text-muted-foreground">{wallet.name}</div>
                      <div class="text-xs text-muted-foreground">
                        Not installed
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-xs"
                    on:click={() => handleInstallWallet(wallet.downloadUrls)}
                  >
                    <Download class="h-3 w-3 mr-1" />
                    Install
                    <ExternalLink class="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="text-center pt-4">
        <p class="text-xs text-muted-foreground">
          New to Ergo wallets? 
          <a 
            href="https://ergoplatform.org/en/wallets/" 
            target="_blank" 
            class="text-primary hover:underline"
          >
            Learn more
            <ExternalLink class="h-3 w-3 inline ml-1" />
          </a>
        </p>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .wallet-option {
    @apply rounded-lg border border-border overflow-hidden;
  }
  
  .wallet-option-disabled {
    @apply rounded-lg border border-border bg-muted/30 overflow-hidden;
  }
  
  :global(.wallet-option .lucide) {
    @apply transition-transform;
  }
  
  :global(.wallet-option:hover .lucide) {
    @apply scale-110;
  }
</style>
