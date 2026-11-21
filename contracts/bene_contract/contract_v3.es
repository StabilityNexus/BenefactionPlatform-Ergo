{
    val r8 = SELF.R8[Coll[Coll[Byte]]].get
    val ownerErgotree           = r8(0)
    val devFeeContractBytesHash = r8(1)
    val devFee                  = byteArrayToBigInt(r8(2))
    val pftTokenId              = r8(3)
    val baseTokenId             = if (r8.size > 4) r8(4) else Coll[Byte]()
    val aptTokenId              = if (r8.size > 5) r8(5) else Coll[Byte]()

    val selfId                  = SELF.tokens(0)._1
    val selfValue               = SELF.value
    val selfBlockLimit          = SELF.R4[(Boolean, Long)].get
    val selfMinimumTokensSold   = SELF.R5[Long].get
    val selfSoldCounter         = SELF.R6[Coll[Long]].get(0)
    val selfRefundCounter       = SELF.R6[Coll[Long]].get(1)
    val selfAuxiliarExchangeCounter = SELF.R6[Coll[Long]].get(2)
    val selfExchangeRate        = SELF.R7[Long].get
    val selfConstants           = SELF.R8[Coll[Coll[Byte]]].get
    val selfProjectMetadata     = SELF.R9[Coll[Byte]].get
    val selfScript              = SELF.propositionBytes

    val terminalScript = fromBase16("1906010100d17300")

    val replicas = OUTPUTS.filter({ (box: Box) => box.propositionBytes == selfScript })
    val noExtraReplicas = replicas.size <= 1
    val isReplicationBoxPresent = replicas.size == 1 && OUTPUTS.size > 0 && OUTPUTS(0).propositionBytes == selfScript

    val nftHolders = OUTPUTS.filter({ (box: Box) =>
        box.tokens.exists({ (token: (Coll[Byte], Long)) => token._1 == selfId })
    })
    val nftWellPlaced = nftHolders.size == 1 &&
                        nftHolders(0).tokens(0)._1 == selfId &&
                        nftHolders(0).tokens(0)._2 == 1L &&
                        nftHolders(0).tokens.filter({ (t: (Coll[Byte], Long)) => t._1 == selfId }).size == 1
    val nftInReplica = isReplicationBoxPresent && nftWellPlaced && OUTPUTS(0).tokens(0)._1 == selfId
    val nftRetired   = (replicas.size == 0) && nftWellPlaced && nftHolders(0).propositionBytes == terminalScript

    val isERGBase = baseTokenId.size == 0

    def getAPTTokenAmount(box: Box): Long = {
        val apts = box.tokens.filter { (token: (Coll[Byte], Long)) =>
            token._1 == aptTokenId
        }
        if (apts.size > 0) { apts(0)._2 } else { 0L }
    }

    val selfAPT = getAPTTokenAmount(SELF)

    def temporaryFundingTokenAmountOnContract(contract: Box): Long = {
        val pfts = contract.tokens.filter { (token: (Coll[Byte], Long)) =>
            token._1 == pftTokenId
        }
        val proof_funding_token_amount = if (pfts.size > 0) { pfts(0)._2 } else { 0L }
        val sold      = contract.R6[Coll[Long]].get(0)
        val refunded  = contract.R6[Coll[Long]].get(1)
        val exchanged = contract.R6[Coll[Long]].get(2)

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

    val isSelfReplication = {
        if (isReplicationBoxPresent) {
            val outBox = OUTPUTS(0)
            val validNftPosition = outBox.tokens.size >= 1 &&
                                   outBox.tokens(0)._1 == selfId &&
                                   outBox.tokens(0)._2 == 1L

            val sameBlockLimit     = selfBlockLimit == outBox.R4[(Boolean, Long)].get
            val sameMinimumSold    = selfMinimumTokensSold == outBox.R5[Long].get
            val validR6Length      = outBox.R6[Coll[Long]].get.size == 3
            val sameExchangeRate   = selfExchangeRate == outBox.R7[Long].get
            val sameConstants      = selfConstants == outBox.R8[Coll[Coll[Byte]]].get
            val sameProjectContent = selfProjectMetadata == outBox.R9[Coll[Byte]].get
            val sameScript         = selfScript == outBox.propositionBytes

            val tailTokens = outBox.tokens.slice(1, outBox.tokens.size)
            val aptEntries = tailTokens.filter({ (t: (Coll[Byte], Long)) => t._1 == aptTokenId })
            val atMostOneApt = aptEntries.size <= 1
            val atMostOnePft = tailTokens.filter({ (t: (Coll[Byte], Long)) => t._1 == pftTokenId }).size <= 1
            val aptFirstIfPresent = if (aptEntries.size == 0) {
                true
            } else {
                tailTokens(0)._1 == aptTokenId
            }

            val noAddsOtherTokens = if (isERGBase) {
                val onlyAllowed = tailTokens.forall({ (t: (Coll[Byte], Long)) =>
                    t._1 == aptTokenId || t._1 == pftTokenId
                })
                outBox.tokens.size <= 3 && onlyAllowed && atMostOneApt && atMostOnePft && aptFirstIfPresent
            } else {
                val onlyAllowed = tailTokens.forall({ (t: (Coll[Byte], Long)) =>
                    t._1 == aptTokenId || t._1 == pftTokenId || t._1 == baseTokenId
                })
                val atMostOneBase = tailTokens.filter({ (t: (Coll[Byte], Long)) => t._1 == baseTokenId }).size <= 1
                outBox.tokens.size <= 4 && onlyAllowed && atMostOneApt && atMostOnePft && atMostOneBase && aptFirstIfPresent
            }

            validNftPosition && sameBlockLimit && sameMinimumSold && validR6Length &&
            sameExchangeRate && sameConstants && sameProjectContent && sameScript && noAddsOtherTokens
        } else {
            false
        }
    }

    val APTokenRemainsConstant = if (isReplicationBoxPresent) (selfAPT == getAPTTokenAmount(OUTPUTS(0))) else true
    val ProofFundingTokenRemainsConstant = if (isReplicationBoxPresent) {
        val selfPfts = SELF.tokens.filter { (token: (Coll[Byte], Long)) => token._1 == pftTokenId }
        val selfAmount = if (selfPfts.size > 0) { selfPfts(0)._2 } else { 0L }
        val outPfts = OUTPUTS(0).tokens.filter { (token: (Coll[Byte], Long)) => token._1 == pftTokenId }
        val outAmount = if (outPfts.size > 0) { outPfts(0)._2 } else { 0L }
        selfAmount == outAmount
    } else {
        true
    }
    val soldCounterRemainsConstant             = if (isReplicationBoxPresent) (selfSoldCounter == OUTPUTS(0).R6[Coll[Long]].get(0)) else true
    val refundCounterRemainsConstant           = if (isReplicationBoxPresent) (selfRefundCounter == OUTPUTS(0).R6[Coll[Long]].get(1)) else true
    val auxiliarExchangeCounterRemainsConstant = if (isReplicationBoxPresent) (selfAuxiliarExchangeCounter == OUTPUTS(0).R6[Coll[Long]].get(2)) else true

    val ergProtectedOnReplica = if (isReplicationBoxPresent) (OUTPUTS(0).value >= selfValue) else true

    val mantainValue = ergProtectedOnReplica && (if (isReplicationBoxPresent) {
        if (isERGBase) true else (getBaseTokenAmount(SELF) == getBaseTokenAmount(OUTPUTS(0)))
    } else {
        true
    })

    val P2PK_ERGOTREE_PREFIX = fromBase16("0008cd")
    val isProjectP2PK: Boolean = if (ownerErgotree.size >= 3) {
        ownerErgotree.slice(0, 3) == P2PK_ERGOTREE_PREFIX
    } else {
        false
    }

    val ownerAuthentication: SigmaProp = {
        val projectAddr: SigmaProp = if (isProjectP2PK) {
            val pkContent = ownerErgotree.slice(3, ownerErgotree.size)
            proveDlog(decodePoint(pkContent))
        } else {
            sigmaProp(false)
        }
        val signedByInput: SigmaProp = sigmaProp(INPUTS.exists({ (box: Box) => box.propositionBytes == ownerErgotree }))
        signedByInput || projectAddr
    }

    val deltaPFTokenAdded: Long = {
        val selfPfts = SELF.tokens.filter { (token: (Coll[Byte], Long)) => token._1 == pftTokenId }
        val selfTokens = if (selfPfts.size > 0) { selfPfts(0)._2 } else { 0L }
        val outTokens = if (isReplicationBoxPresent) {
            val outPfts = OUTPUTS(0).tokens.filter { (token: (Coll[Byte], Long)) => token._1 == pftTokenId }
            if (outPfts.size > 0) { outPfts(0)._2 } else { 0L }
        } else {
            0L
        }
        outTokens - selfTokens
    }

    val minimumReached: Boolean = (selfSoldCounter - selfRefundCounter) >= selfMinimumTokensSold

    val isBuyTokens: SigmaProp = if (isSelfReplication) {
        val outAPT = getAPTTokenAmount(OUTPUTS(0))
        val deltaTokenRemoved = selfAPT - outAPT
        val onlyTemporaryUnsoldTokens = deltaTokenRemoved <= temporaryFundingTokenAmountOnContract(SELF)
        val correctExchange = (getBaseTokenAmount(OUTPUTS(0)) - getBaseTokenAmount(SELF)) == (deltaTokenRemoved * selfExchangeRate)
        val counterIncrement = OUTPUTS(0).R6[Coll[Long]].get(0) - selfSoldCounter
        val incrementSoldCounterCorrectly = allOf(Coll(deltaTokenRemoved == counterIncrement, counterIncrement > 0L))
        val constants = allOf(Coll(
            isSelfReplication, refundCounterRemainsConstant, auxiliarExchangeCounterRemainsConstant,
            ProofFundingTokenRemainsConstant, ergProtectedOnReplica
        ))
        sigmaProp(allOf(Coll(constants, onlyTemporaryUnsoldTokens, correctExchange, incrementSoldCounterCorrectly)))
    } else { sigmaProp(false) }

    val isRefundTokens: SigmaProp = if (isSelfReplication) {
        val canBeRefund = {
            val limit = selfBlockLimit._2
            val now = if (selfBlockLimit._1) CONTEXT.preHeader.timestamp else HEIGHT.toLong
            (now > limit) && (!minimumReached)
        }
        val outAPT = getAPTTokenAmount(OUTPUTS(0))
        val deltaTokenAdded = outAPT - selfAPT
        val correctExchange = (getBaseTokenAmount(SELF) - getBaseTokenAmount(OUTPUTS(0))) == (deltaTokenAdded * selfExchangeRate)
        val counterIncrement = OUTPUTS(0).R6[Coll[Long]].get(1) - selfRefundCounter
        val incrementRefundCounterCorrectly = allOf(Coll(deltaTokenAdded == counterIncrement, counterIncrement > 0L))
        val constants = allOf(Coll(
            isSelfReplication, soldCounterRemainsConstant, auxiliarExchangeCounterRemainsConstant,
            ProofFundingTokenRemainsConstant, if (isERGBase) true else ergProtectedOnReplica
        ))
        sigmaProp(allOf(Coll(constants, canBeRefund, incrementRefundCounterCorrectly, correctExchange)))
    } else { sigmaProp(false) }

    val isWithdrawFunds: SigmaProp = {
        val extractedBaseAmount: Long = if (isERGBase) {
            if (isReplicationBoxPresent) { selfValue - OUTPUTS(0).value } else { selfValue }
        } else {
            val selfBaseTokens = getBaseTokenAmount(SELF)
            val outputBaseTokens = if (isReplicationBoxPresent) getBaseTokenAmount(OUTPUTS(0)) else 0L
            selfBaseTokens - outputBaseTokens
        }

        val hasPositiveFeeRate: Boolean = devFee > 0
        val devFeeAmount = if (hasPositiveFeeRate) {
            (extractedBaseAmount * devFee + 99) / 100
        } else {
            0.toBigInt
        }
        val projectAmount = extractedBaseAmount - devFeeAmount

        val ownerOutputs = OUTPUTS.filter({ (box: Box) => box.propositionBytes == ownerErgotree })
        val devFeeOutputs = OUTPUTS.filter({ (box: Box) => blake2b256(box.propositionBytes) == devFeeContractBytesHash })

        val hasRequiredOutputs = if (hasPositiveFeeRate) {
            ownerOutputs.size > 0 && devFeeOutputs.size > 0
        } else {
            ownerOutputs.size > 0
        }

        if (extractedBaseAmount > 0L && projectAmount > 0 && hasRequiredOutputs) {
            val ownerOutput = ownerOutputs(0)

            val correctProjectAmount = if (isERGBase) {
                ownerOutput.value == projectAmount
            } else {
                val projectTokens = ownerOutput.tokens.filter { (token: (Coll[Byte], Long)) => token._1 == baseTokenId }
                val projectTokenAmount = if (projectTokens.size > 0) projectTokens(0)._2 else 0L
                val ergReturnedOnTermination = if (isReplicationBoxPresent) true else (ownerOutput.value >= selfValue)
                (projectTokenAmount == projectAmount) && ergReturnedOnTermination
            }

            val feeIsPaid = if (hasPositiveFeeRate) (devFeeAmount > 0) else true

            val correctDevFee = if (hasPositiveFeeRate) {
                val devFeeOutput = devFeeOutputs(0)
                val distinctBoxes = ownerOutput.id != devFeeOutput.id
                val validAmount = if (isERGBase) {
                    devFeeOutput.value == devFeeAmount
                } else {
                    val devTokens = devFeeOutput.tokens.filter { (token: (Coll[Byte], Long)) => token._1 == baseTokenId }
                    val devTokenAmount = if (devTokens.size > 0) devTokens(0)._2 else 0L
                    devTokenAmount == devFeeAmount
                }
                distinctBoxes && validAmount
            } else {
                true
            }

            val endOrReplicate = {
                val allFundsWithdrawn = if (isERGBase) {
                    extractedBaseAmount == selfValue
                } else {
                    extractedBaseAmount == getBaseTokenAmount(SELF)
                }
                val allTokensWithdrawn = SELF.tokens.exists({ (pair: (Coll[Byte], Long)) => pair._1 == pftTokenId }) == false
                val ended = replicas.size == 0
                isSelfReplication || (ended && allFundsWithdrawn && allTokensWithdrawn && nftRetired)
            }

            val replicaErgGuard = if (isERGBase) true else ergProtectedOnReplica

            val constants = allOf(Coll(
                endOrReplicate, soldCounterRemainsConstant, refundCounterRemainsConstant,
                auxiliarExchangeCounterRemainsConstant, APTokenRemainsConstant,
                ProofFundingTokenRemainsConstant, replicaErgGuard
            ))

            sigmaProp(allOf(Coll(constants, minimumReached, feeIsPaid, correctDevFee, correctProjectAmount)))
        } else { sigmaProp(false) }
    }

    val isWithdrawUnsoldTokens: SigmaProp = if (isSelfReplication) {
        val extractedPFT = -deltaPFTokenAdded
        val onlyUnsold = extractedPFT <= temporaryFundingTokenAmountOnContract(SELF)
        val constants = allOf(Coll(
            isSelfReplication, soldCounterRemainsConstant, refundCounterRemainsConstant,
            auxiliarExchangeCounterRemainsConstant, mantainValue, APTokenRemainsConstant
        ))
        sigmaProp(allOf(Coll(constants, deltaPFTokenAdded < 0L, onlyUnsold))) && ownerAuthentication
    } else { sigmaProp(false) }

    val isAddTokens: SigmaProp = if (isSelfReplication) {
        val constants = allOf(Coll(
            isSelfReplication, soldCounterRemainsConstant, refundCounterRemainsConstant,
            auxiliarExchangeCounterRemainsConstant, mantainValue, APTokenRemainsConstant
        ))
        sigmaProp(allOf(Coll(constants, deltaPFTokenAdded > 0L))) && ownerAuthentication
    } else { sigmaProp(false) }

    val isExchangeFundingTokens: SigmaProp = if (isSelfReplication) {
        val outAPT = getAPTTokenAmount(OUTPUTS(0))
        val deltaTemporaryFundingTokenAdded = outAPT - selfAPT
        val deltaProofFundingTokenExtracted = -deltaPFTokenAdded
        val correctExchange = allOf(Coll(
            deltaTemporaryFundingTokenAdded == deltaProofFundingTokenExtracted,
            deltaTemporaryFundingTokenAdded > 0L
        ))
        val incrementExchangeCounterCorrectly = (OUTPUTS(0).R6[Coll[Long]].get(2) - selfAuxiliarExchangeCounter) == deltaTemporaryFundingTokenAdded
        val constants = allOf(Coll(
            isSelfReplication, soldCounterRemainsConstant, refundCounterRemainsConstant, mantainValue
        ))
        sigmaProp(allOf(Coll(constants, minimumReached, incrementExchangeCounterCorrectly, correctExchange)))
    } else { sigmaProp(false) }

    sigmaProp(noExtraReplicas && (nftInReplica || nftRetired)) && (
        isBuyTokens || isRefundTokens || isWithdrawFunds ||
        isWithdrawUnsoldTokens || isAddTokens || isExchangeFundingTokens
    )
}
