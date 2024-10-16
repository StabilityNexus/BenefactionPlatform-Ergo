/*
*
* Benefaction Platform
* R4     -> Block limit until allowed withdrawal or refund
* R5     -> Minimum amount of Erg on contract to allow withdrawal
* R6     -> ERG/Token exchange rate
* R7     -> Address where the funds can be withdrawn
* R8     -> devFee  tuple[%, address]
* R9     -> Link or hash that contains project information
*/
{

  // Validation of the box replication process
  val isSelfReplication = {
  
    // The block limit must be the same
    val sameBlockLimit = SELF.R4[Int].get == OUTPUTS(0).R4[Int].get

    // The minimum amount of ERG must remain the same
    val sameMinimumSold = SELF.R5[Long].get == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = SELF.R6[Long].get == OUTPUTS(0).R6[Long].get

    // The project address must remain the same
    val sameProjectAddress = SELF.R7[GroupElement].get == OUTPUTS(0).R7[GroupElement].get

    // The dev fee must be the same
    val sameDevFee = SELF.R8[(Int, GroupElement)].get == OUTPUTS(0).R8[(Int, GroupElement)].get

    // The project link must be the same
    val sameProjectLink = SELF.R9[Coll[Byte]].get == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same to ensure replication
    val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

    // Verify that the output box is a valid copy of the input box
    sameBlockLimit && sameMinimumSold && sameExchangeRate && sameProjectAddress && sameDevFee && sameProjectLink && sameScript
  }

  // Validation for purchasing Tokens
  // > People should be allowed to exchange ERGs for tokens until there are no more tokens left (even if the deadline has passed).
  val isBuyTokens = {
    val userBox = OUTPUTS(1)
    val contractHasTokens = SELF.tokens.size > 0

    // Verify that the user has been assigned the contract token.
    val userHasTokens = userBox.tokens.size > 0 && userBox.tokens(0)._1 == SELF.tokens(0)._1
    
    // Calculate the added value from the user's ERG payment
    val addedValueToTheContract = OUTPUTS(0).value - SELF.value

    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = addedValueToTheContract == userBox.tokens(0)._2 * SELF.R6[Long].get

    isSelfReplication && userHasTokens && correctExchange
  }

  // Validation for refunding tokens
  val isRefundTokens = {
    val outputUserBox = OUTPUTS(1)
    val inputUserBox = INPUTS(1)

    // > People should be allowed to exchange tokens for ERGs if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
      // The minimum Ergo is not reached, that means, the minimum number of tokens has not been sold. (Check the amount of ergo instead of the amount of tokens to avoid verifying if the token held by the contract is the correct one.)
      val minimumNotReached = SELF.value < SELF.R5[Long].get

      // Condition to check if the current height is beyond the block limit
      val afterBlockLimit = HEIGHT > SELF.R4[Int].get
      
      afterBlockLimit && minimumNotReached
    }
    
    // Check if tokens are being returned from the user's input box back to the contract
    val returningTokens = {
      // The user has tokens
      val userHasTokens = inputUserBox.tokens.size > 0

      // The contract has tokens
      val contractHasTokens = SELF.tokens.size > 0

      // The user has the contract token
      val userTokenIsValid = inputUserBox.tokens(0)._1 == SELF.tokens(0)._1

      userHasTokens && contractHasTokens && userTokenIsValid
    }

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      // Calculate the value returned from the contract to the user
      val retiredValueFromTheContract = SELF.value - OUTPUTS(0).value

      // Calculate the value of the tokens added on the contract by the user
      val addedTokensValue = {
        // Calculate the amount of tokens that the user adds to the contract.
        val addedTokensOnTheContract = OUTPUTS(0).tokens(0)._2 - SELF.tokens(0)._2

        addedTokensOnTheContract * SELF.R6[Long].get
      }

      retiredValueFromTheContract == addedTokensValue
    }

    // The contract returns the equivalent ERG value for the returned tokens
    isSelfReplication && canBeRefund && returningTokens && correctExchange
  }

  val projectAddress = OUTPUTS(1)
  
  val isToProjectAddress = {
    val g: GroupElement = SELF.R7[GroupElement].get
    val sigmaprop: SigmaProp = proveDlog(g)

    sigmaprop.propBytes == projectAddress.propositionBytes
  }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds = {
    val devData = OUTPUTS(0).R8[(Int, GroupElement)].get
    val devFee = devData._1
    val devAddress = devData._2
    // Check https://github.com/PhoenixErgo/phoenix-hodlcoin-contracts/blob/main/hodlERG/contracts/phoenix_fee_contract/v1/ergoscript/phoenix_v1_hodlerg_fee.es
    

    // Replicate the contract in case of partial withdraw
    val endOrReplicate = {
      val allFundsWithdrawn = projectAddress.value == SELF.value

      isSelfReplication || allFundsWithdrawn
    }

    // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold. (The deadline plays no role here.)
    val minimumReached = SELF.value >= SELF.R5[Long].get

    endOrReplicate && isToProjectAddress && minimumReached
  }

  // Can't withdraw ERG
  val mantainValue = SELF.value == OUTPUTS(0).value

  // Validation for withdrawing unsold tokens after the block limit
  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = isSelfReplication && isToProjectAddress && mantainValue

  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = {
    // TODO logic to check: No adds more than one type of token. No withdraw tokens.

    val isFromProjectAddress = {
      val g: GroupElement = SELF.R7[GroupElement].get
      val sigmaprop: SigmaProp = proveDlog(g)
      val isSamePropBytes: Boolean = (sigmaprop.propBytes == INPUTS(1).propositionBytes)
      
      isSamePropBytes
    }

    isSelfReplication && mantainValue && isFromProjectAddress
  }

  sigmaProp(isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens)
}
