// ===== Bene Fundraising Platform Contract (Multi-Token Support) - v2.1 (fixed) =====
// Name: Bene Fundraising Platform Contract (Multi-Token Support)
// Version: 1.2.1 -> 2.1 (fixed syntactic and accounting issues)
// Author: The Stable Order (adapted for your tests)

// ---------- Helper functions ----------
import scala.collection._

// Convert Coll[Byte] numeric bytes to Long (big-int conversion)
def byteArrayToBigInt(arr: Coll[Byte]): Long = {
  var res: Long = 0L
  var i = 0
  while (i < arr.length) {
    res = (res << 8) + (arr(i).toLong & 0xffL)
    i = i + 1
  }
  res
}

// Safe get token amount by token id
def getTokenAmount(box: Box, tokenId: Coll[Byte]): Long = {
  val matches = box.tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == tokenId })
  if (matches.size > 0) matches(0)._2 else 0L
}

// Safe read register R4 with default when not present
def safeR4(box: Box): ((Boolean, Coll[Byte]), Long) = {
  if (box.R4[Option[((Boolean, Coll[Byte]), Long)]].isDefined) {
    box.R4[((Boolean, Coll[Byte]), Long)].get
  } else {
    ((false, Colls.emptyByteArray), 0L)
  }
}

// Utility: current PFT amount in a box
def currentPFTAmount(box: Box, pftTokenId: Coll[Byte]): Long = {
  val pfts = box.tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == pftTokenId })
  if (pfts.size > 0) pfts(0)._2 else 0L
}
// ---------- READ CONSTANTS FROM SELF ----------
val r8 = SELF.R8[Coll[Coll[Byte]]].get

val ownerPropositionBytes = r8(0)               // owner ergoTree bytes
val devFeeContractBytesHash = r8(1)             // blake2b256 hash (as bytes) of dev fee contract proposition bytes
val devFee = byteArrayToBigInt(r8(2))           // percentage (e.g., 5)
val pftTokenId = r8(3)                          // PFT token id (Coll[Byte])
val baseTokenId = if (r8.size > 4) r8(4) else Colls.emptyByteArray

val selfId = SELF.tokens(0)._1                   // APT token id (nft)
val selfAPT = SELF.tokens(0)._2                  // APT token amount (should be emission + 1)
val selfValue = SELF.value
val selfBlockLimit = safeR4(SELF)
val r4Inner = selfBlockLimit._1
val tokenIdR4 = r4Inner._2
val deadline = selfBlockLimit._2
val selfMinimumTokensSold = SELF.R5[Long].get
val selfSoldCounter = SELF.R6[Coll[Long]].get(0)
val selfRefundCounter = SELF.R6[Coll[Long]].get(1)
val selfAuxiliarExchangeCounter = SELF.R6[Coll[Long]].get(2)
val selfExchangeRate = SELF.R7[Long].get
val selfConstants = SELF.R8[Coll[Coll[Byte]]].get
val selfProjectMetadata = SELF.R9[Coll[Byte]].get
val selfScript = SELF.propositionBytes

val isReplicationBoxPresent = OUTPUTS.size > 0 && OUTPUTS(0).propositionBytes == selfScript
val isERGBase = baseTokenId.size == 0

// ---------- Utility: temporary funding token amount on contract ----------
def temporaryFundingTokenAmountOnContract(contract: Box): Long = {
  val proofFundingTokenAmount = currentPFTAmount(contract, pftTokenId)

  val counters = contract.R6[Coll[Long]].get
  val sold = counters(0)
  val refunded = counters(1)
  val exchanged = counters(2)

  val calc = proofFundingTokenAmount - sold + refunded + exchanged
  if (calc < 0L) 0L else calc
}

// ---------- Get base token amount in a box (ERG or token) ----------
def getBaseTokenAmount(box: Box): Long = {
  if (isERGBase) {
    box.value
  } else {
    getTokenAmount(box, baseTokenId)
  }
}

// ---------- Owner authentication ----------
val P2PK_ERGOTREE_PREFIX = fromBase16("0008cd")

val ownerAuthentication: SigmaProp = {
  val ownerErgoTree = ownerPropositionBytes
  val isProjectP2PK: Boolean = if (ownerErgoTree.size >= 3) {
    ownerErgoTree.slice(0, 3) == P2PK_ERGOTREE_PREFIX
  } else {
    false
  }

  val projectAddr: SigmaProp = if (isProjectP2PK) {
    val pkContent = ownerPropositionBytes.slice(3, ownerPropositionBytes.size)
    proveDlog(decodePoint(pkContent))
  } else {
    sigmaProp(false)
  }

  val signedByInput: SigmaProp = sigmaProp(INPUTS.exists({ (b: Box) => b.propositionBytes == ownerPropositionBytes }))

  projectAddr || signedByInput
}

// ---------- Replication validation ----------
val isSelfReplication: Boolean = {
  if (!isReplicationBoxPresent) {
    false
  } else {
    val outBox = OUTPUTS(0)

    val sameId = selfId == outBox.tokens(0)._1
    val sameBlockLimit = selfBlockLimit == safeR4(outBox)
    val sameMinimumSold = selfMinimumTokensSold == outBox.R5[Long].get
    val sameExchangeRate = selfExchangeRate == outBox.R7[Long].get
    val sameConstants = selfConstants == outBox.R8[Coll[Coll[Byte]]].get
    val sameProjectContent = selfProjectMetadata == outBox.R9[Coll[Byte]].get
    val sameScript = selfScript == outBox.propositionBytes

    val noAddsOtherTokens = if (isERGBase) {
      (outBox.tokens.size == 1) || (outBox.tokens.size == 2)
    } else {
      (outBox.tokens.size == 1) || (outBox.tokens.size == 2) || (outBox.tokens.size == 3)
    }

    sameId && sameBlockLimit && sameMinimumSold && sameExchangeRate && sameConstants && sameProjectContent && sameScript && noAddsOtherTokens
  }
}

val APTokenRemainsConstant = !isReplicationBoxPresent || (selfAPT == OUTPUTS(0).tokens(0)._2)

def currentPFTAmount(box: Box): Long = {
  val pfts = box.tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == pftTokenId })
  if (pfts.size > 0) pfts(0)._2 else 0L
}

val ProofFundingTokenRemainsConstant: Boolean = {
  if (!isReplicationBoxPresent) true
  else {
    currentPFTAmount(SELF) == currentPFTAmount(OUTPUTS(0))
  }
}

val soldCounterRemainsConstant = !isReplicationBoxPresent || (selfSoldCounter == OUTPUTS(0).R6[Coll[Long]].get(0))
val refundCounterRemainsConstant = !isReplicationBoxPresent || (selfRefundCounter == OUTPUTS(0).R6[Coll[Long]].get(1))
val auxiliarExchangeCounterRemainsConstant = !isReplicationBoxPresent || (selfAuxiliarExchangeCounter == OUTPUTS(0).R6[Coll[Long]].get(2))

val mantainValue = !isReplicationBoxPresent || {
  val sameValue = selfValue == OUTPUTS(0).value
  if (isERGBase) {
    sameValue
  } else {
    val selfBaseAmount = getBaseTokenAmount(SELF)
    val outBaseAmount = getBaseTokenAmount(OUTPUTS(0))
    sameValue && (selfBaseAmount == outBaseAmount)
  }
}

// ---------- deltaPFTokenAdded: PFT tokens added/removed ----------
val deltaPFTokenAdded: Long = {
  val selfAmount = currentPFTAmount(SELF)
  val outAmount = if (isReplicationBoxPresent) currentPFTAmount(OUTPUTS(0)) else 0L
  outAmount - selfAmount
}

// Helper: Calculate unexchanged APTs (sold but not yet exchanged for PFTs)
val unexchangedAPTs: Long = {
  val netSold = selfSoldCounter - selfRefundCounter
  val unexchanged = netSold - selfAuxiliarExchangeCounter
  if (unexchanged < 0L) 0L else unexchanged
}

// ---------- Minimum reached boolean ----------
val minimumReached: Boolean = {
  val minimumSalesThreshold = selfMinimumTokensSold
  val netSoldCounter = selfSoldCounter - selfRefundCounter
  netSoldCounter >= minimumSalesThreshold
}
// ---------- ACTIONS ----------

// ---- BUY TOKENS (exchange base -> APT)
val isBuyTokens: SigmaProp = {
  if (!isSelfReplication) sigmaProp(false)
  else {
    val deltaTokenRemoved = {
      val outAPT = OUTPUTS(0).tokens(0)._2
      selfAPT - outAPT
    }

    val onlyTemporaryUnsoldTokens = deltaTokenRemoved <= temporaryFundingTokenAmountOnContract(SELF)

    val deltaBaseTokenAdded = getBaseTokenAmount(OUTPUTS(0)) - getBaseTokenAmount(SELF)
    val correctExchange = deltaBaseTokenAdded == (deltaTokenRemoved * selfExchangeRate)

    val counterIncrement = {
      val outputSold = OUTPUTS(0).R6[Coll[Long]].get(0)
      outputSold - selfSoldCounter
    }
    val incrementSoldCounterCorrectly = allOf(Coll(
      deltaTokenRemoved == counterIncrement,
      counterIncrement > 0L
    ))

    val constants = allOf(Coll(
      isSelfReplication,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      ProofFundingTokenRemainsConstant
    ))

    sigmaProp(allOf(Coll(
      constants,
      onlyTemporaryUnsoldTokens,
      correctExchange,
      incrementSoldCounterCorrectly
    )))
  }
}

// ---- REFUND TOKENS (APT -> base) after deadline if minimum not reached
val isRefundTokens: SigmaProp = {
  if (!isSelfReplication) sigmaProp(false)
  else {
    val minimumNotReached = !minimumReached

    val afterBlockLimit = {
      val limit = selfBlockLimit._2
      val now = HEIGHT.toLong
      now > limit
    }

    val canBeRefund = afterBlockLimit && minimumNotReached

    val deltaTokenAdded = {
      val outAPT = OUTPUTS(0).tokens(0)._2
      outAPT - selfAPT
    }

    val deltaBaseTokenReturned = getBaseTokenAmount(SELF) - getBaseTokenAmount(OUTPUTS(0))
    val addedTokensValue = deltaTokenAdded * selfExchangeRate
    val correctExchange = deltaBaseTokenReturned == addedTokensValue

    val counterIncrement = {
      val outputRefunded = OUTPUTS(0).R6[Coll[Long]].get(1)
      outputRefunded - selfRefundCounter
    }

    val incrementRefundCounterCorrectly = allOf(Coll(
      deltaTokenAdded == counterIncrement,
      counterIncrement > 0L
    ))

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      ProofFundingTokenRemainsConstant
    ))

    sigmaProp(allOf(Coll(
      constants,
      canBeRefund,
      incrementRefundCounterCorrectly,
      correctExchange
    )))
  }
}

// ---- WITHDRAW FUNDS (project owner withdraws base token funds after minimum reached)
val isWithdrawFunds: SigmaProp = {
  val extractedBaseAmount: Long = if (isERGBase) {
    if (isReplicationBoxPresent) selfValue - OUTPUTS(0).value else selfValue
  } else {
    val selfBase = getBaseTokenAmount(SELF)
    val outBase = if (isReplicationBoxPresent) getBaseTokenAmount(OUTPUTS(0)) else 0L
    selfBase - outBase
  }

  val devFeeAmount = extractedBaseAmount * devFee / 100L
  val projectAmount = extractedBaseAmount - devFeeAmount

  val ownerOutputs = OUTPUTS.filter({ (box: Box) => box.propositionBytes == ownerPropositionBytes })
  val devFeeOutputs = OUTPUTS.filter({ (box: Box) => blake2b256(box.propositionBytes) == devFeeContractBytesHash })

  if (ownerOutputs.size > 0 && devFeeOutputs.size > 0) {
    val ownerOutput = ownerOutputs(0)
    val devOutput = devFeeOutputs(0)

    val correctProjectAmount = if (isERGBase) {
      ownerOutput.value == projectAmount
    } else {
      val projectTokens = ownerOutput.tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == baseTokenId })
      val projectTokenAmount = if (projectTokens.size > 0) projectTokens(0)._2 else 0L
      projectTokenAmount == projectAmount
    }

    val correctDevFee = if (isERGBase) {
      devOutput.value == devFeeAmount
    } else {
      val devTokens = devOutput.tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == baseTokenId })
      val devTokenAmount = if (devTokens.size > 0) devTokens(0)._2 else 0L
      devTokenAmount == devFeeAmount
    }

    val allFundsWithdrawn = if (isERGBase) extractedBaseAmount == selfValue else (extractedBaseAmount == getBaseTokenAmount(SELF))
    val allTokensWithdrawn = !SELF.tokens.exists({ (pair: (Coll[Byte], Long)) => pair._1 == pftTokenId })

    val endOrReplicate = isSelfReplication || (allFundsWithdrawn && allTokensWithdrawn)

    val constants = allOf(Coll(
      endOrReplicate,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      APTokenRemainsConstant,
      ProofFundingTokenRemainsConstant
    ))

    sigmaProp(allOf(Coll(
      constants,
      minimumReached,
      correctDevFee,
      correctProjectAmount
    )))
  } else {
    sigmaProp(false)
  }
}

// ---- WITHDRAW UNSOLD TOKENS (owner withdraws PFT unsold). FIXED LOGIC to prevent APT avoidance.
val isWithdrawUnsoldTokens: SigmaProp = {
  val extractedPFT = -deltaPFTokenAdded
  val temporalTokens = temporaryFundingTokenAmountOnContract(SELF)

  // Strict check: can only withdraw unsold PFTs, ensuring unexchanged APTs can still be exchanged
  // Basic rule: extractedPFT <= temporalTokens
  // Additional: must leave enough PFTs for unexchanged APTs
  // When ending contract, all APTs must be exchanged first (unexchangedAPTs == 0)
  val remainingAfterWithdrawal = temporalTokens - extractedPFT
  val remainingPFTInOutput = if (isReplicationBoxPresent) currentPFTAmount(OUTPUTS(0)) else 0L
  val canWithdrawUnsold = if (!isReplicationBoxPresent) {
    // Ending: all APTs must be exchanged, can withdraw all temporalTokens
    (unexchangedAPTs == 0L) && (extractedPFT <= temporalTokens)
  } else {
    // Replicating: check if withdrawal leaves enough for unexchanged APTs
    if (unexchangedAPTs == 0L) {
      // No unexchanged APTs: can withdraw up to temporalTokens
      extractedPFT <= temporalTokens
    } else {
      // Unexchanged APTs exist: must leave strictly MORE PFTs than unexchanged
      // Check both calculation and actual OUTPUT box to ensure constraint
      val calcOk = (extractedPFT <= temporalTokens) && (remainingAfterWithdrawal > unexchangedAPTs)
      val outputOk = remainingPFTInOutput > unexchangedAPTs
      calcOk && outputOk
    }
  }
  val onlyUnsold = (extractedPFT > 0L) && canWithdrawUnsold

  val ended = OUTPUTS.forall({ (b: Box) => b.propositionBytes != SELF.propositionBytes })
  val endOrReplicate = if (isReplicationBoxPresent) isSelfReplication else ended

  // For non-replication withdraw-unsold, APTokenRemainsConstant should NOT be required
  // mantainValue should NOT block when ending (no replication)
  val constantsWhenReplicating = allOf(Coll(
    isSelfReplication,
    soldCounterRemainsConstant,
    refundCounterRemainsConstant,
    auxiliarExchangeCounterRemainsConstant,
    mantainValue,
    APTokenRemainsConstant
  ))
  val constantsWhenEnding = allOf(Coll(
    ended,
    soldCounterRemainsConstant,
    refundCounterRemainsConstant,
    auxiliarExchangeCounterRemainsConstant
  ))
  val constants = if (isReplicationBoxPresent) constantsWhenReplicating else constantsWhenEnding

  sigmaProp(allOf(Coll(
    constants,
    deltaPFTokenAdded < 0L,
    onlyUnsold
  ))) && ownerAuthentication
}

// ---- ADD TOKENS (owner adds more PFT to contract)
val isAddTokens: SigmaProp = {
  if (!isReplicationBoxPresent) sigmaProp(false)
  else {
    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      auxiliarExchangeCounterRemainsConstant,
      mantainValue,
      APTokenRemainsConstant
    ))

    sigmaProp(allOf(Coll(
      constants,
      deltaPFTokenAdded > 0L
    ))) && ownerAuthentication
  }
}

// ---- EXCHANGE APT -> PFT (owner/team or some actor exchanges APT held in contract for PFT)
val isExchangeFundingTokens: SigmaProp = {
  if (!isReplicationBoxPresent) sigmaProp(false)
  else {
    val deltaTemporaryFundingTokenAdded = {
      val outTFT = OUTPUTS(0).tokens(0)._2
      outTFT - selfAPT
    }

    val deltaProofFundingTokenExtracted = -deltaPFTokenAdded

    val correctExchange = allOf(Coll(
      deltaTemporaryFundingTokenAdded == deltaProofFundingTokenExtracted,
      deltaTemporaryFundingTokenAdded > 0L
    ))

    val counterIncrement = {
      val outputAux = OUTPUTS(0).R6[Coll[Long]].get(2)
      outputAux - selfAuxiliarExchangeCounter
    }

    val incrementExchangeCounterCorrectly = (deltaTemporaryFundingTokenAdded == counterIncrement)

    val allFundsWithdrawn = selfValue == OUTPUTS(0).value
    val allTokensWithdrawn = SELF.tokens.size == 1

    val endOrReplicate = isSelfReplication || (allFundsWithdrawn && allTokensWithdrawn)

    val constants = allOf(Coll(
      isSelfReplication,
      soldCounterRemainsConstant,
      refundCounterRemainsConstant,
      mantainValue
    ))

    sigmaProp(allOf(Coll(
      constants,
      minimumReached,
      incrementExchangeCounterCorrectly,
      correctExchange
    )))
  }
}
// ---------- FINAL COMBINED VALIDATION ----------
(isBuyTokens ||
 isRefundTokens ||
 isWithdrawFunds ||
 isWithdrawUnsoldTokens ||
 isAddTokens ||
 isExchangeFundingTokens)
