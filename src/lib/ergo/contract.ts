
import { type ConstantContent } from "$lib/common/project";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";

export function generate_contract(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string) {
    return `
{
  val selfTokens = if (SELF.tokens.size == 0) 0L else SELF.tokens(0)._2
  val selfTokenId = if (SELF.tokens.size == 0) Coll[Byte]() else SELF.tokens(0)._1
  val selfValue = SELF.value
  val selfBlockLimit = SELF.R4[Int].get
  val selfMinimumTokensSold = SELF.R5[Long].get
  val selfSoldCounter = SELF.R6[Long].get
  val selfExchangeRate = SELF.R7[Long].get
  val selfOwnerDetails = SELF.R8[Coll[Byte]].get
  val selfProjectMetadata = SELF.R9[Coll[Byte]].get
  val selfScript = SELF.propositionBytes

  // Validation of the box replication process
  val isSelfReplication = {

    // The block limit must be the same
    val sameBlockLimit = selfBlockLimit == OUTPUTS(0).R4[Int].get

    // The minimum amount of tokens sold must be the same.
    val sameMinimumSold = selfMinimumTokensSold == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = selfExchangeRate == OUTPUTS(0).R7[Long].get

    // The constants must be the same
    val sameConstants = selfOwnerDetails == OUTPUTS(0).R8[Coll[Byte]].get

    // The project content must be the same
    val sameProjectContent = selfProjectMetadata == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same to ensure replication
    val sameScript = selfScript == OUTPUTS(0).propositionBytes

    // Verify that the output box is a valid copy of the input box
    sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript
  }

  // Validation for purchasing Tokens
  // > People should be allowed to exchange ERGs for tokens until there are no more tokens left (even if the deadline has passed).
  val isBuyTokens = {

    // Delta of tokens removed from the box
    val deltaTokenRemoved = {
        val selfAlreadyTokens = selfTokens
        val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2

        selfAlreadyTokens - outputAlreadyTokens
      }

    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = {

      // Delta of ergs added value from the user's ERG payment
      val deltaValueAdded = OUTPUTS(0).value - selfValue
      
      // ERG / Token exchange rate
      val exchangeRate = selfExchangeRate

      deltaValueAdded == deltaTokenRemoved * exchangeRate
    }

    // Verify if the token sold counter (R6) is increased in proportion of the tokens sold.
    val incrementSoldCounterCorrectly = {

      // Calculate how much the sold counter is incremented.
      val counterIncrement = {
          // Obtain the current and the next "tokens sold counter"
          val selfAlreadySoldCounter = selfSoldCounter
          val outputAlreadySoldCounter = OUTPUTS(0).R6[Long].get

          outputAlreadySoldCounter - selfAlreadySoldCounter
      }

      deltaTokenRemoved == counterIncrement
    }

    isSelfReplication && correctExchange && incrementSoldCounterCorrectly
  }

  val soldCounterRemainsConstant = selfSoldCounter == OUTPUTS(0).R6[Long].get

  // Validation for refunding tokens
  val isRefundTokens = {

    // > People should be allowed to exchange tokens for ERGs if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
    // The minimum number of tokens has not been sold.
    val minimumNotReached = {
        val minimumSalesThreshold = selfMinimumTokensSold
        val soldCounter = selfSoldCounter

        soldCounter < minimumSalesThreshold
    }

    // Condition to check if the current height is beyond the block limit
    val afterBlockLimit = HEIGHT > selfBlockLimit
    
    afterBlockLimit && minimumNotReached
    }

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      // Calculate the value returned from the contract to the user
      val retiredValueFromTheContract = selfValue - OUTPUTS(0).value

      // Calculate the value of the tokens added on the contract by the user
      val addedTokensValue = {
          // Calculate the amount of tokens that the user adds to the contract.
          val addedTokensOnTheContract = {
            val selfAlreadyTokens = selfTokens
            val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2

            outputAlreadyTokens - selfAlreadyTokens
          }

          addedTokensOnTheContract * selfExchangeRate
      }

      val sameToken = {
        val selfAlreadyToken = selfTokenId
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

    // TODO: Actually, anyone can withdraw the funds to the project address. Is that correct, or should it only be an action possible by the project owners themselves?

    val minnerFeeAmount = 1100000  // Pay minner fee with the extracted value allows to withdraw when project address does not have ergs.
    val devFee = `+dev_fee+`
    val extractedValue: Long = if (selfScript == OUTPUTS(0).propositionBytes) { selfValue - OUTPUTS(0).value } else { selfValue }
    val devFeeAmount = extractedValue * devFee / 100
    val projectAmount = extractedValue - devFeeAmount - minnerFeeAmount

    val correctProjectAmount = OUTPUTS(1).value == projectAmount

    val correctDevFee = {
      val OUT = OUTPUTS(2)

      val isToDevAddress = {
          val isSamePropBytes: Boolean = fromBase16("`+dev_fee_contract_bytes_hash+`") == blake2b256(OUT.propositionBytes)
          
          isSamePropBytes
      }

      val isCorrectDevAmount = OUT.value == devFeeAmount

      isCorrectDevAmount && isToDevAddress
    }

    // Replicate the contract in case of partial withdraw
    val endOrReplicate = {
      val allFundsWithdrawn = extractedValue == selfValue

      isSelfReplication || allFundsWithdrawn
    }

    // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold. (The deadline plays no role here.)
    val minimumReached = {
      val minimumSalesThreshold = selfMinimumTokensSold
      val soldCounter = selfSoldCounter

      soldCounter >= minimumSalesThreshold
    }
    
    endOrReplicate && soldCounterRemainsConstant && minimumReached && isToProjectAddress && correctDevFee && correctProjectAmount
  }

  // Can't withdraw ERG
  val mantainValue = selfValue == OUTPUTS(0).value

  val verifyToken = {

    val noAddsOtherTokens = OUTPUTS(0).tokens.size < 2

    val correctToken = if (OUTPUTS(0).tokens.size == 0) true else OUTPUTS(0).tokens(0)._1 == fromBase16("`+token_id+`")

    noAddsOtherTokens && correctToken
  }

  val deltaAddedTokens = {
    val outTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2
    outTokens - selfTokens
  }

  val correctRebalanceTokens = isSelfReplication && soldCounterRemainsConstant && mantainValue && verifyToken

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = correctRebalanceTokens && isToProjectAddress && deltaAddedTokens < 0
  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = correctRebalanceTokens && isFromProjectAddress && deltaAddedTokens > 0

  // Validates that the contract was build correctly. Otherwise, it cannot be used.
  val correctBuild = {
    val correctTokenId = selfTokenId == fromBase16("`+token_id+`")
    val onlyOneOrAnyToken = SELF.tokens.size < 2

    correctTokenId && onlyOneOrAnyToken
  }

  val actions = isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens

  sigmaProp(correctBuild && actions)
}
  `
}

export function get_address(constants: ConstantContent) {

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    let contract = generate_contract(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id);
    let ergoTree = compile(contract, {version: 1, network: network_id})

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

function get_template_hash(): string {
  const mainnet_addr = "9f3iPJTiciBYA6DnTeGy98CvrwyEhiP7wNrhDrQ1QeKPRhTmaqQ";
  const testnet_addr = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
  let random_addr = network_id == "mainnet" ? mainnet_addr : testnet_addr;
  const dev_contract = uint8ArrayToHex(blake2b256("9a3d2f6b"));
  let contract = generate_contract(random_addr, dev_contract, 5, "");
  return hex.encode(sha256(compile(contract, {version: 1, network: network_id}).template.toBytes()))
}

export const ergo_tree_template_hash = get_template_hash()