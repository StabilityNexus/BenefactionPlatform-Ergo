<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import { WalletAddressChangeHandler } from 'wallet-svelte-component';
	import { onMount } from 'svelte';
	import { loadProjectById } from '$lib/common/load_by_id';
	import { network, web_explorer_uri_tx, web_explorer_uri_tkn, web_explorer_uri_addr } from '$lib/common/store';

	onMount(() => {
		try {
			if (typeof window === 'undefined') return;

			const params = new URLSearchParams(window.location.search);

			// detect chain/network param (accept common names)
			const chainParam = params.get('chain') || params.get('network');
			if (chainParam) {
				const chain = (chainParam && chainParam.toLowerCase() === 'testnet') ? 'testnet' : 'mainnet';
				network.set(chain);

				// set explorer URIs for runtime
				if (chain === 'testnet') {
					web_explorer_uri_tx.set('https://testnet.ergoplatform.com/transactions/');
					web_explorer_uri_tkn.set('https://testnet.ergoplatform.com/tokens/');
					web_explorer_uri_addr.set('https://testnet.ergoplatform.com/addresses/');
				} else {
					web_explorer_uri_tx.set('https://sigmaspace.io/en/transaction/');
					web_explorer_uri_tkn.set('https://sigmaspace.io/en/token/');
					web_explorer_uri_addr.set('https://sigmaspace.io/en/address/');
				}
			}

			// detect campaign/project id in URL (accept several common param names)
			const idParamKeys = ['campaign', 'campaignId', 'project', 'id'];
			let projectId: string | null = null;
			for (const k of idParamKeys) {
				const v = params.get(k);
				if (v) { projectId = v; break; }
			}

			// Only load the project directly when both chain and project id are present
			if (chainParam && projectId) {
				void loadProjectById(projectId);
			}
		} catch (e) {
			console.error('Error reading URL params on startup', e);
		}
	});
</script>

<ModeWatcher />
<WalletAddressChangeHandler />
<slot></slot>
