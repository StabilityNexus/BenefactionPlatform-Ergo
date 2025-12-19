<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import { WalletAddressChangeHandler } from 'wallet-svelte-component';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	
	// Compute canonical URL for og:url meta tag
	$: canonicalUrl = (browser ? `${window.location.origin}${$page.url.pathname}` : '');
</script>

<svelte:head>
	{#if canonicalUrl}
		<meta property="og:url" content={canonicalUrl} />
	{/if}
</svelte:head>

<ModeWatcher />
<WalletAddressChangeHandler />
<slot></slot>
