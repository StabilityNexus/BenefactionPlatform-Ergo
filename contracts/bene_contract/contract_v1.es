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

{

  def temporaryFundingTokenAmountOnContract(contract: Box): Long = {
    // APT amount that serves as temporary funding token that is currently on the contract available to exchange.

    val proof_funding_token_amount = if (contract.tokens.size == 1) 0L else contract.tokens(1)._2
    val sold                       = contract.R6[Coll[Long]].get(0)
    val refunded                   = contract.R6[Coll[Long]].get(1)

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
          if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
          else SELF.tokens(1)._2
      
      val outTokens = 
          if (OUTPUTS(0).tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
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

        selfAPT - outputAlreadyTokens
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
          val outputAlreadySoldCounter = OUTPUTS(0).R6[Coll[Long]].get(0)

          outputAlreadySoldCounter - selfAlreadySoldCounter
      }

      deltaTokenRemoved == counterIncrement
    }

    isSelfReplication && refundCounterRemainsConstant && auxiliarExchangeCounterRemainsConstant && correctExchange && incrementSoldCounterCorrectly && ProofFundingTokenRemainsConstant
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

      deltaTokenAdded == counterIncrement
    }

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      incrementExchangeCounterCorrectly,
      ProofFundingTokenRemainsConstant

    ))

    // The contract returns the equivalent ERG value for the returned tokens
    allOf(Coll(
      constants,
      canBeRefund,
      correctExchange
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
      val allTokensWithdrawn = SELF.tokens.size == 1 // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.

      isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
    }

    val constants = allOf(Coll(
      endOrReplicate,   // Replicate the contract in case of partial withdraw
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant
    ))

    allOf(Coll(
      constants,
      minimumReached,   // > Project owners are allowed to withdraw ERGs if and only if the minimum number of tokens has been sold.
      isToProjectAddress,
      correctDevFee,
      correctProjectAmount
    ))
  }

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens = {
    val onlyUnsold = -deltaAddedProofTokens < temporaryFundingTokenAmountOnContract(SELF)

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens,
      APTokenRemainsConstant
    ))

    allOf(Coll(
      constants,
      isToProjectAddress,
      deltaAddedProofTokens < 0,  // A negative value means that PFT are extracted.
      onlyUnsold  // Ensures that only extracts the token amount that has not been buyed.
    ))
  }
  
  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens = {

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens,
      APTokenRemainsConstant
    ))

    allOf(Coll(
      constants,
      isFromProjectAddress,
      deltaAddedProofTokens > 0
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

      val deltaProofFundingTokenExtracted = {
        val selfPFT = 
          if (SELF.tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
          else SELF.tokens(1)._2

        val outPFT =
          if (OUTPUTS(0).tokens.size == 1) 0L // There is no PFT in the contract, which means that all the PFT tokens have been exchanged for their respective APTs.
          else OUTPUTS(0).tokens(1)._2

        selfPFT - outPFT     
      }
      
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
      endOrReplicate,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      mantainValue,
      noAddsOtherTokens
    ))

    allOf(Coll(
      constants,
      minimumReached,   // Only can exchange when the refund action is not, and will not be, possible
      incrementExchangeCounterCorrectly,
      correctExchange
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