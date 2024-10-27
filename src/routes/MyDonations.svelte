<script>
    import { ErgoPlatform } from "$lib/ergo/platform";
    import ProjectList from "./ProjectList.svelte";

    let platform = new ErgoPlatform();

    const filter = async (project) => {
    try {
        // Fetch user tokens using the same logic as in getUserTokens
        const tokens = await platform.get_balance();
        const user_tokens = Array.from(tokens.entries()).map(([tokenId, balance]) => ({
                tokenId: tokenId,
                balance: balance,
            }));

        // Check if the project token_id exists in the user's tokens
        return user_tokens.some(token => token.tokenId === project.token_id);
    } catch (error) {
        console.error("Error checking project token:", error);
        return false;
    }
};
</script>
<ProjectList filterProject={filter}>
    My donations
</ProjectList>