<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import { WalletAddressChangeHandler } from 'wallet-svelte-component';
</script>

<ModeWatcher />
<WalletAddressChangeHandler />
<slot></slot>
