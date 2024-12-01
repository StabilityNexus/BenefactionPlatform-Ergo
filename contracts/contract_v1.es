// ===== Contract Description ===== //
// Name: Bene Fundraising Platform Contract
// Description: Enables a project to receive funding in exchange for participation tokens.
// Version: 1.0.0
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
// None

// ===== Helper Functions ===== //
// None

{
  // Global variables to improve readability
  val selfBlockLimit = SELF.R4[Int].get
  val selfMinSoldThreshold = SELF.R5[Long].get
  val selfSoldCounter = SELF.R6[Long].get
  val selfExchangeRate = SELF.R7[Long].get
  val selfConstants = SELF.R8[Coll[Byte]].get
  val selfProjectContent = SELF.R9[Coll[Byte]].get
  val selfToken = if (SELF.tokens.size == 0) (Coll[Byte](), 0L) else SELF.tokens(0)
  val selfTokenId = selfToken._1
  val selfTokenAmount = selfToken._2
  val selfValue = SELF.value

  // Validation of the box replication process
  val isSelfReplication = {
    val sameBlockLimit = selfBlockLimit == OUTPUTS(0).R4[Int].get
    val sameMinimumSold = selfMinSoldThreshold == OUTPUTS(0).R5[Long].get
    val sameExchangeRate = selfExchangeRate == OUTPUTS(0).R7[Long].get
    val sameConstants = selfConstants == OUTPUTS(0).R8[Coll[Byte]].get
    val sameProjectContent = selfProjectContent == OUTPUTS(0).R9[Coll[Byte]].get
    val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

    sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript
  }

  // Validation for purchasing tokens
  val isBuyTokens = {
    val deltaTokenRemoved = selfTokenAmount - OUTPUTS(0).tokens(0)._2
    val deltaValueAdded = OUTPUTS(0).value - selfValue
    val correctExchange = deltaValueAdded == deltaTokenRemoved * selfExchangeRate

    val counterIncrement = OUTPUTS(0).R6[Long].get - selfSoldCounter
    val numberOfTokensBought = deltaTokenRemoved

    val incrementSoldCounterCorrectly = numberOfTokensBought == counterIncrement

    isSelfReplication && correctExchange && incrementSoldCounterCorrectly
  }

  val soldCounterRemainsConstant = selfSoldCounter == OUTPUTS(0).R6[Long].get

  // Validation for refunding tokens
  val isRefundTokens = {
    val afterBlockLimit = HEIGHT > selfBlockLimit
    val minimumNotReached = selfSoldCounter < selfMinSoldThreshold
    val canBeRefund = afterBlockLimit && minimumNotReached

    val retiredValueFromTheContract = selfValue - OUTPUTS(0).value
    val addedTokensOnTheContract = OUTPUTS(0).tokens(0)._2 - selfTokenAmount
    val addedTokensValue = addedTokensOnTheContract * selfExchangeRate
    val sameToken = OUTPUTS(0).tokens(0)._1 == selfTokenId

    val correctExchange = retiredValueFromTheContract == addedTokensValue && sameToken

    isSelfReplication && soldCounterRemainsConstant && canBeRefund && correctExchange
  }

  // Validation for withdrawing funds
  val isWithdrawFunds = {
    val extractedValue = OUTPUTS(1).value - INPUTS.slice(1, INPUTS.size).fold(0L, _.value + _)

    val devFeeAmount = extractedValue * dev_fee / 100
    val devBox = OUTPUTS(2)
    val devFeeCorrect = devBox.value == devFeeAmount && devBox.propositionBytes == PK("`+dev_addr+`").propBytes

    val minimumReached = selfSoldCounter >= selfMinSoldThreshold
    val allFundsWithdrawn = extractedValue == selfValue
    val endOrReplicate = isSelfReplication || allFundsWithdrawn

    endOrReplicate && soldCounterRemainsConstant && minimumReached && devFeeCorrect
  }

  // Validation for withdrawing unsold tokens
  val isWithdrawUnsoldTokens = {
    val deltaAddedTokens = OUTPUTS(0).tokens(0)._2 - selfTokenAmount
    isSelfReplication && soldCounterRemainsConstant && selfValue == OUTPUTS(0).value && deltaAddedTokens < 0
  }

  // Validation for adding tokens
  val isAddTokens = {
    val deltaAddedTokens = OUTPUTS(0).tokens(0)._2 - selfTokenAmount
    isSelfReplication && soldCounterRemainsConstant && selfValue == OUTPUTS(0).value && deltaAddedTokens > 0
  }

  // Validation for initial contract build correctness
  val correctBuild = {
    val onlyOneOrAnyToken = SELF.tokens.size < 2
    val correctTokenId = selfTokenId == fromBase16("`+token_id+`")
    onlyOneOrAnyToken && correctTokenId
  }

  val actions = isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens

  sigmaProp(correctBuild && actions)
}