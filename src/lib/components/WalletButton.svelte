<script lang="ts">
  import {
    walletManager,
    walletConnected,
    walletAddress,
    walletBalance,
    walletConnecting,
  } from '$lib/wallet/wallet-manager';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Badge } from '$lib/components/ui/badge';
  import WalletModal from './WalletModal.svelte';
  import { Copy, ExternalLink, LogOut, Wallet, RefreshCw } from 'lucide-svelte';
  import { web_explorer_uri_addr } from '$lib/common/store';

  let showModal = false;
  let copySuccess = false;

  function openWalletModal() {
    showModal = true;
    walletManager.openModal();
  }

  function disconnectWallet() {
    walletManager.disconnectWallet();
  }

  function refreshBalance() {
    walletManager.refreshBalance();
  }

  async function copyAddress() {
    if ($walletAddress) {
      try {
        await navigator.clipboard.writeText($walletAddress);
        copySuccess = true;
        setTimeout(() => (copySuccess = false), 2000);
      } catch (err) {
        console.error('Failed to copy address:', err);
      }
    }
  }

  function openExplorer() {
    if ($walletAddress) {
      window.open(`${$web_explorer_uri_addr}${$walletAddress}`, '_blank');
    }
  }

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatBalance(nanoErgs: bigint): string {
    const erg = Number(nanoErgs) / 1e9;
    return erg.toFixed(3);
  }
</script>

{#if $walletConnected}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild let:builder>
      <Button builders={[builder]} variant="outline" class="wallet-connected-button">
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 bg-green-500 rounded-full"></div>
          <span class="font-mono text-sm">{formatAddress($walletAddress)}</span>
          <Badge variant="secondary" class="text-xs">
            {formatBalance($walletBalance.nanoErgs)} ERG
          </Badge>
        </div>
      </Button>
    </DropdownMenu.Trigger>

    <DropdownMenu.Content class="w-80" align="end">
      <DropdownMenu.Label class="px-2 py-1.5">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Wallet Connected</span>
          <div class="flex items-center space-x-1">
            <div class="w-2 h-2 bg-green-500 rounded-full"></div>
            <span class="text-xs text-muted-foreground">Online</span>
          </div>
        </div>
      </DropdownMenu.Label>

      <DropdownMenu.Separator />

      <!-- Address Section -->
      <div class="px-3 py-2">
        <div class="text-xs text-muted-foreground mb-1">Address</div>
        <div class="flex items-center justify-between">
          <code class="text-xs bg-muted px-2 py-1 rounded font-mono">
            {formatAddress($walletAddress)}
          </code>
          <div class="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              on:click={copyAddress}
              title="Copy address"
            >
              <Copy class="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              on:click={openExplorer}
              title="View in explorer"
            >
              <ExternalLink class="h-3 w-3" />
            </Button>
          </div>
        </div>
        {#if copySuccess}
          <div class="text-xs text-green-600 mt-1">Address copied!</div>
        {/if}
      </div>

      <DropdownMenu.Separator />

      <!-- Balance Section -->
      <div class="px-3 py-2">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs text-muted-foreground">Balance</div>
          <Button
            variant="ghost"
            size="sm"
            class="h-6 w-6 p-0"
            on:click={refreshBalance}
            title="Refresh balance"
          >
            <RefreshCw class="h-3 w-3" />
          </Button>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm">ERG</span>
            <span class="text-sm font-medium">
              {formatBalance($walletBalance.nanoErgs)}
            </span>
          </div>

          {#if $walletBalance.tokens && $walletBalance.tokens.length > 0}
            <div class="text-xs text-muted-foreground mt-2 mb-1">Tokens</div>
            {#each $walletBalance.tokens.slice(0, 3) as token (token.tokenId)}
              <div class="flex items-center justify-between text-xs">
                <span class="font-mono">{token.tokenId.slice(0, 8)}...</span>
                <span>{Number(token.amount)}</span>
              </div>
            {/each}
            {#if $walletBalance.tokens.length > 3}
              <div class="text-xs text-muted-foreground text-center">
                +{$walletBalance.tokens.length - 3} more tokens
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <DropdownMenu.Separator />

      <DropdownMenu.Item on:click={disconnectWallet} class="text-red-600 focus:text-red-600">
        <LogOut class="h-4 w-4 mr-2" />
        Disconnect
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <Button on:click={openWalletModal} disabled={$walletConnecting} class="wallet-connect-button">
    {#if $walletConnecting}
      <RefreshCw class="h-4 w-4 mr-2 animate-spin" />
      Connecting...
    {:else}
      <Wallet class="h-4 w-4 mr-2" />
      Connect Wallet
    {/if}
  </Button>
{/if}

<WalletModal bind:open={showModal} />

<style>
  :global(.wallet-connected-button) {
    background-color: hsl(var(--background));
    border-color: hsl(var(--border));
    transition: all 0.2s ease;
  }

  :global(.wallet-connected-button:hover) {
    background-color: hsl(var(--accent) / 0.5);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  :global(.wallet-connect-button) {
    background-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    transition: all 0.2s ease;
  }

  :global(.wallet-connect-button:hover) {
    background-color: hsl(var(--primary) / 0.9);
  }
</style>
