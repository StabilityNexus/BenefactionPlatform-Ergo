<script lang="ts">

    import { address } from "$lib/common/store";
    import { web_explorer_uri_addr } from "$lib/ergo/envs";
    import { onMount } from "svelte";

    export let ergInErgs = "0.059";
    export let platform = { main_token: "ERG" };

    let showMessage = false;

    const copyToClipboard = () => {
        navigator.clipboard.writeText($address ?? "");
        showMessage = true;
        setTimeout(() => (showMessage = false), 3000);
    };

    const disconnectWallet = () => {
        alert("Please remove this dApp from your connected dApps list in Nautilus.");
    };

    const closeModal = () => {
        // Logic to close the modal
    };
</script>

<style>
    /* Styles same as provided in the enhanced version */
    :global(body) {
        font-family: 'Inter', sans-serif;
        background-color: #121212;
        color: #f2f2f2;
        margin: 0;
    }

    .modal-body {
        position: relative;
        width: 400px;
        background-color: black;
        color: #f2f2f2;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        padding: 1.5rem;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #3a3a3c;
        padding-bottom: 0.8rem;
        margin-bottom: 1.2rem;
    }

    .wallet-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .wallet-title h2 {
        font-size: 1.2rem;
        font-weight: 600;
    }

    .close-button {
        background: none;
        border: none;
        color: #f2f2f2;
        font-size: 1.2rem;
        cursor: pointer;
        transition: color 0.2s;
    }

    .close-button:hover {
        color: #ff5a5f;
    }

    .balance-section h3,
    .address-section h3,
    .tokens-section h3 {
        font-size: 1rem;
        color: #f7d560;
        margin-bottom: 0.5rem;
    }

    .balance {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.8rem 1rem;
        background-color: #2c2c2e;
        border-radius: 8px;
        font-size: 1.2rem;
    }

    .balance-usd {
        color: #a1a1a3;
        font-size: 0.9rem;
    }

    .address-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.8rem 1rem;
        background-color: #2c2c2e;
        border-radius: 8px;
    }

    .address-text {
        flex-grow: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9rem;
    }

    .copy-button,
    .explorer-link {
        background: none;
        border: none;
        color: #f7d560;
        cursor: pointer;
        font-size: 1rem;
    }

    .copy-button:hover,
    .explorer-link:hover {
        color: #ffd700;
    }

    .tokens-section .token-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.8rem 1rem;
        background-color: #2c2c2e;
        border-radius: 8px;
        margin-bottom: 0.8rem;
    }

    .token-icon {
        width: 20px;
        height: 20px;
    }

    .token-name {
        flex-grow: 1;
        margin-left: 0.5rem;
        font-size: 0.9rem;
    }

    .token-quantity,
    .token-value {
        font-size: 0.9rem;
        color: #a1a1a3;
    }

    .message {
        position: absolute;
        top: 10px;
        right: 10px;
        background: #28a745;
        color: #fff;
        padding: 0.5rem 1rem;
        border-radius: 5px;
        font-size: 0.8rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        animation: fadeInOut 3s ease;
    }

    @keyframes fadeInOut {
        0%, 90% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }

    .modal-footer {
        margin-top: 1.5rem;
    }
</style>

<div class="modal-body">
    <header class="modal-header">
        <div class="wallet-title">
            <img src="wallet-icon.png" alt="Wallet Icon" />
            <h2>Nautilus Wallet</h2>
        </div>
        <button class="close-button" on:click={closeModal}>✕</button>
    </header>

    <div class="balance-section">
        <h3>Total Balance</h3>
        <div class="balance">
            <span class="balance-amount">{ergInErgs} {platform.main_token}</span>
            <span class="balance-usd">$0.12</span>
        </div>
    </div>

    <div class="address-section">
        <h3>Active Address</h3>
        <div class="address-wrapper">
            <span class="address-text">
                {$address.slice(0, 19) + '...' + $address.slice(-8)}
            </span>
            <button class="copy-button" on:click={copyToClipboard}>📋</button>
            <a href="{web_explorer_uri_addr + $address}" class="explorer-link" target="_blank">🔗</a>
        </div>
    </div>

    <div class="tokens-section">
        <h3>Tokens</h3>
        <div class="token-item">
            <img src="token-icon.png" alt="Token Icon" class="token-icon" />
            <span class="token-name">Token Name</span>
            <span class="token-quantity">1</span>
            <span class="token-value">$0.00</span>
        </div>
    </div>

    {#if showMessage}
    <div class="message">Wallet address copied to clipboard!</div>
    {/if}

    <footer class="modal-footer">
        <button class="disconnect-button" on:click={disconnectWallet}>
            Disconnect Wallet
        </button>
    </footer>
</div>
