{

// ===== Contract Description ===== //
// Name: Bene Fundraising Platform Contract
// Description: Enables a project to receive funding in exchange for participation tokens.
// Version: 1.0.0
// Author: The Stable Order

// ===== Box Contents ===== //
// Tokens
// 1. (id, amount)
//    APT; Identifies the project and ensures which users have contributed to the project.
//    where:
//       id      The project nft identifier.
//       amount  PFT emission amount + 1
// 2. (id, amount)
//    PFT; Proof of funding token
//    where:
//       id      The project token identifier.
//       amount  The number of tokens equivalent to the maximum amount of ERG the project aims to raise. Could a partial proportion of the total existance of the token.

// Registers
// R4: Int                   The block height until which withdrawals or refunds are disallowed. After this height, they are permitted.
// R5: Long                  The minimum number of tokens that must be sold to trigger certain actions (e.g., withdrawals).
// R6: Coll[Long]      The total number of tokens sold, the total number of tokens refunded and the total number of APT changed per PFT so far.
// R7: Long                  The ERG-to-token exchange rate (ERG per token).
// R8: Coll[Byte]            Base58-encoded JSON string containing the contract owner's details.
// R9: Coll[Byte]            Base58-encoded JSON string containing project metadata, including "title" and "description".

// ===== Transactions ===== //
// 1. Buy APT Tokens
// Inputs:
//   - Project Bene Contract
//   - User box containing ERG
// Data Inputs: None
// Outputs:
//   - Updated Project Bene Contract
//   - User box containing APT purchased tokens
// Constraints:
//   - Ensure accurate ERG-to-token exchange based on the exchange rate.
//   - Update the token sold counter correctly.
//   - Transfer the correct number of tokens to the user.
//   - Validate that the contract is replicated correctly.

// 2. Refund APT Tokens
// Inputs:
//   - Project Bene Contract
//   - User box containing APT project tokens
// Outputs:
//   - Updated Project Bene Contract
//   - User box containing refunded ERG
// Constraints:
//   - Ensure the block height has surpassed the specified block limit (R4).
//   - Ensure the minimum token sales threshold (R5) has not been reached.
//   - Update the token refunded counter correctly.
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

// 6. Exchange Funding Tokens
// Inputs:
//
// Outputs:
// 
// Constraints
//

// ===== Compile Time Constants ===== //
// $owner_addr: Base58 address of the contract owner.
// $dev_fee_contract_bytes_hash: Blake2b-256 base16 string hash of the dev fee contract proposition bytes.
// $dev_fee: Percentage fee allocated to the developer (e.g., 5 for 5%).
// $token_id: Unique string identifier for the proof-of-funding token.

// ===== Context Variables ===== //
// None

// ===== Helper Functions ===== //
// None


  def temporaryFundingTokenAmountOnContract(contract: Box): Long =
    // APT amount that serves as temporary funding token that is currently on the contract available to exchange.
    val proof_funding_token_amount = if (contract.tokens.size == 1) 0L else contract.tokens(1)._2
    val sold = contract.R6[Coll[Long]].get(0)
    val refunded = contract.R6[Coll[Long]].get(1)
    val exchanged = contract.R6[Coll[Long]].get(2)  // If the exchanged APT -> PFT amount is not accounted for, it will result in double-counting the sold amount.
    proof_funding_token_amount - sold + refunded + exchanged

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
  val selfAPT = SELF.tokens(0)._2
  val selfValue = SELF.value
  val selfBlockLimit = SELF.R4[Int].get
  val selfMinimumTokensSold = SELF.R5[Long].get
  val selfSoldCounter = SELF.R6[Coll[Long]].get(0)
  val selfRefundCounter = SELF.R6[Coll[Long]].get(1)
  val selfAuxiliarExchangeCounter = SELF.R6[Coll[Long]].get(2)
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

    // The minimum amount of tokens sold must be the same
    val sameMinimumSold = selfMinimumTokensSold == OUTPUTS(0).R5[Long].get

    // The ERG/Token exchange rate must be same
    val sameExchangeRate = selfExchangeRate == OUTPUTS(0).R7[Long].get

    // The constants must be the same
    val sameConstants = selfOwnerDetails == OUTPUTS(0).R8[Coll[Byte]].get

    // The project content must be the same
    val sameProjectContent = selfProjectMetadata == OUTPUTS(0).R9[Coll[Byte]].get

    // The script must be the same
    val sameScript = selfScript == OUTPUTS(0).propositionBytes

    // Ensures that there are only one or two tokens in the contract (APT and PFT or only APT)
    val noAddsOtherTokens = OUTPUTS(0).tokens.size == 1 || OUTPUTS(0).tokens.size == 2

    // Verify that the output box is a valid copy of the input box
    sameId && sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript && noAddsOtherTokens
  }

  val APTokenRemainsConstant = selfAPT == OUTPUTS(0).tokens(0)._2
  val ProofFundingTokenRemainsConstant = {

    val selfAmount = 
      if (SELF.tokens.size == 1) 0L
      else SELF.tokens(1)._2

    val outAmount =
      if (OUTPUTS(0).tokens.size == 1) 0L
      else OUTPUTS(0).tokens(1)._2
      
    selfAmount == outAmount
  }
  val soldCounterRemainsConstant = selfSoldCounter == OUTPUTS(0).R6[Coll[Long]].get(0)
  val refundCounterRemainsConstant = selfRefundCounter == OUTPUTS(0).R6[Coll[Long]].get(1)
  val auxiliarExchangeCounterRemainsConstant = selfAuxiliarExchangeCounter == OUTPUTS(0).R6[Coll[Long]].get(2)
  val mantainValue = selfValue == OUTPUTS(0).value

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

  // Amount of PFT tokens added to the contract. In case of negative value, means that the token have been extracted.
  val deltaPFTokenAdded = {

    // Calculate the difference in token amounts
    val selfTokens = 
        if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
        else SELF.tokens(1)._2
    
    val outTokens = 
        if (OUTPUTS(0).tokens.size == 1) 0L // There is going to be any PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
        else OUTPUTS(0).tokens(1)._2
    
    // Return the difference between output tokens and self tokens
    outTokens - selfTokens
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

      selfAPT - outputAlreadyTokens
    }

    val onlyTemporaryUnsoldTokens = deltaTokenRemoved <= temporaryFundingTokenAmountOnContract(SELF)
    
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
          val outputAlreadySoldCounter = OUTPUTS(0).R6[Coll[Long]].get(0)

          outputAlreadySoldCounter - selfAlreadySoldCounter
      }

      allOf(Coll(
        deltaTokenRemoved == counterIncrement,
        counterIncrement > 0 // This ensures that the increment is positive, if not, the buy action could be reversed.
      ))
    }

    val constants = allOf(Coll(
      isSelfReplication,                          // Replicate the contract will be needed always                
      // endOrReplicate,                          // The contract can't end with this action
      // soldCounterRemainsConstant,              // The sold counter needs to be incremented.
      refundCounterRemainsConstant,               // The refund counter must be constant
      auxiliarExchangeCounterRemainsConstant,     // The auxiliar exchange counter must be constant because there is no exchange between APT -> PFT.
      // mantainValue,                            // Needs to add value to the contract                   
      // APTokenRemainsConstant,                  // APT token is extracted from the contract.
      ProofFundingTokenRemainsConstant           // PFT needs to be constant
    ))

    allOf(Coll(
      constants,
      onlyTemporaryUnsoldTokens,     // Since the amount of APT is equal to the emission amount of PFT (+1), not necessarily equal to the contract amount, it must be ensured that the APT sold can be exchanged in the future.
      correctExchange,               // Ensures that the proportion between the APTs and value moved is the same following the R7 ratio.
      incrementSoldCounterCorrectly  // Ensures that the R6 first value is incremented in proportion to the exchange value moved.
    ))
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

      outputAlreadyTokens - selfAPT
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
          val outputAlreadyRefundCounter = OUTPUTS(0).R6[Coll[Long]].get(1)

          outputAlreadyRefundCounter - selfAlreadyRefundCounter
      }

      allOf(Coll(
        deltaTokenAdded == counterIncrement,
        counterIncrement > 0   // This ensures that the increment is positive, if not, the buy action could be reversed.
      ))
    }

    val constants = allOf(Coll(
      isSelfReplication,                          // Replicate the contract will be needed always            
      // endOrReplicate,                          // The contract can't end with this action
      soldCounterRemainsConstant,                 // The sold counter needs to be constant.
      // refundCounterRemainsConstant,            // Refund counter needs to be incremented.
      auxiliarExchangeCounterRemainsConstant,     // Auxiliar counter needs to be constant.
      // mantainValue,                            // Needs to extract value     
      // APTokenRemainsConstant,                  // Needs to add Auxiliar tokens.
      ProofFundingTokenRemainsConstant           // PFT needs to be constant.
    ))

    // The contract returns the equivalent ERG value for the returned tokens
    allOf(Coll(
      constants,
      canBeRefund,                            // Ensures that the refund conditions are satisfied.
      incrementRefundCounterCorrectly,        // Ensures increment the refund counter correctly in proportion with the exchanged amount.
      correctExchange                         // Ensures that the value extracted and the APTs added are proportional following the R7 exchange ratio.
    ))
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

    val correctDevFee = {  // TODO In case all funds are being extracted and there isn’t enough for the developers’ portion to reach the minimum, it should be forgiven.
      val OUT = OUTPUTS(2)

      val isToDevAddress = {
          val isSamePropBytes: Boolean = fromBase16("`+dev_fee_contract_bytes_hash+`") == blake2b256(OUT.propositionBytes)
          
          isSamePropBytes
      }

      val isCorrectDevAmount = OUT.value == devFeeAmount

      allOf(Coll(
        isCorrectDevAmount,
        isToDevAddress
      ))
    }

    val endOrReplicate = {
      val allFundsWithdrawn = extractedValue == selfValue
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    val constants = allOf(Coll(
      // isSelfReplication,                     
      endOrReplicate,                             // Replicate the contract in case of partial withdraw
      soldCounterRemainsConstant,                 // Any of the counter needs to be incremented, so all of them (sold, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,                       
      auxiliarExchangeCounterRemainsConstant,   
      // mantainValue,                           // Needs to extract value from the contract
      APTokenRemainsConstant,                    // There is no need to modify the auxiliar token, so it must be constant
      ProofFundingTokenRemainsConstant          // There is no need to modify the proof of funding token, so it must be constant
    ))

    allOf(Coll(
      constants,
      minimumReached,           // Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
      isToProjectAddress,       // Only to the project address
      correctDevFee,            // Ensures that the dev fee amount and dev address are correct
      correctProjectAmount      // Ensures the correct project amount.
    ))
  }

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = {
    // Calculate that only are sold the amount of PFT that are available, in other case, will be problems on the APT -> PFT exchange.
    val onlyUnsold = {

      // The amount of PFT token that has been extracted from the contract
      val extractedPFT = -deltaPFTokenAdded 

      // Current APT tokens without the one used for project identification     (remember that the APT amount is equal to the PFT emission amount + 1, because the 1 is for be always inside the contract)
      val temporalTokens = temporaryFundingTokenAmountOnContract(SELF)

      // Only can extract an amount sufficient lower to allow the exchange APT -> PFT
      extractedPFT <= temporalTokens
    }

    val constants = allOf(Coll(
      isSelfReplication,                         // Replicate the contract will be needed always            
      // endOrReplicate,                         // The contract can't end with this action
      soldCounterRemainsConstant,                // Any of the counter needs to be incremented, so all of them (sold, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,                       
      auxiliarExchangeCounterRemainsConstant,
      mantainValue,                              // The value of the contract must not change.
      APTokenRemainsConstant                     // APT token must be constant.
      // ProofFundingTokenRemainsConstant        // The PFT is the token that the action tries to withdraw              
    ))

    allOf(Coll(
      constants,
      isToProjectAddress,
      deltaPFTokenAdded < 0,  // A negative value means that PFT are extracted.
      onlyUnsold  // Ensures that only extracts the token amount that has not been buyed.
    ))
  }
  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = {

    val constants = allOf(Coll(
      isSelfReplication,                     // Replicate the contract will be needed always            
      // endOrReplicate,                     // The contract can't end with this action
      soldCounterRemainsConstant,            // Any of the counter needs to be incremented, so all of them (sold, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,                       
      auxiliarExchangeCounterRemainsConstant,   
      mantainValue,                                 
      APTokenRemainsConstant                 // There is no need to modify the APT amount because the amount is established in base of the PFT emission amount.
      // ProofFundingTokenRemainsConstant,   // Adds PFT tokens, so can't remain constant             
    ))

    if (INPUTS.size == 1) false  // To avoid access INPUTS(1) when there is no input, this could be resolved using actions.
    else allOf(Coll(
      constants,
      isFromProjectAddress,   // Ensures that the tokens come from the project owners.
      deltaPFTokenAdded > 0   // Ensures that the tokens are added.
    ))
  }
  
  // Exchange APT (token that identies the project used as temporary funding token) with PFT (proof-of-funding token)
  val isExchangeFundingTokens = {

    val deltaTemporaryFundingTokenAdded = {
      val selfTFT = SELF.tokens(0)._2
      val outTFT = OUTPUTS(0).tokens(0)._2

      outTFT - selfTFT
    }

    val correctExchange = {

      val deltaProofFundingTokenExtracted = -deltaPFTokenAdded
      
      allOf(Coll(
        deltaTemporaryFundingTokenAdded == deltaProofFundingTokenExtracted,
        deltaTemporaryFundingTokenAdded > 0  // Ensures one way exchange (only send TFT and recive PFT)
      ))
    }

      // Verify if the token auxiliar exchange counter (R6)._3 is increased in proportion of the tokens refunded.
    val incrementExchangeCounterCorrectly = {

      // Calculate how much the counter is incremented.
      val counterIncrement = {
          val selfAlreadyCounter = selfAuxiliarExchangeCounter
          val outputAlreadyRefundCounter = OUTPUTS(0).R6[Coll[Long]].get(2)

          outputAlreadyRefundCounter - selfAlreadyCounter
      }

      deltaTemporaryFundingTokenAdded == counterIncrement
    }

    val endOrReplicate = {
      val allFundsWithdrawn = selfValue == OUTPUTS(0).value
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    val constants = allOf(Coll(
      // isSelfReplication,                        
      endOrReplicate,                                       // The contract could be finalized on after this action, so it only check self replication in case of partial withdraw
      soldCounterRemainsConstant,                           // Sold counter must be constant
      refundCounterRemainsConstant,                         // Refund counter must be constant
      // auxiliarExchangeCounterRemainsConstant,            // Auxiliar tokens are added to the contract to be exchanged with PFT
      mantainValue                                          // ERG value must be constant
      // APTokenRemainsConstant,                            // APT will change
      // ProofFundingTokenRemainsConstant,                  // PFT will change
    ))

    allOf(Coll(
      constants,
      minimumReached,                        // Only can exchange when the refund action is not, and will not be, possible
      incrementExchangeCounterCorrectly,     // Ensures that the exchange counter is incremented in proportion to the APT added and the PFT extracted.
      correctExchange                        // Ensures that the APT added and the PFT extracted amounts are equal.
    ))
  }

  val actions = anyOf(Coll(
    isBuyTokens,
    isRefundTokens,
    isWithdrawFunds,
    isWithdrawUnsoldTokens,
    isAddTokens,
    isExchangeFundingTokens
  ))

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