<script lang="ts">
    import { onMount } from 'svelte';
    import { connectNautilus } from "$lib/connect";
    import { address, network, connected, ergBalance } from "$lib/store";
    import MyProjects from './MyProjects.svelte';
    import MyDonations from './MyDonations.svelte';
    import SubmitProject from './SubmitProject.svelte';
    import TokenAcquisition from './TokenAcquisition.svelte';

    let activeTab = 'acquireTokens'; // Default tab is "My Donations"
    let showMessage = false;

    onMount(async () => {
        connectNautilus();
    });

    connected.subscribe(async () => {
        console.log("Connected to the network.");
    });

    function changeTab(tab: string) {
        activeTab = tab;
    }

    // Function to copy the wallet address to the clipboard
    function copyToClipboard() {
        if ($address) {
            navigator.clipboard.writeText($address)
                .then(() => {
                    showMessage = true;
                    setTimeout(() => showMessage = false, 2000); // Hide message after 2 seconds
                })
                .catch(err => console.error('Failed to copy text: ', err));
        }
    }

    $: ergInErgs = $ergBalance ? ($ergBalance / 1_000_000_000).toFixed(4) : 0;

</script>

<style>
    .container {
        padding: 20px;
        font-family: Arial, sans-serif;
        background-color: #f0f0f0;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .title {
        font-size: 2em;
        margin-bottom: 20px;
        text-align: center;
        color: #333;
    }

    .wallet-info {
        position: absolute;
        top: 20px;
        left: 20px;
        background: #ffffff;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        font-size: 0.9em;
    }

    .wallet-info p {
        margin: 0;
        color: #444;
    }

    .wallet-info p:hover {
        text-decoration: none;
    }

    .nav-buttons {
        display: flex;
        justify-content: space-around;
        margin: 20px 0;
    }

    .nav-button {
        background-color: #e0e0e0;
        border: 1px solid #ccc;
        padding: 10px 15px;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.3s, transform 0.2s;
        font-size: 1em;
    }

    .nav-button.active {
        background-color: #ccc;
        font-weight: bold;
    }

    .nav-button:hover {
        background-color: #d0d0d0;
        transform: scale(1.05);
    }

    .message {
        position: absolute;
        top: 60px;
        left: 20px;
        background: #28a745;
        color: #fff;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 0.8em;
        z-index: 1000;
    }
</style>

<div class="container">
    <div class="title">Benefaction Platform</div>
    
    <div class="wallet-info">
        {#if $address}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="identifier" id="walletIdentifier" on:click={copyToClipboard}>
                <p>Wallet: {($address.slice(0, 6) + '...' + $address.slice(-4))}</p>
            </div>
        {/if}
        <p>Balance: {ergInErgs} ERG</p>
    </div>

    {#if showMessage}
        <div class="message">
            Wallet address copied to clipboard!
        </div>
    {/if}

    <div class="nav-buttons">
        <button class="nav-button {activeTab === 'acquireTokens' ? 'active' : ''}" on:click={() => changeTab('acquireTokens')}>
            Acquire Tokens
        </button>
        <button class="nav-button {activeTab === 'myDonations' ? 'active' : ''}" on:click={() => changeTab('myDonations')}>
            My Donations
        </button>
        <button class="nav-button {activeTab === 'myProjects' ? 'active' : ''}" on:click={() => changeTab('myProjects')}>
            My Projects
        </button>
        <button class="nav-button {activeTab === 'submitProject' ? 'active' : ''}" on:click={() => changeTab('submitProject')}>
            Submit Project
        </button>
    </div>

    {#if activeTab === 'acquireTokens'}
        <TokenAcquisition />
    {/if}
    {#if activeTab === 'myDonations'}
        <MyDonations />
    {/if}
    {#if activeTab === 'myProjects'}
        <MyProjects />
    {/if}
    {#if activeTab === 'submitProject'}
        <SubmitProject />
    {/if}
</div>
