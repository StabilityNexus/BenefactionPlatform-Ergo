{

// ===== Contract Description ===== //
// Name: Bene Fundraising Platform Contract (Multi-Token Support)
// Description: Enables a project to receive funding in exchange for participation tokens using any base token.
// Version: 1.3.0
// Author: The Stable Order

// ===== CHANGES FROM v1.2.1 (contract_v2.es) ===== //
// This file addresses #78 / #174 (replication guard), #176 (project identity) and #177 (dev fee
// evasion). contract_v2.es is deliberately left untouched: the frontend compiles that source at
// runtime to derive the template hash it searches boxes with and the ErgoTree it rebuilds replicas
// with, so changing it would drop every live v2 project out of the platform and invalidate their
// transactions against sameScript.
//
// 1. Project identity is a singleton NFT at tokens(0) with amount 1 (#176). In v2 the identity was
//    tokens(0) = the APT, whose amount is the PFT emission + 1 and which circulates to buyers by
//    design, so several boxes could carry it at once and none of them was distinguishable.
//
// 2. Replication is structural (#174). v2 decided it was being replicated by looking at OUTPUTS(0)
//    alone, and wrote every guard as !isReplicationBoxPresent || (...), so a copy at any other
//    index left all of them vacuously true. Here a box carrying this script may appear at most
//    once among the outputs, and when it appears it must be at OUTPUTS(0) - checked once, at the
//    top level, for every action. A clone can no longer be slipped into isBuyTokens, isAddTokens,
//    isExchangeFundingTokens or isWithdrawFunds either.
//
// 3. The NFT is either in the replica or in an unspendable terminal box, never anywhere else and
//    never in two places (#176). This is what makes a closed campaign impossible to resurrect.
//
// 4. Termination is only possible through isWithdrawFunds (#177), which forces the owner + dev fee
//    split. isWithdrawUnsoldTokens always replicates again, as it did before v1.2.1: allowing it
//    to terminate left mantainValue vacuous, so the owner could take the whole balance without
//    paying the fee. The reason it was allowed to terminate - sparing the frontend from leaving
//    1 smallest unit of PFT behind so the box stayed identifiable - is gone with the NFT.
//
// 5. The dev fee is rounded up and must be strictly positive whenever anything is extracted (#177),
//    so it can no longer be truncated away by withdrawing 19 units at a time on a token campaign.
//
// 6. minnerFeeAmount, declared and never used in v2, is gone. Its comment claimed it let the
//    withdrawal pay the miner fee out of the extracted value, but the contract requires the owner
//    to receive exactly extracted - devFee, so there was never anything left for it.

// ===== Box Contents ===== //
// Tokens
// 0. (id, amount)
//    Project NFT; identifies the project. Minted with the project box in creation Tx B.
//    where:
//       id      The project identifier. On Ergo the minted id is INPUTS(0).boxId, and input 0 of
//               Tx B is the mint box, so the id is deterministic and known once Tx A confirms.
//       amount  Always 1.
// 1. (id, amount)
//    APT; temporary funding token, handed to contributors and exchanged back for PFT.
//    where:
//       id      The APT (IDT) identifier.
//       amount  PFT emission amount + 1
//               The +1 is kept so that the APT is always present, which is what lets every action
//               address it at a fixed index. It no longer carries identity - the NFT does.
// 2. (id, amount)
//    PFT; Proof of funding token
//    where:
//       id      The project token identifier.
//       amount  The number of tokens equivalent to the maximum amount of base token the project aims to raise.
// 3. (id, amount)
//    Base token, only when the campaign is not denominated in ERG.

// Registers
// R4: (Boolean, Long)       This tuple specifies the temporal limit for refund prohibition. The Boolean indicates the limit type (false for Block Height, true for Timestamp), and the Long holds the limit value. Refunds are only allowed after this point if the minimum threshold was not met.
// R5: Long                  The minimum number of tokens that must be sold to trigger certain actions (e.g., withdrawals).
// R6: Coll[Long]            The total number of tokens sold, the total number of tokens refunded and the total number of APT changed per PFT so far.
// R7: Long                  Base token exchange rate (base token per PFT)
// R8: Coll[Coll[Byte]]      Constants [owner_ergotree, dev_fee_contract_bytes_hash, dev_fee, pft_token_id, base_token_id] as Base58-encoded JSON strings.
// R9: Coll[Byte]            Base58-encoded JSON string containing project metadata, including "title" and "description".

// ===== R8 Constants ===== //
// $owner_ergotree: ErgoTree bytes (hex) of the contract owner (supports both P2PK and P2S).
// $dev_fee_contract_bytes_hash: Blake2b-256 base16 string hash of the dev fee contract proposition bytes.
// $dev_fee: Percentage fee allocated to the developer (e.g., 5 for 5%).
// $pft_token_id: Unique string identifier for the proof-of-funding token.
// $base_token_id: Base token ID for contributions (empty string for ERG).

  val r8 = SELF.R8[Coll[Coll[Byte]]].get

  val ownerErgoTree           = r8(0)
  val devFeeContractBytesHash = r8(1)
  val devFee                  = byteArrayToBigInt(r8(2))
  val pftTokenId              = r8(3)
  val baseTokenId             = if (r8.size > 4) r8(4) else Coll[Byte]()

  val selfId = SELF.tokens(0)._1          // Project NFT. Identity, amount 1.
  val selfAPTId = SELF.tokens(1)._1
  val selfAPT = SELF.tokens(1)._2
  val selfValue = SELF.value
  val selfBlockLimit = SELF.R4[(Boolean, Long)].get
  val selfMinimumTokensSold = SELF.R5[Long].get
  val selfSoldCounter = SELF.R6[Coll[Long]].get(0)
  val selfRefundCounter = SELF.R6[Coll[Long]].get(1)
  val selfAuxiliarExchangeCounter = SELF.R6[Coll[Long]].get(2)
  val selfExchangeRate = SELF.R7[Long].get
  val selfConstants = SELF.R8[Coll[Coll[Byte]]].get
  val selfProjectMetadata = SELF.R9[Coll[Byte]].get
  val selfScript = SELF.propositionBytes

  // Proposition bytes of { sigmaProp(false) }. The project NFT is sent to a box with this script
  // when the campaign ends: nothing can ever spend it, so the identity cannot come back.
  val terminalScript = fromBase16("1906010100d17300")

  // ===== Replication, structurally ===== //
  // v2 asked only whether OUTPUTS(0) carried this script, which said nothing about copies sitting
  // at other indices. Here we count them.
  val replicas = OUTPUTS.filter({(box: Box) => box.propositionBytes == selfScript})

  // At most one box carrying this script may leave the transaction. Enforced at the top level, so
  // it holds for every action rather than for the ones that remembered to ask.
  val noExtraReplicas = replicas.size <= 1

  val isReplicationBoxPresent = replicas.size == 1 && OUTPUTS(0).propositionBytes == selfScript

  // Get base token information
  val isERGBase = baseTokenId.size == 0

  // HELP FUNCTIONS

  def temporaryFundingTokenAmountOnContract(contract: Box): Long = {
    // APT amount that serves as temporary funding token that is currently on the contract available to exchange.

    val pfts = contract.tokens.filter { (token: (Coll[Byte], Long)) =>
      token._1 == pftTokenId
    }
    val proof_funding_token_amount = if (pfts.size > 0) { pfts(0)._2 } else { 0L }
    val sold                       = contract.R6[Coll[Long]].get(0)
    val refunded                   = contract.R6[Coll[Long]].get(1)
    val exchanged                  = contract.R6[Coll[Long]].get(2)  // If the exchanged APT -> PFT amount is not accounted for, it will result in double-counting the sold amount.

    val calculation = proof_funding_token_amount - sold + refunded + exchanged
    if (calculation < 0L) 0L else calculation
  }

  def getBaseTokenAmount(box: Box): Long = {
    if (isERGBase) {
      box.value
    } else {
      val matchingTokens = box.tokens.filter { (token: (Coll[Byte], Long)) =>
        token._1 == baseTokenId
      }
      if (matchingTokens.size > 0) {
        matchingTokens(0)._2
      } else {
        0L
      }
    }
  }

  // ===== The project NFT never escapes ===== //
  // Exactly one output carries it, at its index 0 and with amount 1, and that output is either the
  // replica or the terminal box. Checked at the top level, so no action can drop it, split it,
  // burn it or hand it to a box of the spender's choosing.
  val nftHolders = OUTPUTS.filter({(box: Box) =>
    box.tokens.exists({(token: (Coll[Byte], Long)) => token._1 == selfId})
  })

  val nftWellPlaced = nftHolders.size == 1 &&
    nftHolders(0).tokens(0)._1 == selfId &&
    nftHolders(0).tokens(0)._2 == 1L

  val nftInReplica = isReplicationBoxPresent && nftWellPlaced &&
    OUTPUTS(0).tokens(0)._1 == selfId

  val nftRetired = nftWellPlaced && nftHolders(0).propositionBytes == terminalScript

  // Validation of the box replication process
  val isSelfReplication = {
    isReplicationBoxPresent && {
      // The project NFT must be the same, at index 0, and still a singleton
      val sameId = selfId == OUTPUTS(0).tokens(0)._1 && OUTPUTS(0).tokens(0)._2 == 1L

      // The APT must stay at index 1, so that every action can address it there
      val sameAPTId = selfAPTId == OUTPUTS(0).tokens(1)._1

      // The block limit must be the same
      val sameBlockLimit = selfBlockLimit == OUTPUTS(0).R4[(Boolean, Long)].get

      // The minimum amount of tokens sold must be the same
      val sameMinimumSold = selfMinimumTokensSold == OUTPUTS(0).R5[Long].get

      // The exchange rate and base token info must be same
      val sameExchangeRate = selfExchangeRate == OUTPUTS(0).R7[Long].get

      // The constants must be the same
      val sameConstants = selfConstants == OUTPUTS(0).R8[Coll[Coll[Byte]]].get

      // The project content must be the same
      val sameProjectContent = selfProjectMetadata == OUTPUTS(0).R9[Coll[Byte]].get

      // The script must be the same
      val sameScript = selfScript == OUTPUTS(0).propositionBytes

      // NFT and APT are always there; PFT and, on a token campaign, the base token may or may not be.
      val noAddsOtherTokens = if (isERGBase) {
        OUTPUTS(0).tokens.size == 2 || OUTPUTS(0).tokens.size == 3
      } else {
        OUTPUTS(0).tokens.size == 2 || OUTPUTS(0).tokens.size == 3 || OUTPUTS(0).tokens.size == 4
      }

      // Verify that the output box is a valid copy of the input box
      sameId && sameAPTId && sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript && noAddsOtherTokens
    }
  }

  val APTokenRemainsConstant = !isReplicationBoxPresent || (selfAPT == OUTPUTS(0).tokens(1)._2)
  val ProofFundingTokenRemainsConstant = {
    !isReplicationBoxPresent || {
      val selfAmount = {
        val pfts = SELF.tokens.filter { (token: (Coll[Byte], Long)) =>
          token._1 == pftTokenId
        }
        if (pfts.size > 0) { pfts(0)._2 } else { 0L }
      }

      val outAmount = {
        val pfts = OUTPUTS(0).tokens.filter { (token: (Coll[Byte], Long)) =>
          token._1 == pftTokenId
        }
        if (pfts.size > 0) { pfts(0)._2 } else { 0L }
      }

      selfAmount == outAmount
    }
  }
  val soldCounterRemainsConstant = !isReplicationBoxPresent || (selfSoldCounter == OUTPUTS(0).R6[Coll[Long]].get(0))
  val refundCounterRemainsConstant = !isReplicationBoxPresent || (selfRefundCounter == OUTPUTS(0).R6[Coll[Long]].get(1))
  val auxiliarExchangeCounterRemainsConstant = !isReplicationBoxPresent || (selfAuxiliarExchangeCounter == OUTPUTS(0).R6[Coll[Long]].get(2))
  val mantainValue = !isReplicationBoxPresent || ({
    selfValue == OUTPUTS(0).value &&
    {
      if (isERGBase) { true }
      else {
        val selfBaseAmount = getBaseTokenAmount(SELF)
        val outBaseAmount = getBaseTokenAmount(OUTPUTS(0))
        selfBaseAmount == outBaseAmount
      }
    }
  })

  // Project owner address as ErgoTree bytes (can be P2PK or P2S)
  val P2PK_ERGOTREE_PREFIX = fromBase16("0008cd")

  // Check if project address is P2PK or P2S by examining the prefix
  val isProjectP2PK: Boolean = if (ownerErgoTree.size >= 3) {
    ownerErgoTree.slice(0, 3) == P2PK_ERGOTREE_PREFIX
  } else {
    false
  }

  // Create SigmaProp for project address

  val ownerAuthentication: SigmaProp = {

    val projectAddr: SigmaProp = if (isProjectP2PK) {
      // For P2PK: Extract the public key and create SigmaProp with proveDlog
      val pkContent = ownerErgoTree.slice(3, ownerErgoTree.size)
      proveDlog(decodePoint(pkContent))
    } else {
      // For P2S: We check proposition bytes directly on INPUTS
      sigmaProp(false)
    }

    val signedByInput: SigmaProp = sigmaProp(INPUTS.exists({(box: Box) => box.propositionBytes == ownerErgoTree}))

    signedByInput || projectAddr
  }

  // Amount of PFT tokens added to the contract. In case of negative value, means that the token have been extracted.
  val deltaPFTokenAdded: Long = {
    val selfTokens = {
      val pfts = SELF.tokens.filter { (token: (Coll[Byte], Long)) =>
        token._1 == pftTokenId
      }
      if (pfts.size > 0) { pfts(0)._2 } else { 0L }
    }

    val outTokens = if (isReplicationBoxPresent) {
      val pfts = OUTPUTS(0).tokens.filter { (token: (Coll[Byte], Long)) =>
        token._1 == pftTokenId
      }
      if (pfts.size > 0) { pfts(0)._2 } else { 0L }
    } else {
      0L // There is no self replicant box, so all the current PFT tokens are extracted.
    }

    // Return the difference between output tokens and self tokens
    outTokens - selfTokens
  }

  val minimumReached: Boolean = {
    val minimumSalesThreshold = selfMinimumTokensSold
    val netSoldCounter = selfSoldCounter - selfRefundCounter  // Net sold counter (sold - refunded)

    netSoldCounter >= minimumSalesThreshold
  }


  //  ACTIONS

  // Validation for purchasing Tokens
  // > People should be allowed to exchange base tokens for APT tokens until there are no more tokens left (even if the deadline has passed).
  val isBuyTokens: SigmaProp = if (isSelfReplication) {

    // Delta of tokens removed from the box
    val deltaTokenRemoved = {
      val outputAlreadyTokens = OUTPUTS(0).tokens(1)._2

      selfAPT - outputAlreadyTokens
    }

    val onlyTemporaryUnsoldTokens = deltaTokenRemoved <= temporaryFundingTokenAmountOnContract(SELF)

    // Verify if the base token amount matches the required exchange rate for the given token quantity
    val correctExchange = {
      val deltaBaseTokenAdded = getBaseTokenAmount(OUTPUTS(0)) - getBaseTokenAmount(SELF)
      deltaBaseTokenAdded == deltaTokenRemoved * selfExchangeRate
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
      // mantainValue,                            // Needs to add value to the contract (for ERG) or maintain value (for tokens)
      // APTokenRemainsConstant,                  // APT token is extracted from the contract.
      ProofFundingTokenRemainsConstant           // PFT needs to be constant
    ))

    sigmaProp(allOf(Coll(
      constants,
      onlyTemporaryUnsoldTokens,     // Since the amount of APT is equal to the emission amount of PFT (+1), not necessarily equal to the contract amount, it must be ensured that the APT sold can be exchanged in the future.
      correctExchange,               // Ensures that the proportion between the APTs and base token moved is the same following the R7 ratio.
      incrementSoldCounterCorrectly  // Ensures that the R6 first value is incremented in proportion to the exchange value moved.
    )))
  } else { sigmaProp(false) }

  // Validation for refunding tokens
  val isRefundTokens: SigmaProp = if (isSelfReplication) {

    // > People should be allowed to exchange tokens for base tokens if and only if the deadline has passed and the minimum number of tokens has not been sold.
    val canBeRefund = {
      // The minimum number of tokens has not been sold.
      val minimumNotReached = !minimumReached

      // Condition to check if the current height is beyond the block limit
      val afterBlockLimit = {

        val limit = selfBlockLimit._2

        val now = if (selfBlockLimit._1) {
          // If the first element is true, the limit is a timestamp
          CONTEXT.preHeader.timestamp
        } else {
          // If the first element is false, the limit is a block height
          HEIGHT.toLong
        }

        now > limit
      }

      afterBlockLimit && minimumNotReached
    }

    // Calculate the amount of tokens that the user adds to the contract.
    val deltaTokenAdded = {
      val outputAlreadyTokens = OUTPUTS(0).tokens(1)._2

      outputAlreadyTokens - selfAPT
    }

    // Verify if the base token amount matches the required exchange rate for the returned token quantity
    val correctExchange = {
      val deltaBaseTokenReturned = getBaseTokenAmount(SELF) - getBaseTokenAmount(OUTPUTS(0))
      val addedTokensValue = deltaTokenAdded * selfExchangeRate
      deltaBaseTokenReturned == addedTokensValue
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
      // mantainValue,                            // Needs to extract value (for ERG) or maintain value (for tokens)
      // APTokenRemainsConstant,                  // Needs to add Auxiliar tokens.
      ProofFundingTokenRemainsConstant            // PFT needs to be constant.
    ))

    // The contract returns the equivalent base token value for the returned tokens
    sigmaProp(allOf(Coll(
      constants,
      canBeRefund,                            // Ensures that the refund conditions are satisfied.
      incrementRefundCounterCorrectly,        // Ensures increment the refund counter correctly in proportion with the exchanged amount.
      correctExchange                         // Ensures that the value extracted and the APTs added are proportional following the R7 exchange ratio.
    )))
  } else { sigmaProp(false) }

  // Validation for withdrawing funds by project owners
  val isWithdrawFunds: SigmaProp = {
    // Anyone can withdraw the funds to the project address.
    // This is the only action that may end the campaign, and it may only do so by paying the owner
    // and the dev fee what the split requires and retiring the NFT (#177).

    // Calculate extracted amounts based on base token
    val extractedBaseAmount: Long = if (isERGBase) {
      // For ERG base token, extract ERG value
      if (isReplicationBoxPresent) { selfValue - OUTPUTS(0).value } else { selfValue }
    } else {
      // For non-ERG base tokens, extract the token amount
      val selfBaseTokens = getBaseTokenAmount(SELF)
      val outputBaseTokens = if (isReplicationBoxPresent) getBaseTokenAmount(OUTPUTS(0)) else 0L
      selfBaseTokens - outputBaseTokens
    }

    // Calculate dev fee and project amounts.
    // Rounded up, and required to be positive below: v2 truncated, so on a token campaign any
    // extraction of 19 units or fewer produced a fee of 0 and the fee could be avoided entirely by
    // withdrawing in small enough slices (#177).
    val devFeeAmount = (extractedBaseAmount * devFee + 99) / 100
    val projectAmount = extractedBaseAmount - devFeeAmount

    val feeIsPaid = extractedBaseAmount <= 0 || devFeeAmount > 0

    val ownerOutputs = OUTPUTS.filter({(box: Box) => box.propositionBytes == ownerErgoTree})
    val devFeeOutputs = OUTPUTS.filter({(box: Box) => blake2b256(box.propositionBytes) == devFeeContractBytesHash})

    if (ownerOutputs.size > 0 && devFeeOutputs.size > 0) {
      val ownerOutput = ownerOutputs(0)
      val devFeeOutput = devFeeOutputs(0)

      // Verify correct project amount
      val correctProjectAmount = if (isERGBase) {
        ownerOutput.value == projectAmount
      }
      else {
        // For non-ERG tokens, verify the project receives correct token amount
        val projectTokens = ownerOutput.tokens.filter { (token: (Coll[Byte], Long)) =>
          token._1 == baseTokenId
        }
        val projectTokenAmount = if (projectTokens.size > 0) projectTokens(0)._2 else 0L
        projectTokenAmount == projectAmount
      }

      // Verify correct dev fee
      val correctDevFee = {

        if (isERGBase) {
          devFeeOutput.value == devFeeAmount
        }

        else {
          // For non-ERG tokens, verify dev receives correct token amount
          val devTokens = devFeeOutput.tokens.filter { (token: (Coll[Byte], Long)) =>
            token._1 == baseTokenId
          }
          val devTokenAmount = if (devTokens.size > 0) devTokens(0)._2 else 0L
          devTokenAmount == devFeeAmount
        }
      }

      val endOrReplicate = {
        val allFundsWithdrawn = if (isERGBase) extractedBaseAmount == selfValue else (extractedBaseAmount == getBaseTokenAmount(SELF))
        val allTokensWithdrawn = SELF.tokens.exists({(pair: (Coll[Byte], Long)) => pair._1 == pftTokenId}) == false

        // noExtraReplicas already makes "no box at OUTPUTS(0)" mean "no copy anywhere", so ended is
        // redundant. It is kept as defence in depth, and because it is the check that makes the
        // intent readable on its own.
        val ended = replicas.size == 0

        isSelfReplication || (ended && allFundsWithdrawn && allTokensWithdrawn && nftRetired)
      }

      val constants = allOf(Coll(
        // isSelfReplication,
        endOrReplicate,                             // Replicate the contract in case of partial withdraw
        soldCounterRemainsConstant,                 // Any of the counter needs to be incremented, so all of them (sold, refund and exchange) need to remain constants.
        refundCounterRemainsConstant,
        auxiliarExchangeCounterRemainsConstant,
        // mantainValue,                           // Needs to extract value from the contract
        APTokenRemainsConstant,                    // There is no need to modify the auxiliar token, so it must be constant
        ProofFundingTokenRemainsConstant           // There is no need to modify the proof of funding token, so it must be constant
      ))

      sigmaProp(allOf(Coll(
        constants,
        minimumReached,           // Project owners are allowed to withdraw base tokens if and only if the minimum number of tokens has been sold.
        feeIsPaid,                // Ensures the fee cannot be rounded away to nothing.
        correctDevFee,            // Ensures that the dev fee amount and dev address are correct
        correctProjectAmount      // Ensures the correct project amount.
      )))
    }
    else { sigmaProp(false) }
  }

  // > Project owners may withdraw unsold tokens from the contract at any time.
  val isWithdrawUnsoldTokens: SigmaProp = {
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
      isSelfReplication,                            // Restored from v1.2.0. Letting this action terminate left mantainValue
                                                    // vacuous, so the owner could walk off with the whole balance without
                                                    // paying the dev fee (#177). Termination belongs to isWithdrawFunds.
      soldCounterRemainsConstant,                   // Any of the counter needs to be incremented, so all of them (sold, refund and exchange) need to remain constants.
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      mantainValue,                                 // The value of the contract must not change.
      APTokenRemainsConstant                        // APT token must be constant.
      // ProofFundingTokenRemainsConstant           // The PFT is the token that the action tries to withdraw
    ))

    sigmaProp(allOf(Coll(
      constants,
      deltaPFTokenAdded < 0,  // A negative value means that PFT are extracted.
      onlyUnsold  // Ensures that only extracts the token amount that has not been buyed.
    ))) && ownerAuthentication  // Ensures that only extracts unsold PFTs the owner.   Not necesaryly to it's own address.
  }

  // > Project owners may add more tokens to the contract at any time.
  val isAddTokens: SigmaProp = if (isReplicationBoxPresent) {

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

    sigmaProp(allOf(Coll(
      constants,
      deltaPFTokenAdded > 0   // Ensures that the tokens are added.
    )) ) && ownerAuthentication
  } else { sigmaProp(false) }

  // Exchange APT (token that identies the project used as temporary funding token) with PFT (proof-of-funding token)
  val isExchangeFundingTokens: SigmaProp = if (isReplicationBoxPresent) {

    val deltaTemporaryFundingTokenAdded = {
      val selfTFT = SELF.tokens(1)._2
      val outTFT = OUTPUTS(0).tokens(1)._2

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

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,                           // Sold counter must be constant
      refundCounterRemainsConstant,                         // Refund counter must be constant
      // auxiliarExchangeCounterRemainsConstant,            // Auxiliar tokens are added to the contract to be exchanged with PFT
      mantainValue                                          // ERG value must be constant
      // APTokenRemainsConstant,                            // APT will change
      // ProofFundingTokenRemainsConstant,                  // PFT will change
    ))

    sigmaProp(allOf(Coll(
      constants,
      minimumReached,                        // Only can exchange when the refund action is not, and will not be, possible
      incrementExchangeCounterCorrectly,     // Ensures that the exchange counter is incremented in proportion to the APT added and the PFT extracted.
      correctExchange                        // Ensures that the APT added and the PFT extracted amounts are equal.
    )))
  } else { sigmaProp(false) }

  // Two invariants hold for every action, which is the point: in v2 each action decided for itself
  // whether to look, and the one that forgot is what #174 walked through.
  //   noExtraReplicas - at most one box with this script leaves the transaction
  //   nftInReplica || nftRetired - the identity is in that box, or retired into an unspendable one
  sigmaProp(noExtraReplicas && (nftInReplica || nftRetired)) && (
    isBuyTokens ||
    isRefundTokens ||
    isWithdrawFunds ||
    isWithdrawUnsoldTokens ||
    isAddTokens ||
    isExchangeFundingTokens
  )
}
