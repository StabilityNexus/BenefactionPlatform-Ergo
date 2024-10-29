<script lang="ts">
    import { time_to_block } from '$lib/common/countdown';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Button, NumberInput } from 'spaper';


    let platform = new ErgoPlatform();

    // States for form fields
    let token_id: string;
    let token_amount: number = 1000;
    let daysLimit: number = 5;
    let exchangeRate: number;
    let projectLink: string = "";
    let maxValue: number = 0;
    let minValue: number = 0;

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

        let target_date = new Date();
        target_date.setDate(target_date.getDate() + daysLimit);
        let blockLimit = await time_to_block(target_date.getTime(), platform);

        let maxValueNano = maxValue * 1000000000
        let minValueNano = minValue * 1000000000

        exchangeRate = maxValueNano / token_amount;
        let minimumTokenSold = minValueNano / exchangeRate;

        console.log("exchange rate ", exchangeRate)

        try {
            // Submit the project to the blockchain using the submit_project function
            const result = await platform.submit(token_id, token_amount, blockLimit, exchangeRate, projectLink, minimumTokenSold);
            
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

    function formatToDays(value: number) {
        return `${value} days until user refund`
    }
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

            <div class="form-group {token_id === null ? 'disabled' : ''}">
                <label for="tokenAmount">Token amount</label>
                <!-- Input for the token amount, setting the max value dynamically -->
                <input 
                    disabled={token_id === null}
                    type="number" 
                    id="tokenAmount" 
                    bind:value={token_amount} 
                    max={user_tokens.find(t => t.tokenId === token_id)?.balance || 0}
                    min={0}
                    placeholder="Max amount token"  
                />
            </div>

            <div class="form-group">
                <label for="blockLimit">Days limit</label>
                <NumberInput id="blockLimit" format={formatToDays} controlsType="primary" bind:value={daysLimit} min={1} placeholder="Enter days limit" />
            </div>

            <div class="form-group">
                <label for="maxValue">Max ERGs collected</label>
                <input 
                    type="number" 
                    id="maxValue" 
                    bind:value={maxValue}
                    min={minValue}
                    placeholder="Max amount token"  
                />
            </div>

            <div class="form-group">
                <label for="projectLink">Project Link</label>
                <input type="text" id="projectLink" bind:value={projectLink} placeholder="Enter project link or hash" required />
            </div>

            <div class="form-group">   <!-- This should be in an advance optional group.-->
                <label for="minValue">Min ERGs collected</label>
                <input 
                    type="number" 
                    id="minValue" 
                    bind:value={minValue} 
                    max={maxValue}
                    min={0}
                    placeholder="Max amount token"  
                />
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
