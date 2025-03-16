<script lang="ts">
    import { onMount } from 'svelte';
    import { address, connected, balance, project_detail, project_token_amount, temporal_token_amount, timer } from "$lib/common/store";
    import MyProjects from './MyProjects.svelte';
    import MyContributions from './MyContributions.svelte';
    import NewProject from './NewProject.svelte';
    import TokenAcquisition from './TokenAcquisition.svelte';
    import ProjectDetails from './ProjectDetails.svelte';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { loadProjectById } from '$lib/common/load_by_id';
    import { browser } from '$app/environment';
    import { page } from '$app/stores';
    import { type Project } from '$lib/common/project';
    import Kya from './kya.svelte';
    import { web_explorer_uri_addr } from '$lib/ergo/envs';
    import Theme from './Theme.svelte';
    import { Badge } from "$lib/components/ui/badge";
    import { Button, buttonVariants } from '$lib/components/ui/button';
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Alert from "$lib/components/ui/alert";
    import { get } from 'svelte/store';
    import { fade } from 'svelte/transition';


    let activeTab = 'acquireTokens';
    let showCopyMessage = false;
    let showWalletInfo = false;
    let mobileMenuOpen = false;

    let platform = new ErgoPlatform();

    onMount(async () => {
        if (!browser) return;
        await platform.connect();

        const projectId = $page.url.searchParams.get('project');
        const platformId = $page.url.searchParams.get('chain');

        if (projectId && platformId == platform.id) {
            await loadProjectById(projectId, platform);
        }
    });

    connected.subscribe(async () => {
        console.log("Connected to the network.");
    });

    function changeTab(tab: string) {
        const timerValue = get(timer);

        if (timerValue.countdownInterval) {
            clearInterval(timerValue.countdownInterval);
        }

        timer.set({ countdownInterval: 0, target: 0 });

        project_detail.set(null);
        temporal_token_amount.set(null);
        project_token_amount.set(null);
        
        activeTab = tab;
        mobileMenuOpen = false; // Close mobile menu after selection
    }

    // Function to copy the wallet address to the clipboard
    function copyToClipboard() {
        if ($address) {
            navigator.clipboard.writeText($address)
                .then(() => {
                    showCopyMessage = true;
                    setTimeout(() => showCopyMessage = false, 2000); // Hide message after 2 seconds
                })
                .catch(err => console.error('Failed to copy text: ', err));
        }
    }

    function disconnect() {
        if ($address) {
            
        }
    }

    // Close the modal if the user clicks outside of it
    function handleOutsideClick(event: MouseEvent) {
        showWalletInfo = false;
    }

    function toggleMobileMenu() {
        mobileMenuOpen = !mobileMenuOpen;
    }

    let current_height: number | null = null;

    async function getCurrentHeight() {
        try {
            current_height = await platform.get_current_height();
        } catch (error) {
            console.error("Error fetching current height:", error);
        }
    }
    getCurrentHeight();

    async function changeUrl(project: Project|null) {
        if (typeof window === 'undefined') return;

        const url = new URL(window.location.href);
        
        if (project !== null) {
            url.searchParams.set("chain", platform.id);
            url.searchParams.set("project", project.project_id);
        } else {
            url.searchParams.delete("chain");
            url.searchParams.delete("project");
        }
        
        window.history.pushState({}, '', url);
    }

    $: ergInErgs = $balance ? ($balance / 1_000_000_000).toFixed(4) : 0;
    $: changeUrl($project_detail);

</script>

<header class="navbar-container">
    <div class="navbar-content">
        <!-- Logo Section -->
        <div class="logo-container">
            <img src="favicon.png" alt="Logo" class="logo-image" />
            <h1 class="logo-text">Bene</h1>
        </div>

        <!-- Desktop Navigation -->
        <nav class="desktop-nav">
            <ul class="nav-links">
                <li class={activeTab === 'acquireTokens' ? 'active' : ''}>
                    <a href="#" on:click={() => changeTab('acquireTokens')}>
                        Contribute to a Project
                    </a>
                </li>
                <li class={activeTab === 'myContributions' ? 'active' : ''}>
                    <a href="#" on:click={() => changeTab('myContributions')}>
                        My Contributions
                    </a>
                </li>
                <li class={activeTab === 'myProjects' ? 'active' : ''}>
                    <a href="#" on:click={() => changeTab('myProjects')}>
                        My Projects
                    </a>
                </li>
                <li class={activeTab === 'submitProject' ? 'active' : ''}>
                    <a href="#" on:click={() => changeTab('submitProject')}>
                        New Project
                    </a>
                </li>
            </ul>
        </nav>

        <!-- User Info and Theme -->
        <div class="user-section">
            {#if $address}
                <div class="user-info">
                    <div class="badge-container">
                        <Badge style="background-color: orange; color: black; font-size: 0.9em;">{ergInErgs} ERG</Badge>
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <a on:click={() => showWalletInfo = true}>
                            <Badge style="background-color: orange; color: black; font-size: 0.9em;">
                                {$address.slice(0, 6) + '...' + $address.slice(-4)}
                            </Badge>
                        </a>
                    </div>
                    <div class="badge-container">
                        {#if $temporal_token_amount}
                            <Badge style="background-color: #ffc04d; color: black; font-size: 0.9em;">{$temporal_token_amount} APT</Badge>
                        {/if}
                        {#if $project_token_amount}
                            <Badge style="background-color: orange; color: black; font-size: 0.9em;">{$project_token_amount}</Badge>
                        {/if}
                    </div>
                </div>
                
                <!-- Wallet Button for smaller screens -->
                <button class="wallet-button" on:click={() => showWalletInfo = true} aria-label="Wallet info">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                </button>
            {/if}
            
            <div class="theme-toggle">
                <Theme />
            </div>
        </div>

        <!-- Mobile Menu Button -->
        <button class="mobile-menu-button" on:click={toggleMobileMenu} aria-label="Toggle menu">
            <div class="hamburger {mobileMenuOpen ? 'open' : ''}">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </button>
    </div>
</header>

<!-- Mobile Navigation Menu -->
{#if mobileMenuOpen}
    <div class="mobile-nav" transition:fade={{ duration: 200 }}>
        <ul class="mobile-nav-links">
            <li class={activeTab === 'acquireTokens' ? 'active' : ''}>
                <a href="#" on:click={() => changeTab('acquireTokens')}>
                    Contribute to a Project
                </a>
            </li>
            <li class={activeTab === 'myContributions' ? 'active' : ''}>
                <a href="#" on:click={() => changeTab('myContributions')}>
                    My Contributions
                </a>
            </li>
            <li class={activeTab === 'myProjects' ? 'active' : ''}>
                <a href="#" on:click={() => changeTab('myProjects')}>
                    My Projects
                </a>
            </li>
            <li class={activeTab === 'submitProject' ? 'active' : ''}>
                <a href="#" on:click={() => changeTab('submitProject')}>
                    New Project
                </a>
            </li>
        </ul>
    </div>
{/if}

<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if $address}
    <Dialog.Root bind:open={showWalletInfo}>
    <Dialog.Content class="sm:max-w-[425px] md:max-w-[600px] lg:max-w-[800px]">
        <Dialog.Header>
        <Dialog.Title>Wallet Info</Dialog.Title>
        </Dialog.Header>
        <div class="py-4">
        <!-- svelte-ignore a11y-missing-attribute -->
        <a>Address: {$address.slice(0, 19) + '...' + $address.slice(-8)}</a>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-missing-attribute -->
        <a on:click={copyToClipboard}>🔗</a>
        <a href="{web_explorer_uri_addr + $address}" target="_blank">🔍</a>
    
        {#if showCopyMessage}
        <Alert.Root>
            <Alert.Description>
                Wallet address copied to clipboard!
            </Alert.Description>
        </Alert.Root>
        {/if}
    
        <p>Total balance: {ergInErgs} {platform.main_token}</p>

        <p class="text-muted-foreground text-sm" style="margin-top: 2rem;">
        To disconnect, please delete this webpage from the connected dApps settings in the Nautilus extension. Then reload the page.
        </p>
    
        <Dialog.Footer>
        <Button
        disabled
        class={buttonVariants({ variant: "outline" })}
        on:click={disconnect}>
            Disconnect
        </Button>
        </Dialog.Footer>
        </div>
    </Dialog.Content>
    </Dialog.Root>
{/if}

{#if $project_detail === null}
    {#if activeTab === 'acquireTokens'}
        <TokenAcquisition />
    {/if}
    {#if activeTab === 'myContributions'}
        <MyContributions />
    {/if}
    {#if activeTab === 'myProjects'}
        <MyProjects />
    {/if}
    {#if activeTab === 'submitProject'}
        <NewProject />
    {/if}
{:else}
    <ProjectDetails />
{/if}

<div class="bottom-left">
    <a class="discord-button" href="https://discord.com/channels/995968619034984528/1283799987582406737" target="_blank">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.74156 12.4842C8.74156 13.1919 9.25892 13.768 9.8868 13.768C10.5247 13.768 11.032 13.1919 11.032 12.4842C11.042 11.7816 10.5297 11.2004 9.8868 11.2004C9.24888 11.2004 8.74156 11.7766 8.74156 12.4842Z" fill="currentColor"></path><path d="M12.9759 12.4842C12.9759 13.1919 13.4932 13.768 14.1211 13.768C14.764 13.768 15.2663 13.1919 15.2663 12.4842C15.2763 11.7816 14.764 11.2004 14.1211 11.2004C13.4832 11.2004 12.9759 11.7766 12.9759 12.4842Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M1.5 12C1.5 6.20156 6.20156 1.5 12 1.5C17.7984 1.5 22.5 6.20156 22.5 12C22.5 17.7984 17.7984 22.5 12 22.5C6.20156 22.5 1.5 17.7984 1.5 12ZM16.416 7.95033C16.4232 7.95326 16.4291 7.95864 16.4326 7.9655C17.8717 10.0813 18.5824 12.468 18.3166 15.2157C18.3161 15.2215 18.3144 15.2271 18.3115 15.2321C18.3087 15.2372 18.3048 15.2416 18.3001 15.245C17.3369 15.9583 16.259 16.502 15.1129 16.8527C15.1048 16.8552 15.0962 16.8551 15.0881 16.8524C15.0801 16.8496 15.0731 16.8445 15.0682 16.8376C14.8258 16.5013 14.6084 16.1477 14.4178 15.7796C14.4151 15.7746 14.4136 15.769 14.4133 15.7633C14.413 15.7576 14.4139 15.7518 14.4159 15.7465C14.418 15.7412 14.4211 15.7363 14.4252 15.7323C14.4292 15.7282 14.4341 15.7251 14.4394 15.7231C14.7837 15.5936 15.1164 15.4354 15.434 15.25C15.4397 15.2465 15.4445 15.2417 15.448 15.236C15.4515 15.2302 15.4534 15.2237 15.4538 15.217C15.4541 15.2103 15.4528 15.2036 15.45 15.1976C15.4471 15.1915 15.4428 15.1862 15.4375 15.1822C15.3702 15.1322 15.3034 15.0796 15.2396 15.027C15.2338 15.0223 15.2268 15.0194 15.2194 15.0185C15.2121 15.0176 15.2046 15.0188 15.1979 15.022C13.1371 15.9738 10.8793 15.9738 8.79379 15.022C8.78709 15.019 8.77969 15.0179 8.77241 15.0189C8.76514 15.0199 8.75828 15.0229 8.75262 15.0275C8.68883 15.0801 8.622 15.1322 8.55521 15.1822C8.54986 15.1863 8.5456 15.1916 8.5428 15.1977C8.54 15.2038 8.53874 15.2105 8.53914 15.2172C8.53953 15.2239 8.54157 15.2303 8.54507 15.2361C8.54858 15.2418 8.55343 15.2466 8.55921 15.25C8.87754 15.4338 9.20993 15.5922 9.55327 15.7236C9.55861 15.7255 9.56349 15.7286 9.56756 15.7326C9.57164 15.7365 9.57482 15.7413 9.57691 15.7466C9.57899 15.7519 9.57993 15.7576 9.57967 15.7633C9.5794 15.769 9.57793 15.7746 9.57535 15.7796C9.38783 16.1498 9.17011 16.5038 8.92439 16.8381C8.91932 16.8449 8.91232 16.8499 8.90433 16.8525C8.89634 16.8551 8.88773 16.8552 8.87968 16.8528C7.73562 16.5009 6.65965 15.9572 5.69769 15.245C5.69307 15.2414 5.68922 15.2369 5.68637 15.2318C5.68352 15.2266 5.68173 15.221 5.68111 15.2152C5.4591 12.8385 5.91165 10.4321 7.56369 7.965C7.56773 7.95847 7.5737 7.95335 7.58077 7.95035C8.40687 7.57095 9.27881 7.30063 10.1746 7.14617C10.1828 7.14489 10.1911 7.14609 10.1985 7.1496C10.206 7.15312 10.2122 7.1588 10.2163 7.16589C10.3378 7.38074 10.4473 7.60214 10.5443 7.82906C11.5099 7.68248 12.4921 7.68248 13.4576 7.82906C13.554 7.60271 13.6618 7.38137 13.7805 7.16589C13.7845 7.15864 13.7907 7.15283 13.7982 7.14929C13.8057 7.14575 13.8141 7.14466 13.8222 7.14617C14.718 7.30095 15.5898 7.57126 16.416 7.95033Z" fill="currentColor"></path></svg>    
    </a> 
    <a class="github-button" href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo" target="_blank">
        <svg width="22" height="22" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="currentColor"></path></svg>
    </a> 
    <Kya />
</div>

<div class="bottom-right">
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4"><path d="M0.502 2.999L6 0L11.495 3.03L6.0025 5.96L0.502 2.999V2.999ZM6.5 6.8365V12L11.5 9.319V4.156L6.5 6.8365V6.8365ZM5.5 6.8365L0.5 4.131V9.319L5.5 12V6.8365Z" fill="currentColor"></path></svg>
    {current_height}
</div>

<style>
       :global(html) {
        height: 100%;
        scroll-behavior: smooth;
        overflow-y: auto;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        overflow-y: auto !important; 
        overflow-x: hidden;
        height: 100%;
    }
    

    :global(.bits-dropdown-menu-content-wrapper) {
        position: absolute !important;
        z-index: 999 !important;
        pointer-events: auto !important;
    }
    

    :global(.bits-dropdown-menu-root-open) {
        position: static !important;
        overflow: visible !important;
    }
    /* Navbar Styles */
    .navbar-container {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        z-index: 50;
        padding: 0.5rem 1rem;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        background-color: rgba(0, 0, 0, 0.05);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    }

    .navbar-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
    }

    /* Logo Styles */
    .logo-container {
        display: flex;
        align-items: center;
        cursor: pointer;
        transition: transform 0.2s ease;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        background: rgba(255, 165, 0, 0.05);
        flex-shrink: 0;
        margin-right: 1rem;
    }

    .logo-container:hover {
        transform: scale(1.02);
        box-shadow: 0 0 15px rgba(255, 165, 0, 0.2);
    }

    .logo-image {
        width: 2.25rem;
        height: 2.25rem;
        filter: drop-shadow(0 0 5px rgba(255, 165, 0, 0.3));
    }

    .logo-text {
        font-size: 1.75rem;
        font-weight: 700;
        color: orange;
        margin-left: 0.5rem;
        line-height: 1;
        text-shadow: 0 0 10px rgba(255, 165, 0, 0.3);
    }

    /* Desktop Navigation */
    .desktop-nav {
        display: none;
        flex: 1;
        overflow: hidden;
    }

    @media (min-width: 768px) {
        .desktop-nav {
            display: block;
        }
    }

    .nav-links {
        display: flex;
        list-style: none;
        margin: 0;
        padding: 0;
        gap: 1.5rem;
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE and Edge */
    }

    .nav-links::-webkit-scrollbar {
        display: none; /* Chrome, Safari, Opera */
    }

    .nav-links li {
        position: relative;
    }

    .nav-links li a {
        color: inherit;
        text-decoration: none;
        font-weight: 500;
        padding: 0.5rem 0.75rem;
        display: block;
        transition: all 0.2s ease;
        border-radius: 8px;
        border-bottom: 2px solid transparent;
    }

    .nav-links li a:hover {
        color: orange;
        background: rgba(255, 165, 0, 0.05);
        box-shadow: 0 0 10px rgba(255, 165, 0, 0.1);
    }

    .nav-links li.active a {
        border-bottom: 2px solid orange;
        color: orange;
        background: rgba(255, 165, 0, 0.1);
        box-shadow: 0 0 15px rgba(255, 165, 0, 0.15);
    }

    /* User Section */
    .user-section {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        flex-shrink: 0;
    }

    .user-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .badge-container {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .wallet-button {
        display: none;
        background: rgba(255, 165, 0, 0.15);
        border: none;
        color: orange;
        border-radius: 8px;
        padding: 0.4rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .wallet-button:hover {
        background: rgba(255, 165, 0, 0.3);
        box-shadow: 0 0 10px rgba(255, 165, 0, 0.2);
    }

    @media (max-width: 1024px) {
        .wallet-button {
            display: flex;
        }
    }

    /* Mobile Menu Button */
    .mobile-menu-button {
        display: block;
        background: none;
        border: none;
        cursor: pointer;
        z-index: 100;
        padding: 0.5rem;
        border-radius: 8px;
        transition: background-color 0.2s ease;
        margin-left: 0.5rem;
    }

    .mobile-menu-button:hover {
        background-color: rgba(255, 165, 0, 0.1);
    }

    @media (min-width: 768px) {
        .mobile-menu-button {
            display: none;
        }
    }

    .hamburger {
        width: 24px;
        height: 20px;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }

    .hamburger span {
        display: block;
        height: 3px;
        width: 100%;
        background-color: orange;
        border-radius: 3px;
        transition: all 0.3s ease;
        box-shadow: 0 0 5px rgba(255, 165, 0, 0.3);
    }

    .hamburger.open span:nth-child(1) {
        transform: translateY(8.5px) rotate(45deg);
    }

    .hamburger.open span:nth-child(2) {
        opacity: 0;
    }

    .hamburger.open span:nth-child(3) {
        transform: translateY(-8.5px) rotate(-45deg);
    }

    /* Mobile Navigation */
    .mobile-nav {
        position: fixed;
        top: 4.5rem;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 400px;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding: 1rem;
        z-index: 99;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 165, 0, 0.1);
    }

    .mobile-nav-links {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .mobile-nav-links li a {
        color: white;
        text-decoration: none;
        font-weight: 500;
        padding: 0.75rem;
        display: block;
        border-radius: 8px;
        transition: all 0.2s ease;
    }

    .mobile-nav-links li a:hover {
        background-color: rgba(255, 165, 0, 0.1);
        box-shadow: 0 0 15px rgba(255, 165, 0, 0.1);
    }

    .mobile-nav-links li.active a {
        background-color: rgba(255, 165, 0, 0.2);
        color: orange;
        box-shadow: 0 0 15px rgba(255, 165, 0, 0.2);
    }

    /* Bottom Elements */
    .bottom-left {
        position: fixed;       /* Keeps the element fixed on the screen */
        bottom: 20px;          /* Adds some space from the bottom */
        left: 10px;            /* Adds a little space from the left */
        width: 150px;          /* Sets a smaller width for the bar */
        height: 20px;          /* Sets a smaller height for the bar */
        text-align: left;    /* Centers the text inside the bar */
        padding: 5px;          /* Adds a smaller padding */
        border-radius: 8px;    /* Adds rounded corners */
        display: flex;
        flex-direction: row;
        align-items: center;
    }

    .bottom-left a {
        color: gray;
        margin-right: 12px;
        background-image: none;
    }

    .bottom-left a svg {
        text-decoration: none;
    }

    .bottom-right {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        position: fixed;
        bottom: 20px;
        right: 5px;
        width: 150px;
        height: 30px;
        padding: 5px;
        border-radius: 8px;
    }

    .bottom-right svg {
        margin-right: 10px;
    }

    /* Responsive Adjustments */
    @media (max-width: 1024px) {
        .navbar-content {
            padding: 0.4rem;
        }
        
        .nav-links {
            gap: 0.5rem;
        }
        
        .user-info {
            display: none;
        }
        
        .user-section {
            padding: 0.25rem;
            gap: 0.35rem;
        }
    }
    
    @media (max-width: 768px) {
        .navbar-content {
            gap: 0.25rem;
            justify-content: space-between;
        }
        
        .logo-text {
            font-size: 1.35rem;
        }
        
        .user-section {
            background: transparent;
            padding: 0.25rem;
            gap: 0;
            margin-left: auto; 
            order: 2; 
            display: flex;
            align-items: center;
        }
        
        .wallet-button {
            background: rgba(255, 165, 0, 0.25);
            padding: 0.35rem;
            margin-right: 0.5rem;
            display: flex;
        }
        
        /* Hide theme toggle on smaller screens */
        .theme-toggle {
            display: none;
        }

        /* Position mobile menu button at the extreme right */
        .mobile-menu-button {
            margin-left: 0;
            order: 3; /* Always at the end */
        }
    }

    /* Additional responsive styles for the navbar */
    @media (max-width: 1024px) {
        .navbar-content {
            padding: 0.25rem;
        }
        
        .logo-container {
            padding: 0.25rem 0.25rem;
            margin-right: 0.5rem;
        }
    }

    /* Added better wrapping for the user section elements */
    .user-section, .theme-toggle, .wallet-button {
        display: flex;
        align-items: center;
    }
</style>