<script>
    import ProjectList from "./project_list.svelte";

    const filter = async (project) => {
    try {
        // Fetch user tokens using the same logic as in getUserTokens
        const tokens = await ergo.get_balance("all");
        const user_tokens = tokens.map(token => ({
            tokenId: token.tokenId,
            balance: Number(token.balance)
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