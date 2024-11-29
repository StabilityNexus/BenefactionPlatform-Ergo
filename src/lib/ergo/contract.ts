
import { type ConstantContent } from "$lib/common/project";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex } from "@fleet-sdk/crypto";

export function generate_contract(owner_addr: string, dev_addr: string, dev_fee: number, token_id: string) {
    return `
/*
*
* Registers
* R4     -> Block limit until allowed withdrawal or refund
* R5     -> The minimum amount of tokens that need to be sold.
* R6     -> The amount of tokens that have already been sold.
* R7     -> ERG/Token exchange rate
* R8     -> Contract owner, dev base58 address and dev fee on strig formated JSON.  (only for allow build the contract with constants again)
* R9     -> Project content (title, description ...) on string formated JSON.
*
* Constants
* owner_addr -> Contract owner base58 address
* dev_addr   -> Dev base58 address
* dev_fee    -> % number, ex: 5 for 5% fee.
* token_id   -> token id string
* 
*/
{
  // Validation of the box replication process
  val isSelfReplication = {

    // The block limit must be the same
    val sameBlockLimit = SELF.R4[Int].get == OUTPUTS(0).R4[Int].get

    // The minimum amount of tokens sold must be the same.
    val sameMinimumSold = SELF.R5[Long].get == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = SELF.R7[Long].get == OUTPUTS(0).R7[Long].get

    // The constants must be the same
    val sameConstants = SELF.R8[Coll[Byte]].get == OUTPUTS(0).R8[Coll[Byte]].get

    // The project content must be the same
    val sameProjectContent = SELF.R9[Coll[Byte]].get == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same to ensure replication
    val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

    // Verify that the output box is a valid copy of the input box
    sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript
  }

  // Validation for purchasing Tokens
  // > People should be allowed to exchange ERGs for tokens until there are no more tokens left (even if the deadline has passed).
  val isBuyTokens = {

    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = {

      // Delta of tokens removed from the box
      val deltaTokenRemoved = SELF.tokens(0)._2 - OUTPUTS(0).tokens(0)._2

      // Delta of ergs added value from the user's ERG payment
      val deltaValueAdded = OUTPUTS(0).value - SELF.value
      
      // ERG / Token exchange rate
      val exchangeRate = SELF.R7[Long].get

      deltaValueAdded == deltaTokenRemoved * exchangeRate
    }

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
      val numberOfTokensBuyed = {
        val selfAlreadyTokens = if (SELF.tokens.size == 0) 0.toLong else SELF.tokens(0)._2
        val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2

        selfAlreadyTokens - outputAlreadyTokens
      }

      numberOfTokensBuyed == counterIncrement
    }

    isSelfReplication && correctExchange && incrementSoldCounterCorrectly
  }

  val soldCounterRemainsConstant = SELF.R6[Long].get == OUTPUTS(0).R6[Long].get

  // Validation for refunding tokens
  val isRefundTokens = {

    // > People should be allowed to exchange tokens for ERGs if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
    // The minimum number of tokens has not been sold.
    val minimumNotReached = {
        val minimumSalesThreshold = SELF.R5[Long].get
        val soldCounter = SELF.R6[Long].get

        soldCounter < minimumSalesThreshold
    }

    // Condition to check if the current height is beyond the block limit
    val afterBlockLimit = HEIGHT > SELF.R4[Int].get
    
    afterBlockLimit && minimumNotReached
    }

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      // Calculate the value returned from the contract to the user
      val retiredValueFromTheContract = SELF.value - OUTPUTS(0).value

      // Calculate the value of the tokens added on the contract by the user
      val addedTokensValue = {
          // Calculate the amount of tokens that the user adds to the contract.
          val addedTokensOnTheContract = {
            val selfAlreadyTokens = if (SELF.tokens.size == 0) 0.toLong else SELF.tokens(0)._2
            val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2

            outputAlreadyTokens - selfAlreadyTokens
          }

          addedTokensOnTheContract * SELF.R7[Long].get
      }

      val sameToken = {
        val selfAlreadyToken = if (SELF.tokens.size == 0) Coll[Byte]() else SELF.tokens(0)._1
        val outputAlreadyToken = if (OUTPUTS(0).tokens.size == 0) Coll[Byte]() else OUTPUTS(0).tokens(0)._1

        selfAlreadyToken == outputAlreadyToken
      }

      retiredValueFromTheContract == addedTokensValue && sameToken
    }

    // The contract returns the equivalent ERG value for the returned tokens
    isSelfReplication && soldCounterRemainsConstant && canBeRefund && correctExchange
  }

  def isSigmaPropEqualToBoxProp(propAndBox: (SigmaProp, Box)): Boolean = {

    val prop: SigmaProp = propAndBox._1
    val box: Box = propAndBox._2

    val propBytes: Coll[Byte] = prop.propBytes
    val treeBytes: Coll[Byte] = box.propositionBytes

    if (treeBytes(0) == 0) {

        (treeBytes == propBytes)

    } else {

        // offset = 1 + <number of VLQ encoded bytes to store propositionBytes.size>
        val offset = if (treeBytes.size > 127) 3 else 2
        (propBytes.slice(1, propBytes.size) == treeBytes.slice(offset, treeBytes.size))

    }

  }

  val projectAddr: SigmaProp = PK("`+owner_addr+`") // TODO 1 if devAddress is a splitting contract you cannot do PK(“...”). 
  
  val isToProjectAddress = {
    val propAndBox: (SigmaProp, Box) = (projectAddr, OUTPUTS(1))
    val isSamePropBytes: Boolean = isSigmaPropEqualToBoxProp(propAndBox)

    isSamePropBytes
  }

  val isFromProjectAddress = {
    val propAndBox: (SigmaProp, Box) = (projectAddr, INPUTS(1))
    val isSamePropBytes: Boolean = isSigmaPropEqualToBoxProp(propAndBox)
    
    isSamePropBytes
  }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds = {

    // ERG extracted amount considering that the contract could not be replicated.
    val extractedValue: Long = {
      OUTPUTS(1).value - INPUTS.slice(1, INPUTS.size).fold(0L, { (acc: Long, box: Box) => acc + box.value })
    }

    val correctDevFee = {
      val OUT = OUTPUTS(2)

      // Could be: https://github.com/PhoenixErgo/phoenix-hodlcoin-contracts/blob/main/hodlERG/contracts/phoenix_fee_contract/v1/ergoscript/phoenix_v1_hodlerg_fee.es
      val devFee = `+dev_fee+`
      val devAddr: SigmaProp = PK("`+dev_addr+`")

      val isToDevAddress = {
          val isSamePropBytes: Boolean = devAddr.propBytes == OUT.propositionBytes
          
          isSamePropBytes
      }

      val isCorrectDevAmount = {
        val devAmount = extractedValue * devFee / 100
        OUT.value == devAmount
      }

      isCorrectDevAmount && isToDevAddress
    }

    // Replicate the contract in case of partial withdraw
    val endOrReplicate = {
      val allFundsWithdrawn = extractedValue == SELF.value

      isSelfReplication || allFundsWithdrawn
    }

    // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold. (The deadline plays no role here.)
    val minimumReached = {
      val minimumSalesThreshold = SELF.R5[Long].get
      val soldCounter = SELF.R6[Long].get

      soldCounter >= minimumSalesThreshold
    }
    
    endOrReplicate && soldCounterRemainsConstant && minimumReached && isToProjectAddress && correctDevFee
  }

  // Can't withdraw ERG
  val mantainValue = SELF.value == OUTPUTS(0).value

  val verifyToken = {

    val noAddsOtherTokens = OUTPUTS(0).tokens.size < 2

    val correctToken = if (OUTPUTS(0).tokens.size == 0) true else OUTPUTS(0).tokens(0)._1 == fromBase16("`+token_id+`")

    noAddsOtherTokens && correctToken
  }

  val deltaAddedTokens = OUTPUTS(0).tokens(0)._2 - SELF.tokens(0)._2

  val correctRebalanceTokens = isSelfReplication && soldCounterRemainsConstant && mantainValue && verifyToken

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = correctRebalanceTokens && isToProjectAddress && deltaAddedTokens < 0
  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = correctRebalanceTokens && isFromProjectAddress && deltaAddedTokens > 0

  // Validates that the contract was build correctly. Otherwise, it cannot be used.
  val correctBuild = {
    val correctTokenId = if (SELF.tokens.size == 0) true else SELF.tokens(0)._1 == fromBase16("`+token_id+`")
    val onlyOneOrAnyToken = SELF.tokens.size < 2

    correctTokenId && onlyOneOrAnyToken
  }

  val actions = isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens

  sigmaProp(correctBuild && actions)
}
  `
}

export function get_address(constants: ConstantContent) {

    let contract = generate_contract(constants.owner, constants.dev, constants.dev_fee, constants.token_id);
    let ergoTree = compile(contract, {version: 1})

    return ergoTree.toAddress(Network.Mainnet).toString();
}

function get_template_hash(): string {
  // If the same address is used for both constants the template changes.
  const random_addr = "9fwQGg6pPjibqhEZDVopd9deAHXNsWU4fjAHFYLAKexdVCDhYEs";
  const random_addr2 = "9gGZp7HRAFxgGWSwvS4hCbxM2RpkYr6pHvwpU4GPrpvxY7Y2nQo";
  let contract = generate_contract(random_addr, random_addr2, 5, "");
  return hex.encode(sha256(compile(contract, {version: 1}).template.toBytes()))
}

export const ergo_tree_template_hash = get_template_hash()
console.log(ergo_tree_template_hash)