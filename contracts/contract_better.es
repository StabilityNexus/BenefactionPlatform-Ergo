{
    // ===== Contract Description ===== //
    // Name: Token Sale Contract
    // Description: Manages token sales with features like token purchase, refund, and fund withdrawal
    // Version: 1.0.0
    // Author: [Your Name/Organization]

    // ===== Box Contents ===== //
    // Tokens
    // 1. (TokenId, Total Token Amount)
    // Registers
    // R4: Int       Block limit until allowed withdrawal or refund
    // R5: Long      Minimum amount of tokens that need to be sold
    // R6: Long      Amount of tokens that have already been sold
    // R7: Long      ERG/Token exchange rate
    // R8: Coll[Byte] Contract owner details (base58 address) in JSON format
    // R9: Coll[Byte] Project content (title, description) in JSON format

    // ===== Transactions ===== //
    // 1. Buy Tokens
    // Inputs: Token Sale Contract
    // Outputs: Updated Token Sale Contract, User Token Box
    // Constraints: 
    //   - Correct token exchange
    //   - Update sold tokens counter
    //   - Token transfer to user

    // 2. Refund Tokens
    // Inputs: Token Sale Contract
    // Outputs: Refunded Tokens, Refund ERG to User
    // Constraints:
    //   - Block limit passed
    //   - Minimum sales not reached
    //   - Correct token and ERG exchange

    // 3. Withdraw Funds
    // Inputs: Token Sale Contract
    // Outputs: Project Address, Dev Fee Address
    // Constraints:
    //   - Minimum sales reached
    //   - Correct dev fee calculation
    //   - Contract replication or full withdrawal

    // 4. Withdraw Unsold Tokens
    // Inputs: Token Sale Contract
    // Outputs: Project Address with Tokens
    // Constraints:
    //   - Contract replication
    //   - No value change
    //   - Correct token handling

    // 5. Add Tokens
    // Inputs: Token Sale Contract
    // Outputs: Updated Token Sale Contract
    // Constraints:
    //   - Contract replication
    //   - No value change
    //   - Correct token handling

    // ===== Compile Time Constants ===== //
    // $owner_addr: Base58 address of the contract owner
    // $dev_addr: Base58 address of the developer
    // $dev_fee: Percentage fee for the developer
    // $token_id: Token identifier string

    // ===== Context Variables ===== //
    // None

    // ===== Helper Functions ===== //
    // Defined within the main contract logic
