<script lang="ts">
    import '../app.css';
    import { ModeWatcher } from "mode-watcher";
    import { walletAddress } from 'wallet-svelte-component';
    import { page } from '$app/stores';
    import { browser } from '$app/environment';

    // Compute canonical URL for og:url meta tag
    $: canonicalUrl = browser
        ? `${window.location.origin}${$page.url.pathname}`
        : '';

    // Auto hard-refresh when the wallet address changes
    let _prevAddress: string | null = null;

    $: if (browser && $walletAddress) {
        if (_prevAddress !== null && _prevAddress !== $walletAddress) {
            window.location.reload();
        }
        _prevAddress = $walletAddress;
    }
</script>

<svelte:head>
    {#if canonicalUrl}
        <meta property="og:url" content={canonicalUrl} />
    {/if}
</svelte:head>

<ModeWatcher />
<slot />