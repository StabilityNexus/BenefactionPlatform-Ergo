// ===== Contract Description ===== //
// Name: Bene Fundraising Platform Contract
// Description: Enables a project to receive funding in exchange for participation tokens.
// Version: 
// Author: The Stable Order

// ===== Box Contents ===== //
// Tokens
// 1. (id, amount)
//    where:
//       id      The project token identifier.
//       amount  The number of tokens equivalent to the maximum amount of ERG the project aims to raise.
//
// Registers
// R4: Int       The block height until which withdrawals or refunds are disallowed. After this height, they are permitted.
// R5: Long      The minimum number of tokens that must be sold to trigger certain actions (e.g., withdrawals).
// R6: Long      The total number of tokens sold so far.
// R7: Long      The ERG-to-token exchange rate (ERG per token).
// R8: Coll[Byte] Base58-encoded JSON string containing the contract owner's details.
// R9: Coll[Byte] Base58-encoded JSON string containing project metadata, including "title" and "description".

// ===== Transactions ===== //
// 1. Buy Tokens
// Inputs:
//   - Project Bene Contract
//   - User box containing ERG
// Data Inputs: None
// Outputs:
//   - Updated Project Bene Contract
//   - User box containing purchased tokens
// Context Variables: 
//   - Action: _action = 1 (Buy Tokens)
// Constraints:
//   - Ensure accurate ERG-to-token exchange based on the exchange rate.
//   - Update the token sold counter correctly.
//   - Transfer the correct number of tokens to the user.
//   - Validate that the contract is replicated correctly.

// 2. Refund Tokens
// Inputs:
//   - Project Bene Contract
//   - User box containing project tokens
// Outputs:
//   - Updated Project Bene Contract
//   - User box containing refunded ERG
// Context Variables: 
//   - Action: _action = 2 (Refund Tokens)
// Constraints:
//   - Ensure the block height has surpassed the specified block limit (R4).
//   - Ensure the minimum token sales threshold (R5) has not been reached.
//   - Validate the ERG-to-token refund exchange.
//   - Ensure the contract is replicated correctly.

// 3. Withdraw Funds
// Inputs:
//   - Project Bene Contract
// Outputs:
//   - Updated Project Bene Contract (if partially withdrawn; otherwise, contract depletes funds completely)
//   - Box containing ERG for the project address (100% - dev_fee).
//   - Box containing ERG for the developer address (dev_fee).
// Context Variables: 
//   - Action: _action = 3 (Withdraw Funds)
// Constraints:
//   - Ensure the minimum token sales threshold (R5) has been reached.
//   - Verify the correctness of the developer fee calculation.
//   - Ensure either complete withdrawal or proper replication of the contract.

// 4. Withdraw Unsold Tokens
// Inputs:
//   - Project Bene Contract
// Outputs:
//   - Updated Project Bene Contract
//   - Box containing unsold tokens sent to the project address
// Context Variables: 
//   - Action: _action = 4 (Withdraw Unsold Tokens)
// Constraints:
//   - Validate proper replication of the contract.
//   - Ensure no ERG value changes during the transaction.
//   - Handle unsold tokens correctly.

// 5. Add Tokens
// Inputs:
//   - Project Bene Contract
//   - Box containing tokens sent from the project address
// Outputs:
//   - Updated Project Bene Contract
// Context Variables: 
//   - Action: _action = 5 (Add Tokens)
// Constraints:
//   - Validate proper replication of the contract.
//   - Ensure no ERG value changes during the transaction.
//   - Handle the added tokens correctly.

// ===== Compile Time Constants ===== //
// $owner_addr: Base58 address of the contract owner.
// $dev_addr: Base58 address of the developer.
// $dev_fee: Percentage fee allocated to the developer (e.g., 5 for 5%).
// $token_id: Unique string identifier for the project token.

// ===== Context Variables ===== //
// _action: Int representing the specific action being performed. The value corresponds to the following:
//          1 = Buy Tokens
//          2 = Refund Tokens
//          3 = Withdraw Funds
//          4 = Withdraw Unsold Tokens
//          5 = Add Tokens

// ===== Helper Functions ===== //
// None