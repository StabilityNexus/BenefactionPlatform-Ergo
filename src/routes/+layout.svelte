<script lang="ts">
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import WalletAddressChangeHandler from '$lib/components/WalletAddressChangeHandler.svelte';
</script>

<ModeWatcher />
<WalletAddressChangeHandler />
<slot></slot>
