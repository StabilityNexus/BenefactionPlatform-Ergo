{
    // ===== Contract Information ===== //
    // Name: Bene Fundraising Platform  Dev Fee Contract
    // Description: Contract guarding the fee box for the Bene Fundraising Platform.
    // Version: 1.0.0
    // Based on: Phoenix HodlERG Fee (https://raw.githubusercontent.com/PhoenixErgo/phoenix-hodlcoin-contracts/refs/heads/main/hodlERG/contracts/phoenix_fee_contract/v1/ergoscript/phoenix_v1_hodlerg_fee.es)

    // ===== Box Contents ===== //
    // Tokens
    // (Optional) (id, amount) - Token to be distributed (if not ERG)
    // Registers
    // R4: Coll[Byte] (Optional) - Token ID to distribute. Empty/absent for ERG, token ID for token distributions

    // ===== Relevant Transactions ===== //
    // 1. Fee Distribution Tx
    // Inputs: BeneFee1, ... , BeneFeeM
    // DataInputs: None
    // Outputs: Bruno, Lgd, Jossemii, The Stable Order, MinerFee
    // Context Variables: None

    // ===== Compile Time Constants ($) ===== //
    // bruno: reciver address
    // lgd:   reciver address
    // jm:    reciver address
    // order: rediver address

    // ===== Context Variables (_) ===== //
    // None

    // ===== Relevant Variables ===== //
    val minerFee = 1100000
    val minerFeeErgoTreeBytesHash: Coll[Byte] = fromBase16("e540cceffd3b8dd0f401193576cc413467039695969427df94454193dddfb375")
    
    val feeDenom: Long   = 100L
    val brunoNum: Long   = 32L  // Bruno
    val lgdNum: Long = 32L     // Lgd
    val jmNum: Long = 32L     // Jossemi
    val orderNum: Long = 4L  // The Stable Order
    
    val brunoAddress: SigmaProp   = PK("`+bruno+`")
    val lgdAddress: SigmaProp = PK("`+lgd+`")
    val jmAddress: SigmaProp = PK("`+jm+`")
    val orderAddress: SigmaProp = PK("`+order+`")

    // Determine if distributing tokens or ERG
    val distributionTokenId: Coll[Byte] = if (SELF.R4[Coll[Byte]].isDefined) SELF.R4[Coll[Byte]].get else Coll[Byte]()
    val isTokenDistribution: Boolean = distributionTokenId.size > 0

    // Helper function to get distribution amount from box
    def getDistributionAmount(box: Box): Long = {
        if (isTokenDistribution) {
            // Get token amount
            val matchingTokens = box.tokens.filter { (token: (Coll[Byte], Long)) => 
                token._1 == distributionTokenId
            }
            if (matchingTokens.size > 0) {
                matchingTokens(0)._2
            } else {
                0L
            }
        } else {
            // Get ERG amount (for miner fee box, use value directly)
            box.value
        }
    }

    // ===== Fee Distribution Tx ===== //
    val validFeeDistributionTx: Boolean = {                         

        // Outputs
        val brunoBoxOUT: Box    = OUTPUTS(0)
        val lgdBoxOUT: Box  = OUTPUTS(1)
        val jmBoxOUT: Box  = OUTPUTS(2)
        val orderBoxOUT: Box = OUTPUTS(3)
        val minerFeeBoxOUT: Box = OUTPUTS(4)

        // Calculate total output amount and dev amount
        val outputAmount: Long = OUTPUTS.map({ (output: Box) => output.value }).fold(0L, { (acc: Long, curr: Long) => acc + curr })
        
        // For tokens, calculate based on token amounts; for ERG, use ERG values
        val devAmount: Long = if (isTokenDistribution) {
            val totalTokenAmount = getDistributionAmount(brunoBoxOUT) + getDistributionAmount(lgdBoxOUT) + 
                                   getDistributionAmount(jmBoxOUT) + getDistributionAmount(orderBoxOUT)
            totalTokenAmount
        } else {
            outputAmount - minerFeeBoxOUT.value // In case the miner fee increases in the future
        }

        val validMinAmount: Boolean = if (isTokenDistribution) {
            // For tokens, only check that we have minimum ERG for boxes
            outputAmount >= 5000000L
        } else {
            // For ERG, check total amount
            outputAmount >= 5000000L
        }
        
        val validDevBoxes: Boolean = {

            val brunoAmount: Long   = (brunoNum * devAmount) / feeDenom
            val lgdAmount: Long = (lgdNum * devAmount) / feeDenom
            val jmAmount: Long = (jmNum * devAmount) / feeDenom
            val orderAmount: Long = (orderNum * devAmount) / feeDenom

            val validBruno: Boolean   = (getDistributionAmount(brunoBoxOUT) == brunoAmount) && (brunoBoxOUT.propositionBytes == brunoAddress.propBytes)
            val validLgd: Boolean = (getDistributionAmount(lgdBoxOUT) == lgdAmount) && (lgdBoxOUT.propositionBytes == lgdAddress.propBytes)
            val validJm: Boolean = (getDistributionAmount(jmBoxOUT) == jmAmount) && (jmBoxOUT.propositionBytes == jmAddress.propBytes)
            val validOrder: Boolean = (getDistributionAmount(orderBoxOUT) == orderAmount) && (orderBoxOUT.propositionBytes == orderAddress.propBytes)

            allOf(Coll(
                validBruno,
                validLgd,
                validJm,
                validOrder
            ))

        }

        val validMinerFee: Boolean = {

            allOf(Coll(
                (minerFeeBoxOUT.value >= minerFee), // In case the miner fee increases in the future
                (blake2b256(minerFeeBoxOUT.propositionBytes) == minerFeeErgoTreeBytesHash)
            ))

        }

        val validOutputSize: Boolean = (OUTPUTS.size == 5)

        allOf(Coll(
            validMinAmount,
            validDevBoxes,
            validMinerFee,
            validOutputSize
        ))

    }

    sigmaProp(validFeeDistributionTx) // && atLeast(1, Coll(brunoAddress, lgdAddress, jmAddress, orderAddress)) // Done so we are incentivized to not spam the miner fee.

}