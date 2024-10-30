<script lang="ts">
    import { time_to_block } from '$lib/common/countdown';
    import { web_explorer_uri } from '$lib/ergo/envs';
    import { ErgoPlatform } from '$lib/ergo/platform';
    import { Button, NumberInput } from 'spaper';

    let platform = new ErgoPlatform();

    let token_id: string;
    let token_amount: number = 1000;
    let daysLimit: number = 5;
    let exchangeRate: number;
    let maxValue: number = 0;
    let minValue: number = 0;

    let projectTitle: string = "";
    let projectDescription: string = "";
    let projectImage: string = "";
    let projectLink: string = "";

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;

    let current_height: number | null = null;
    let user_tokens: Array<{ tokenId: string, title: string, balance: number }> = [];

    async function handleSubmit() {
        isSubmitting = true;
        errorMessage = null;
        transactionId = null;

        let target_date = new Date();
        target_date.setDate(target_date.getDate() + daysLimit);
        let blockLimit = await time_to_block(target_date.getTime(), platform);

        let maxValueNano = maxValue * 1000000000;
        let minValueNano = minValue * 1000000000;

        exchangeRate = maxValueNano / token_amount;
        let minimumTokenSold = minValueNano / exchangeRate;

        let projectContent = JSON.stringify({
            title: projectTitle,
            description: projectDescription,
            image: projectImage,
            link: projectLink
        });

        try {
            const result = await platform.submit(
                token_id, 
                token_amount, 
                blockLimit, 
                exchangeRate, 
                projectContent, 
                minimumTokenSold
            );

            transactionId = result;
        } catch (error) {
            errorMessage = error.message || "Error occurred while submitting the project";
        } finally {
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
            const tokens = await platform.get_balance();
            user_tokens = Array.from(tokens.entries())
                .filter(([tokenId, _]) => tokenId !== "ERG")
                .map(([tokenId, balance]) => ({
                    tokenId: tokenId,
                    title: tokenId.slice(0, 6) + tokenId.slice(-4),
                    balance: balance,
                }));
        } catch (error) {
            console.error("Error fetching user tokens:", error);
        }
    }
    getUserTokens();

    function formatToDays(value: number) {
        return `${value} days until user refund or project withdraw`;
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
                        <option value={token.tokenId}>{token.title} (Balance: {token.balance})</option>
                    {/each}
                </select>
            </div>

            <div class="form-group">
                <label for="tokenAmount">Token amount</label>
                <input 
                    type="number" 
                    id="tokenAmount" 
                    bind:value={token_amount} 
                    max={user_tokens.find(t => t.tokenId === token_id)?.balance || 0}
                    min={0}
                    placeholder="Max amount token"  
                />
            </div>

            <div class="form-group form-group-full">
                <label for="blockLimit">Days limit</label>
                <NumberInput id="blockLimit" format={formatToDays} controlsType="primary" bind:value={daysLimit} min={1} style="width: 20rem; align-self:center;" placeholder="Enter days limit" />
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

            <div class="form-group">
                <label for="projectTitle">Project Title</label>
                <input type="text" id="projectTitle" bind:value={projectTitle} placeholder="Enter project title" required />
            </div>

            <div class="form-group">
                <label for="projectDescription">Project Description</label>
                <input type="text" id="projectDescription" bind:value={projectDescription} placeholder="Enter project description" required />
            </div>

            <div class="form-group">
                <label for="projectImage">Project Image URL</label>
                <input type="text" id="projectImage" bind:value={projectImage} placeholder="Enter image URL" required />
            </div>

            <div class="form-group">
                <label for="projectLink">Project Link</label>
                <input type="text" id="projectLink" bind:value={projectLink} placeholder="Enter project link" required />
            </div>
        </div>
        
        <Button on:click={handleSubmit} disabled={isSubmitting} style="background-color: orange; color: black; border: none; padding: 0.25rem 1rem; font-size: 1rem;">
            {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
        
        {#if transactionId}
            <div class="result">
                <p>
                    <strong>Transaction ID:</strong>
                    <a href="{web_explorer_uri + transactionId}" target="_blank" rel="noopener noreferrer" style="color: #ffa500;">
                        {transactionId}
                    </a>
                </p>
            </div>
        {/if}
        
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

    #tokenId {
        background-color: #000;
        color: orange;
        border: 1px solid #555;
    }

    #tokenId option {
        background-color: #000;
        color: orange;
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }

    .form-group-full {
        grid-column: span 2;
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
    .result {
        margin-top: 1.5rem;
        padding: 1rem;
    }
    .error {
        color: red;
    }
</style>
