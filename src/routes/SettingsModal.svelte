<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { explorer_uri } from "$lib/common/store";
    import { get } from 'svelte/store';
    import { invalidateAllCaches } from '$lib/ergo/cache';
    import { RefreshCw } from 'lucide-svelte';
    
    // The 'open' prop is used to control the modal's visibility.
    // Using `export let open = false;` allows the parent component to control it with `bind:open`.
    export let open = false;

    // Dispatcher for custom events. Not strictly necessary since we use bind:open,
    // but it's a good practice for communicating other events to the parent if needed.
    const dispatch = createEventDispatcher();

    // Local variable for the input, initialized with the current store value.
    // This ensures the text field shows the current configuration when the modal opens.
    let newExplorerUri: string;

    // Synchronize the input value when the modal opens.
    $: if (open) {
        newExplorerUri = get(explorer_uri);
    }

    /**
     * Handles the save action.
     * Updates the explorer_uri store with the new value and closes the modal.
     */
    function handleSave() {
        if (newExplorerUri) {
            explorer_uri.set(newExplorerUri);
        }
        open = false; // Close the modal
    }
    
    /**
     * Clears all caches and reloads the page
     */
    function clearCachesAndReload() {
        invalidateAllCaches();
        // Small delay to ensure caches are cleared before reload
        setTimeout(() => {
            window.location.reload();
        }, 100);
    }

    /**
     * Handles the cancel action.
     * Closes the modal without saving changes.
     */
    function handleCancel() {
        open = false; // Close the modal
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
{#if open}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="modal-overlay" on:click={handleCancel}>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="modal-content" on:click|stopPropagation>
            <div class="modal-header">
                <h2>Settings</h2>
                <button class="close-button" on:click={handleCancel}>&times;</button>
            </div>
            
            <div class="modal-body">
                <p>Modify the Ergo network explorer URI:</p>
                <div class="input-group">
                    <label for="explorer-uri">Explorer URI:</label>
                    <input
                        id="explorer-uri"
                        type="url"
                        bind:value={newExplorerUri}
                        placeholder="e.g. https://api.ergoplatform.com"
                    />
                </div>
                
                <div class="cache-section">
                    <h3>Cache Management</h3>
                    <p class="cache-description">Clear all cached data to force fresh data from the blockchain</p>
                    <button class="button cache-button" on:click={clearCachesAndReload}>
                        <RefreshCw size={16} />
                        Clear Cache & Reload
                    </button>
                </div>
            </div>
            
            <div class="modal-footer">
                <button class="button cancel-button" on:click={handleCancel}>Cancel</button>
                <button class="button save-button" on:click={handleSave}>Save</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Modal overlay styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: 1rem;
    }

    /* Modal content styles */
    .modal-content {
        background-color: #1a1a1a;
        color: #e0e0e0;
        border: 1px solid rgba(255, 165, 0, 0.2);
        border-radius: 16px;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        width: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .modal-header {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid rgba(255, 165, 0, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: orange;
    }

    .close-button {
        background: none;
        border: none;
        color: #e0e0e0;
        font-size: 2rem;
        line-height: 1;
        cursor: pointer;
        transition: transform 0.2s ease;
    }

    .close-button:hover {
        color: orange;
        transform: rotate(90deg);
    }

    .modal-body {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .input-group {
        display: flex;
        flex-direction: column;
    }

    .input-group label {
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #d0d0d0;
    }

    .input-group input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid rgba(255, 165, 0, 0.2);
        background-color: #2a2a2a;
        color: #e0e0e0;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .input-group input:focus {
        outline: none;
        border-color: orange;
        box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.3);
    }

    .modal-footer {
        padding: 1rem 1.5rem;
        border-top: 1px solid rgba(255, 165, 0, 0.1);
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
    }

    .button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .save-button {
        background-color: orange;
        color: #1a1a1a;
    }

    .save-button:hover {
        background-color: #ffc04d;
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(255, 165, 0, 0.4);
    }

    .cancel-button {
        background-color: #4a4a4a;
        color: #e0e0e0;
    }

    .cancel-button:hover {
        background-color: #5a5a5a;
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    }
    
    .cache-section {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgba(255, 165, 0, 0.1);
    }
    
    .cache-section h3 {
        color: orange;
        margin-bottom: 0.5rem;
        font-size: 1.1rem;
    }
    
    .cache-description {
        color: #a0a0a0;
        font-size: 0.9rem;
        margin-bottom: 1rem;
    }
    
    .cache-button {
        background-color: #ff6b35;
        color: white;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.25rem;
    }
    
    .cache-button:hover {
        background-color: #ff8c42;
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(255, 107, 53, 0.4);
    }
</style>