import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex } from "@fleet-sdk/crypto";

export const explorer_uri = "https://api.ergoplatform.com";

let contract = `
{

  // Validation of the box replication process
  val isSelfReplication = {
  
    // The block limit must be the same
    val sameBlockLimit = SELF.R4[Int].get == OUTPUTS(0).R4[Int].get

    // The minimum amount of tokens sold must be the same.
    val sameMinimumSold = SELF.R5[Long].get == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = SELF.R7[Long].get == OUTPUTS(0).R7[Long].get

    // The project address must remain the same
    val sameProjectAddress = SELF.R8[Coll[Byte]].get == OUTPUTS(0).R8[Coll[Byte]].get

    // The project link must be the same
    val sameProjectLink = SELF.R9[Coll[Byte]].get == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same to ensure replication
    val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

    // Verify that the output box is a valid copy of the input box
    sameBlockLimit && sameMinimumSold && sameExchangeRate && sameProjectAddress && sameProjectLink && sameScript
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
    val correctExchange = addedValueToTheContract == userBox.tokens(0)._2 * SELF.R7[Long].get

    // Verify if the token sold counter (second element of R5) is increased in proportion of the tokens sold.
    val incrementSoldCounterCorrectly = {

      // Calculate how much the sold counter is incremented.
      val counterIncrement = {
        // Obtain the current and the next "tokens sold counter"
        val selfAlreadySoldCounter = SELF.R6[Long].get
        val outputAlreadySoldCounter = OUTPUTS(0).R6[Long].get

        outputAlreadySoldCounter - selfAlreadySoldCounter
      }

      // Calculate the extracted number of tokens from the contract
      val numberOfTokensBuyed = SELF.tokens(0)._2 - OUTPUTS(0).tokens(0)._2

      numberOfTokensBuyed == counterIncrement
    }

    isSelfReplication && userHasTokens && correctExchange && incrementSoldCounterCorrectly
  }

  val soldCounterRemainsConstant = SELF.R6[Long].get == OUTPUTS(0).R6[Long].get

  // Validation for refunding tokens
  val isRefundTokens = {
    val outputUserBox = OUTPUTS(1)
    val inputUserBox = INPUTS(1)

    // > People should be allowed to exchange tokens for ERGs if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
      // The minimum number of tokens has not been sold.
      val minimumNotReached = {
        val minData = SELF.R6[Long].get
        val minimumSalesThreshold = SELF.R5[Long].get
        val soldCounter = SELF.R6[Long].get

        soldCounter < minimumSalesThreshold
      }

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

        addedTokensOnTheContract * SELF.R7[Long].get
      }

      retiredValueFromTheContract == addedTokensValue
    }

    // The contract returns the equivalent ERG value for the returned tokens
    isSelfReplication && soldCounterRemainsConstant && canBeRefund && returningTokens && correctExchange
  }

  val projectAddress = OUTPUTS(1)
  
  val isToProjectAddress = {
    val addrHash: Coll[Byte] = SELF.R8[Coll[Byte]].get
    val isSamePropBytes: Boolean = addrHash == sha256(projectAddress.propositionBytes)

    isSamePropBytes
  }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds = {

    // ERG extracted amount considering that the contract could not be replicated.
    val extractedValue: Long = {
      if (INPUTS.size > 1) {
        // In case where the project owners uses multiple boxes
        projectAddress.value - INPUTS.slice(1, INPUTS.size).fold(0L, { (acc: Long, box: Box) => acc + box.value })
      }
      else {
        projectAddress.value
      }
    }

    // val correctDevFee = {
      // Could be a dev prop bytes: https://github.com/PhoenixErgo/phoenix-hodlcoin-contracts/blob/main/hodlERG/contracts/phoenix_fee_contract/v1/ergoscript/phoenix_v1_hodlerg_fee.es
      // val devFee = 5
      // val devAddress = fromBase64("0xabcdefghijklmnñoqrstuvwxyz")

      // val isToDevAddress = {
      //   devAddress == OUTPUTS(2).propositionBytes
      // }

      // val devAmount = extractedValue * devFee / 100

      // devAmount == OUTPUTS(2).value && isToDevAddress
    // }

    // Replicate the contract in case of partial withdraw
    val endOrReplicate = {
      val allFundsWithdrawn = extractedValue == SELF.value

      isSelfReplication || allFundsWithdrawn
    }

    // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold. (The deadline plays no role here.)
    val minimumReached = {
      val minimumSalesThreshold = SELF.R5[Long].get
      val soldCounter = SELF.R6[Long].get

      soldCounter > minimumSalesThreshold
    }
    
    endOrReplicate && soldCounterRemainsConstant && isToProjectAddress && minimumReached // && correctDevFee
  }

  // Can't withdraw ERG
  val mantainValue = SELF.value == OUTPUTS(0).value

  // Validation for withdrawing unsold tokens after the block limit
  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = isSelfReplication && soldCounterRemainsConstant && isToProjectAddress && mantainValue

  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = {

    val addsCorrectly = {

      val noAddsMoreTokens = OUTPUTS(0).tokens.size == 1
      val noWithdraw = SELF.tokens.size == 0 || SELF.tokens(0)._1 == OUTPUTS(0).tokens(0)._1 && SELF.tokens(0)._2 < OUTPUTS(0).tokens(0)._2

      // TODO: In case of SELF.tokens.size == 0, how to check if OUTPUTS(0).tokens(0)._1 is the initial token?

      noAddsMoreTokens && noWithdraw
    }

    val isFromProjectAddress = {
      val addrHash: Coll[Byte] = SELF.R8[Coll[Byte]].get
      val isSamePropBytes: Boolean = (addrHash == sha256(INPUTS(1).propositionBytes))
      
      isSamePropBytes
    }

    isSelfReplication && soldCounterRemainsConstant && mantainValue && isFromProjectAddress && addsCorrectly
  }

  sigmaProp(isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens)
}
  `;
let ergoTree = compile(contract, {version: 1})

let ergoTreeAddress = ergoTree.toAddress().toString
let ergoTreeHash = hex.encode(sha256(ergoTree.template.toBytes())) 

export const ergo_tree_address = ergoTreeAddress;
export const ergo_tree_template_hash = ergoTreeHash
