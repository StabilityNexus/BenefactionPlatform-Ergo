<script lang="ts">
  import { onMount } from 'svelte';
  import { walletAddress } from '$lib/wallet/wallet-manager';
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import * as Alert from "$lib/components/ui/alert";
  import { AlertCircle, RefreshCw, RotateCw } from "lucide-svelte";
  
  let previousAddress: string | null = null;
  let showRefreshDialog = false;
  let isRefreshing = false;
  
  // Track wallet address changes (using derived store)
  $: if ($walletAddress !== previousAddress) {
    // Only act when we have a valid new address and a previous address existed
    if (previousAddress !== null && $walletAddress && $walletAddress !== '') {
      console.log('WalletAddressChangeHandler: Address changed from', previousAddress, 'to', $walletAddress);
      handleAddressChange();
    }
    previousAddress = $walletAddress || null;
  }
  
  function handleAddressChange() {
    showRefreshDialog = true;
  }
  
  async function handleSoftRefresh() {
    isRefreshing = true;
    showRefreshDialog = false;
  
    
    
    // Trigger a soft refresh by navigating to the same page
    // This will cause components to re-fetch data
    window.dispatchEvent(new CustomEvent('wallet-address-changed', { 
      detail: { newAddress: $walletAddress } 
    }));
    
    setTimeout(() => {
      isRefreshing = false;
    }, 1000);
  }
  
  function handleHardRefresh() {
    
    
    
    // Store a flag in sessionStorage to show a success message after reload
    sessionStorage.setItem('wallet_address_changed', 'true');
    
    // Hard refresh the page
    window.location.reload();
  }
  
  // Check if we just did a hard refresh
  onMount(() => {
    if (sessionStorage.getItem('wallet_address_changed') === 'true') {
      sessionStorage.removeItem('wallet_address_changed');
      // Could show a toast notification here if you have a toast system
      console.log('Wallet address change refresh completed');
    }
  });
</script>

<!-- Refresh Dialog for Wallet Address Changes -->
<Dialog.Root bind:open={showRefreshDialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <AlertCircle class="h-5 w-5 text-orange-500" />
        Wallet Address Changed
      </Dialog.Title>
      <Dialog.Description>
        Your wallet address has changed. Please refresh the page to load data for the new address.
      </Dialog.Description>
    </Dialog.Header>
    
    <Alert.Root class="mt-4 border-orange-200 bg-orange-50">
      <AlertCircle class="h-4 w-4 text-orange-600" />
      <Alert.Title class="text-orange-800">Important</Alert.Title>
      <Alert.Description class="text-orange-700">
        Your contributions, projects, and balances are tied to your wallet address. 
        A refresh is required to display the correct data for your new address.
      </Alert.Description>
    </Alert.Root>
    
    <div class="space-y-3 mt-6">
      <div class="space-y-2">
        <Button 
          variant="outline" 
          class="w-full justify-start gap-2"
          on:click={handleSoftRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw class="h-4 w-4" />
          <div class="text-left">
            <div class="font-medium">Soft Refresh</div>
            <div class="text-xs text-muted-foreground">
              Reload current page data only
            </div>
          </div>
        </Button>
        
        <Button 
          variant="default" 
          class="w-full justify-start gap-2 bg-orange-600 hover:bg-orange-700"
          on:click={handleHardRefresh}
        >
          <RotateCw class="h-4 w-4" />
          <div class="text-left">
            <div class="font-medium">Hard Refresh (Recommended)</div>
            <div class="text-xs">
              Full page reload for complete data refresh
            </div>
          </div>
        </Button>
      </div>
      
      <div class="text-center">
        <Button 
          variant="ghost" 
          size="sm"
          on:click={() => showRefreshDialog = false}
          class="text-xs text-muted-foreground"
        >
          Dismiss (Not Recommended)
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- Loading indicator for soft refresh -->
{#if isRefreshing}
  <div class="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2 z-50">
    <RefreshCw class="h-4 w-4 animate-spin text-primary" />
    <span class="text-sm">Refreshing data...</span>
  </div>
{/if}

<style>
  :global(.wallet-address-change-dialog) {
    @apply border-orange-200;
  }
</style>
