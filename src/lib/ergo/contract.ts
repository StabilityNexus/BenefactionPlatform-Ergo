
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

  def temporaryFundingTokenAmountOnContract(contract: Box): Long = {
    // IDT amount that serves as temporary funding token that is currently on the contract available to exchange.

    val proof_funding_token_amount = if (contract.tokens.size == 1) 0L else contract.tokens(1)._2
    val sold                       = contract.R6[(Long, Long)].get._1
    val refunded                   = contract.R6[(Long, Long)].get._2

    proof_funding_token_amount - sold + refunded 
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

  val selfId = SELF.tokens(0)._1
  val selfIDT = SELF.tokens(0)._2
  val selfValue = SELF.value
  val selfBlockLimit = SELF.R4[Int].get
  val selfMinimumTokensSold = SELF.R5[Long].get
  val selfSoldCounter = SELF.R6[(Long, Long)].get._1
  val selfRefundCounter = SELF.R6[(Long, Long)].get._2
  val selfExchangeRate = SELF.R7[Long].get
  val selfOwnerDetails = SELF.R8[Coll[Byte]].get
  val selfProjectMetadata = SELF.R9[Coll[Byte]].get
  val selfScript = SELF.propositionBytes

  // Validation of the box replication process
  val isSelfReplication = {

    // The nft id must be the same
    val sameId = selfId == OUTPUTS(0).tokens(0)._1

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

    // In case that the contract was created with more than two tokens, they doesn't should be added to the next contract box.
    val onlyOneOrAnyToken = OUTPUTS(0).tokens.size == 1 || OUTPUTS(0).tokens.size == 2

    // Verify that the output box is a valid copy of the input box
    sameId && sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript && onlyOneOrAnyToken
  }

  val IdTokenRemainsConstant = selfIDT == OUTPUTS(0).tokens(0)._2
  val ProofFundingTokenRemainsConstant = {

    val selfAmount = 
      if (SELF.tokens.size == 1) 0L
      else SELF.tokens(1)._2

    val outAmount =
      if (OUTPUTS(0).tokens.size == 1) 0L
      else OUTPUTS(0).tokens(1)._2
      
    selfAmount == outAmount
  }
  val soldCounterRemainsConstant = selfSoldCounter == OUTPUTS(0).R6[(Long, Long)].get._1
  val refundCounterRemainsConstant = selfRefundCounter == OUTPUTS(0).R6[(Long, Long)].get._2
  val mantainValue = selfValue == OUTPUTS(0).value
  val noAddsOtherTokens = OUTPUTS(0).tokens.size == 1 || OUTPUTS(0).tokens.size == 2

  val projectAddr: SigmaProp = PK("`+owner_addr+`")
  
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

  val deltaAddedProofTokens = {

    // Verify the token requirements
    val verifyToken = {

      // Verify if the second token matches the required token_id
      val correctToken = 
        if (OUTPUTS(0).tokens.size == 1) true 
        else OUTPUTS(0).tokens(1)._1 == fromBase16("`+token_id+`")

      noAddsOtherTokens && correctToken
    }

    // If verifyToken is false, return 0
    if (!verifyToken) 0L
    else {
      // Calculate the difference in token amounts
      val selfTokens = 
          if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.
          else SELF.tokens(1)._2
      
      val outTokens = 
          if (OUTPUTS(0).tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.
          else OUTPUTS(0).tokens(1)._2
      
      // Return the difference between output tokens and self tokens
      outTokens - selfTokens
    }
  }

  val minimumReached = {
    val minimumSalesThreshold = selfMinimumTokensSold
    val soldCounter = selfSoldCounter

    soldCounter >= minimumSalesThreshold
  }


  //  ACTIONS

  // Validation for purchasing Tokens
  // > People should be allowed to exchange ERGs for tokens until there are no more tokens left (even if the deadline has passed).
  val isBuyTokens = {

    // Delta of tokens removed from the box
    val deltaTokenRemoved = {
        val outputAlreadyTokens = OUTPUTS(0).tokens(0)._2

        selfIDT - outputAlreadyTokens
      }

    // Verify if the ERG amount matches the required exchange rate for the given token quantity
    val correctExchange = {

      // Delta of ergs added value from the user's ERG payment
      val deltaValueAdded = OUTPUTS(0).value - selfValue
      
      // ERG / Token exchange rate
      val exchangeRate = selfExchangeRate

      deltaValueAdded == deltaTokenRemoved * exchangeRate
    }

    // Verify if the token sold counter (R6)._1 is increased in proportion of the tokens sold.
    val incrementSoldCounterCorrectly = {

      // Calculate how much the sold counter is incremented.
      val counterIncrement = {
          // Obtain the current and the next "tokens sold counter"
          val selfAlreadySoldCounter = selfSoldCounter
          val outputAlreadySoldCounter = OUTPUTS(0).R6[(Long, Long)].get._1

          outputAlreadySoldCounter - selfAlreadySoldCounter
      }

      deltaTokenRemoved == counterIncrement
    }

    isSelfReplication && refundCounterRemainsConstant && correctExchange && incrementSoldCounterCorrectly && ProofFundingTokenRemainsConstant
  }

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

    // Calculate the amount of tokens that the user adds to the contract.
    val deltaTokenAdded = {
      val outputAlreadyTokens = OUTPUTS(0).tokens(0)._2

      outputAlreadyTokens - selfIDT
    }

    // Verify if the ERG amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      // Calculate the value returned from the contract to the user
      val retiredValueFromTheContract = selfValue - OUTPUTS(0).value

      // Calculate the value of the tokens added on the contract by the user
      val addedTokensValue = deltaTokenAdded * selfExchangeRate

      retiredValueFromTheContract == addedTokensValue
    }

    // Verify if the token refund counter (R6)._2 is increased in proportion of the tokens refunded.
    val incrementRefundCounterCorrectly = {

      // Calculate how much the refund counter is incremented.
      val counterIncrement = {
          // Obtain the current and the next "tokens refund counter"
          val selfAlreadyRefundCounter = selfRefundCounter
          val outputAlreadyRefundCounter = OUTPUTS(0).R6[(Long, Long)].get._2

          outputAlreadyRefundCounter - selfAlreadyRefundCounter
      }

      deltaTokenAdded == counterIncrement
    }

    // The contract returns the equivalent ERG value for the returned tokens
    isSelfReplication && soldCounterRemainsConstant && incrementRefundCounterCorrectly && ProofFundingTokenRemainsConstant && canBeRefund && correctExchange
  }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds = {
    // Anyone can withdraw the funds to the project address.
    
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

    val endOrReplicate = {
      val allFundsWithdrawn = extractedValue == selfValue
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    allOf(Coll(
      endOrReplicate,   // Replicate the contract in case of partial withdraw
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      minimumReached,   // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
      isToProjectAddress,
      correctDevFee,
      correctProjectAmount
    ))
  }

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = {
    val onlyUnsold = -deltaAddedProofTokens < temporaryFundingTokenAmountOnContract(SELF)

    allOf(Coll(
      isSelfReplication,
      refundCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens,
      IdTokenRemainsConstant,
      isToProjectAddress,
      deltaAddedProofTokens < 0,  // A negative value means that PFT are extracted.
      onlyUnsold  // Ensures that only extracts the token amount that has not been buyed.
    ))
  }
  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = {
    allOf(Coll(
      isSelfReplication,
      refundCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens,
      IdTokenRemainsConstant,
      isFromProjectAddress,
      deltaAddedProofTokens > 0
    ))
  }
  
  // Exchange IDT (token that identies the project used as temporary funding token) with PFT (proof-of-funding token)
  val isExchangeFundingTokens = {
    
    val correctExchange = {
      val deltaTemporaryFundingTokenAdded = {
        val selfTFT = SELF.tokens(0)._2
        val outTFT = OUTPUTS(0).tokens(0)._2

        selfTFT - outTFT
      }

      val deltaProofFundingTokenExtracted = {
        val selfPFT = 
          if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.
          else SELF.tokens(1)._2

        val outPFT =
          if (OUTPUTS(0).tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.
          else OUTPUTS(0).tokens(1)._2

        outPFT - selfPFT     
      }
      
      allOf(Coll(
        deltaTemporaryFundingTokenAdded == deltaProofFundingTokenExtracted,
        deltaTemporaryFundingTokenAdded < 0  // Ensures one way exchange (only send TFT and recive PFT)
      ))
    }

    val endOrReplicate = {
      val allFundsWithdrawn = selfValue == OUTPUTS(0).value
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective IDTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    allOf(Coll(
      endOrReplicate,
      minimumReached,   // Only can exchange when the refund action is not, and will not be, possible
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens,
      correctExchange
    ))
  }

  val actions = isBuyTokens || isRefundTokens || isWithdrawFunds || isWithdrawUnsoldTokens || isAddTokens || isExchangeFundingTokens

  // Validates that the contract was build correctly. Otherwise, it cannot be used.
  val correctBuild = {

    val correctTokenId = 
      if (SELF.tokens.size == 1) true 
      else SELF.tokens(1)._1 == fromBase16("`+token_id+`")
    
    val onlyOneOrAnyToken = SELF.tokens.size == 1 || SELF.tokens.size == 2

    correctTokenId && onlyOneOrAnyToken
  }

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

function get_contract_hash(constants: ConstantContent): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(generate_contract(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id), 
              {version: 1, network: network_id}
          ).toBytes()  // Compile contract to ergo tree
        ) // Blake2b256 hash of contract bytes
    );
}

export function mint_contract_address(constants: ConstantContent) {
  const contract_bytes_hash = get_contract_hash(constants);
  let contract = `
{
  val contractBox = OUTPUTS(0)

  val correctSpend = {
      val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1
      val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

      isIDT && spendAll
  }

  val correctContract = {
      fromBase16("`+contract_bytes_hash+`") == blake2b256(contractBox.propositionBytes)
  }

  sigmaProp(allOf(Coll(
      correctSpend,
      correctContract
  )))
}
`

  let ergoTree = compile(contract, {version: 1, network: network_id})

  let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
  return ergoTree.toAddress(network).toString();
}

