<script lang="ts">
    import { submit_project } from '$lib/submit_project';

    // States for form fields
    let blockLimit: number;
    let tokenAmount: number;
    let exchangeRate: number;
    let projectLink: string;
    let minimumSold: number;

    // State for handling the result
    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let current_height: number | null = null;

    // Function to handle the submit action
    async function handleSubmit() {
        isSubmitting = true;
        errorMessage = null;
        transactionId = null;
        
        try {
        // Submit the project to the blockchain using the submit_project function
        const result = await submit_project(blockLimit, tokenAmount, exchangeRate, projectLink, minimumSold);
        
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
            current_height = await ergo.get_current_height();
        } catch (error) {
            console.error("Error fetching current height:", error);
        }
    }
    getCurrentHeight();

</script>

<style>
    .container {
        max-width: 600px;
        margin: 0 auto;
    }
    .form-group {
        margin-bottom: 1.5rem;
    }
    label {
        font-weight: bold;
    }
    input {
        width: 100%;
        padding: 0.5rem;
        margin-top: 0.25rem;
    }
    button {
        padding: 0.75rem 1.5rem;
        background-color: #2d89ef;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 1rem;
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

<div>
    <div class="container">
        <h1>Submit Your Project</h1>
        
        <!-- Input form for project parameters -->
        <div class="form-group">
            <label for="blockLimit">Block Limit</label>
            <input type="number" id="blockLimit" bind:value={blockLimit} min={current_height} placeholder="Enter block limit" required />
        </div>
        
        <div class="form-group">
            <label for="tokenAmount">Token Amount</label>
            <input type="number" id="tokenAmount" bind:value={tokenAmount} placeholder="Enter token amount" required />
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
        
        <!-- Submit button -->
        <button on:click={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
        
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
