<script lang="ts">
    import { onMount } from 'svelte';
    import { connectNautilus } from "$lib/ergo/connect";
    import { address, connected, ergBalance, project_detail } from "$lib/ergo/store";
    import MyProjects from './MyProjects.svelte';
    import MyDonations from './MyDonations.svelte';
    import SubmitProject from './SubmitProject.svelte';
    import TokenAcquisition from './TokenAcquisition.svelte';
    import 'papercss/dist/paper.min.css'
    import { Navbar, Badge } from 'spaper';
    import ProjectDetails from './ProjectDetails.svelte';


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

    let current_height: number | null = null;

    async function getCurrentHeight() {
        try {
            current_height = await ergo.get_current_height();
            console.log(current_height);
        } catch (error) {
            console.error("Error fetching current height:", error);
        }
    }
    getCurrentHeight();

    $: ergInErgs = $ergBalance ? ($ergBalance / 1_000_000_000).toFixed(4) : 0;

</script>

<div>

    <Navbar border={false} split={false} style="background-color: black; width: 80%">
        <h3 slot="brand">Benefaction <br/> Platform</h3>
        {#if $project_detail === null}
            <ul class="inline">
                <li><a href="#" on:click={() => changeTab('acquireTokens')} 
                    style="color: orange; {activeTab === 'acquireTokens' ? 'border-bottom-color: orangered;' : 'border-bottom-color: orange;'}">
                    Acquire Tokens</a></li>
                <li><a href="#" on:click={() => changeTab('myDonations')} 
                    style="color: orange; {activeTab === 'myDonations' ? 'border-bottom-color: orangered;' : 'border-bottom-color: orange;'}">
                    My Donations</a></li>
                <li><a href="#" on:click={() => changeTab('myProjects')} 
                    style="color: orange; {activeTab === 'myProjects' ? 'border-bottom-color: orangered;' : 'border-bottom-color: orange;'}">
                    My Projects</a></li>
                <li><a href="#" on:click={() => changeTab('submitProject')} 
                    style="color: orange; {activeTab === 'submitProject' ? 'border-bottom-color: orangered;' : 'border-bottom-color: orange;'}">
                    Submit Project</a></li>
            </ul>
        {:else}
            <ul class="inline">
                <li><a style="color: orange; border-bottom-color: orange;">Project: {$project_detail.token_id.slice(0.6)}</a></li>
            </ul>
        {/if}
    </Navbar>
    
    <div class="wallet-info">
        {#if $address}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="identifier" id="walletIdentifier" on:click={copyToClipboard}>
                <Badge style="background-color: orange; color: black; font-size: 0.9em; margin-bottom: 5px;">Wallet: {($address.slice(0, 6) + '...' + $address.slice(-4))}</Badge>
            </div>
        {/if}
        <Badge style="background-color: orange; color: black; font-size: 0.9em;">Balance: {ergInErgs} ERG</Badge>
    </div>

    {#if showMessage}
        <div class="message">
            Wallet address copied to clipboard!
        </div>
    {/if}

    
    {#if $project_detail === null}
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
    {:else}
        <ProjectDetails />
    {/if}
</div>

<style>
    .container {
        padding: 20px;
        background-color: black;
        width: 100% !important;
    }

    .wallet-info {
        position: absolute;
        top: 20px;
        right: 20px;
        padding: 15px;
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