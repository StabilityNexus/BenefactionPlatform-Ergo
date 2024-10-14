/*
*
* Benefaction Project
* R5     -> Block limit until allowed withdrawal or refund
* R6     -> ERG/Token exchange rate
* R7     -> Address where the funds can be withdrawn
* R8     -> Link or hash that contains project information
* R9     -> Minimum amount sold to allow withdrawal
*/
{
  // Validation of the box replication process
  val isSelfReplication = {
  
    // The input box must have the same block limit as the output box
    val sameBlockLimit = SELF.R5[Int].get == OUTPUTS(0).R5[Int].get

    // The ERG/Token exchange rate must be identical
    val sameExchangeRate = SELF.R6[Long].get == OUTPUTS(0).R6[Long].get

    // The project address must remain the same
    val sameProjectAddress = SELF.R7[GroupElement].get == OUTPUTS(0).R7[GroupElement].get

    // The project link (e.g., GitHub URL) must be unchanged
    val sameProjectLink = SELF.R8[Coll[Byte]].get == OUTPUTS(0).R8[Coll[Byte]].get
    val sameMinimumSold = SELF.R9[Long].get == OUTPUTS(0).R9[Long].get
    val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

    // Verify that the output box is a valid copy of the input box
    sameBlockLimit && sameExchangeRate && sameProjectAddress && sameProjectLink && sameMinimumSold && sameScript
  }

  // Validation for purchasing Tokens
  val isBuyTokens = {
    val canBuyNow = HEIGHT <= SELF.R5[Int].get || SELF.tokens.nonEmpty
    val userBox = OUTPUTS(1)
    val contractHasTokens = SELF.tokens.nonEmpty
    val userHasTokens = userBox.tokens.nonEmpty && userBox.tokens(0)._1 == SELF.tokens(0)._1
    
    // Calculate the added value from the user's ERG payment
    val addedValueToTheContract = OUTPUTS(0).value - SELF.value

    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = addedValueToTheContract == userBox.tokens(0)._2 * SELF.R6[Long].get

    isSelfReplication && canBuyNow && correctExchange
  }

  // Condition to check if the current height is beyond the block limit
  val afterBlockLimit = HEIGHT > SELF.R5[Int].get

  // Validation for refunding tokens
  val isRefundTokens = {
    // Refund can only occur if the current height is greater than the block limit and the tokens are returned.
    val outputUserBox = OUTPUTS(1)
    val inputUserBox = INPUTS(1)
    
    // Check if tokens are being returned from the user's input box back to the contract
    val returningTokens = inputUserBox.tokens.nonEmpty && SELF.tokens.nonEmpty && inputUserBox.tokens(0)._1 == SELF.tokens(0)._1
    
    // Calculate the value returned from the contract to the user
    val retiredValueFromTheContract = SELF.value - OUTPUTS(0).value

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = retiredValueFromTheContract == inputUserBox.tokens(0)._2 * SELF.R6[Long].get

    // Ensure all Tokens are refunded
    val refundAllTheTokens = outputUserBox.tokens.isEmpty

    // Condition to check if the minimum Ergo is reached.
    val minimumNotReached = SELF.value >= SELF.R9[Long].get

    // The contract returns the equivalent ERG value for the returned tokens
    isSelfReplication && afterBlockLimit && returningTokens && correctExchange && refundAllTheTokens && minimumNotReached
  }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds = {
    val outputBox = OUTPUTS(0)
    val isToProjectAddress = outputBox.propositionBytes == SELF.R7[GroupElement].get.getEncoded
    val allFundsWithdrawn = outputBox.value == SELF.value

    // Condition to check if the minimum Ergo is reached.
    val minimumReached = SELF.value >= SELF.R9[Long].get

    // Project owners can only withdraw funds if the minimum sold is met
    afterBlockLimit && isToProjectAddress && allFundsWithdrawn && minimumReached
  }

  // Validation for withdrawing unsold tokens after the block limit
  val isWithdrawUnsoldTokens = {
    val outputBox = OUTPUTS(0)
    val isToProjectAddress = outputBox.propositionBytes == SELF.R7[GroupElement].get.getEncoded

    // Allow withdrawal of unsold tokens after the block limit has passed
    isSelfReplication && afterBlockLimit && outputBox.tokens.nonEmpty && outputBox.tokens(0)._1 == SELF.tokens(0)._1
  }

  // The contract allows purchasing tokens, requesting refunds, and withdrawing funds before the block limit.
  isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens
}
