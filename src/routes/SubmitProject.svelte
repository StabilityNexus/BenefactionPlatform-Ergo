<script lang="ts">
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { submit_project } from '$lib/ergo/submit';
    import { Button } from 'spaper';


    let platform = new ErgoPlatform();

    // States for form fields
    let token_id: string;
    let token_amount: number;
    let blockLimit: number;
    let exchangeRate: number;
    let projectLink: string;
    let minimumSold: number;

    // State for handling the result
    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let current_height: number | null = null;
    let user_tokens: Array<{ tokenId: string, balance: number }> = [];

    // Function to handle the submit action
    async function handleSubmit() {
        isSubmitting = true;
        errorMessage = null;
        transactionId = null;
        
        try {
            // Submit the project to the blockchain using the submit_project function
            const result = await submit_project(token_id, token_amount, blockLimit, exchangeRate, projectLink, minimumSold);
            
            // Save the transactionId in case of success
            transactionId = result;
        } catch (error) {
            // Handle errors (if submission fails)
            errorMessage = error.message || "Error occurred while submitting the project";
        } finally {
            // Set "isSubmitting" back to false
            isSubmitting = false;
        }
    }

    async function getCurrentHeight() {
        try {
            current_height = await platform.get_current_height();
        } catch (error) {
            console.error("Error fetching current height:", error);
        }
    }
    getCurrentHeight();

    async function getUserTokens() {
        try {
            // Fetch user tokens
            const tokens = await platform.get_balance();
            user_tokens = Array.from(tokens.entries()).map(([tokenId, balance]) => ({
                tokenId: tokenId,
                balance: balance,
            }));
        } catch (error) {
            console.error("Error fetching user tokens:", error);
        }
    }
    getUserTokens();
</script>

<div>
    <div class="container">
        <h1 class="title">Submit Your Project</h1>

        <!-- Form grid with two columns -->
        <div class="form-grid">
            <div class="form-group">
                <label for="tokenId">Token</label>
                <!-- Dropdown to select a token -->
                <select id="tokenId" bind:value={token_id} required>
                    <option value="" disabled>Select a token</option>
                    <option value={null}>-- None (Deselect) --</option>
                    {#each user_tokens as token}
                        <option value={token.tokenId}>{token.tokenId} (Balance: {token.balance})</option>
                    {/each}
                </select>
            </div>

            <div class="form-group">
                <label for="tokenAmount">Token amount</label>
                <!-- Input for the token amount, setting the max value dynamically -->
                <input 
                    type="number" 
                    id="tokenAmount" 
                    bind:value={token_amount} 
                    max={user_tokens.find(t => t.tokenId === token_id)?.balance || 0}
                    placeholder="Max amount token"  
                />
            </div>

            <div class="form-group">
                <label for="blockLimit">Block Limit</label>
                <input type="number" step="0.001" id="blockLimit" bind:value={blockLimit} min={current_height} placeholder="Enter block limit" />
            </div>

            <div class="form-group">
                <label for="exchangeRate">Exchange Rate (ERG/Token)</label>
                <input type="number" id="exchangeRate" bind:value={exchangeRate} placeholder="Enter exchange rate" required />
            </div>

            <div class="form-group">
                <label for="projectLink">Project Link</label>
                <input type="text" id="projectLink" bind:value={projectLink} placeholder="Enter project link or hash" required />
            </div>

            <div class="form-group">
                <label for="minimumSold">Minimum Sold</label>
                <input type="number" id="minimumSold" bind:value={minimumSold} placeholder="Enter minimum amount sold" required />
            </div>
        </div>
        
        <!-- Submit button -->
        <Button on:click={handleSubmit} disabled={isSubmitting} style="background-color: orange; border: none;">
            {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
        
        <!-- Show result -->
        {#if transactionId}
            <div class="result">
                <p><strong>Transaction ID:</strong> {transactionId}</p>
            </div>
        {/if}
        
        <!-- Show error if it exists -->
        {#if errorMessage}
            <div class="error">
                <p>{errorMessage}</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .container {
        max-width: 700px;
        margin: 0 auto;
        padding: 10px;
    }
    .title {
        font-size: 3em;
        text-align: center;
        margin-top: 0px;
        margin-bottom: 20px;
    }

    /* CSS Grid for two-column layout */
    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .form-group {
        margin-bottom: 1.5rem;
    }
    label {
        font-weight: bold;
    }
    input, select {
        width: 100%;
        padding: 0.5rem;
        margin-top: 0.25rem;
        color: orange;
    }
    input:focus, select:focus {
        outline: none !important;
        border:1px solid orange;
    }
    button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
    .result {
        margin-top: 1.5rem;
        padding: 1rem;
        border: 1px solid #ccc;
        background-color: #f9f9f9;
    }
    .error {
        color: red;
    }
</style>
