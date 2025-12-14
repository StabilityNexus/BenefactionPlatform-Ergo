<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import { WalletAddressChangeHandler } from 'wallet-svelte-component';
	import { page } from '$app/stores';
	import { PUBLIC_ORIGIN } from '$env/static/public';
	import { browser } from '$app/environment';
	
	// Compute canonical URL for og:url meta tag
	// Uses PUBLIC_ORIGIN env var, with runtime fallback to current origin in browser
	$: canonicalUrl = PUBLIC_ORIGIN 
		? `${PUBLIC_ORIGIN}${$page.url.pathname}` 
		: (browser ? `${window.location.origin}${$page.url.pathname}` : '');
</script>

<svelte:head>
	{#if canonicalUrl}
		<meta property="og:url" content={canonicalUrl} />
	{/if}
</svelte:head>

<ModeWatcher />
<WalletAddressChangeHandler />
<slot></slot>
