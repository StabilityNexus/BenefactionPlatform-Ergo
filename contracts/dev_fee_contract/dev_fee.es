{

    // ===== Contract Information ===== //
    // Name: Bene Fundraising Platform  Dev Fee Contract
    // Description: Contract guarding the fee box for the Bene Fundraising Platform.
    // Version: 1.0.0
    // Based on: Phoenix HodlERG Fee (https://raw.githubusercontent.com/PhoenixErgo/phoenix-hodlcoin-contracts/refs/heads/main/hodlERG/contracts/phoenix_fee_contract/v1/ergoscript/phoenix_v1_hodlerg_fee.es)

    // ===== Box Contents ===== //
    // Tokens
    // None
    // Registers
    // None

    // ===== Relevant Transactions ===== //
    // 1. Fee Distribution Tx
    // Inputs: BeneFee1, ... , BeneFeeM
    // DataInputs: None
    // Outputs: Bruno, Lgd, Jm, MinerFee
    // Context Variables: None

    // ===== Compile Time Constants ($) ===== //
    // $minerFee: Long

    // ===== Context Variables (_) ===== //
    // None

    // ===== Relevant Variables ===== //
    val minerFeeErgoTreeBytesHash: Coll[Byte] = fromBase16("e540cceffd3b8dd0f401193576cc413467039695969427df94454193dddfb375")
    
    val feeDenom: Long   = 75L
    val brunoNum: Long   = 25L
    val lgdNum: Long = 25L
    val jmNum: Long = 25L
    
    val brunoAddress: SigmaProp   = PK("")
    val lgdAddress: SigmaProp = PK("")
    val jmAddress: SigmaProp = PK("")

    // ===== Fee Distribution Tx ===== //
    val validFeeDistributionTx: Boolean = {                         

        // Outputs
        val brunoBoxOUT: Box    = OUTPUTS(0)
        val lgdBoxOUT: Box  = OUTPUTS(1)
        val jmBoxOut: Box  = OUTPUTS(2)
        val minerFeeBoxOUT: Box = OUTPUTS(3)

        val outputAmount: Long = OUTPUTS.map({ (output: Box) => output.value }).fold(0L, { (acc: Long, curr: Long) => acc + curr })
        val devAmount: Long = outputAmount - minerFeeBoxOUT.value // In case the miner fee increases in the future.

        val validMinAmount: Boolean = (outputAmount >= 5000000L) // This prevents dust transactions
        
        val validDevBoxes: Boolean = {

            val brunoAmount: Long   = (brunoNum * devAmount) / feeDenom
            val lgdAmount: Long = (lgdNum * devAmount) / feeDenom
            val jmAmount: Long = (jmNum * devAmount) / feeDenom

            val validBruno: Boolean   = (brunoBoxOUT.value == brunoAmount) && (brunoBoxOUT.propositionBytes == brunoAddress.propBytes)
            val validLgd: Boolean = (lgdBoxOUT.value == lgdAmount) && (lgdBoxOUT.propositionBytes == lgdAddress.propBytes)
            val validJm: Boolean = (jmBoxOut.value == jmAmount) && (jmBoxOut.propositionBytes == jmAddress.propBytes)

            allOf(Coll(
                validBruno,
                validLgd,
                validJm
            ))

        }

        val validMinerFee: Boolean = {

            allOf(Coll(
                (minerFeeBoxOUT.value >= $minerFee), // In case the miner fee increases in the future
                (blake2b256(minerFeeBoxOUT.propositionBytes) == minerFeeErgoTreeBytesHash)
            ))

        }

        val validOutputSize: Boolean = (OUTPUTS.size == 6)

        allOf(Coll(
            validMinAmount,
            validDevBoxes,
            validMinerFee,
            validOutputSize
        ))

    }

    sigmaProp(validFeeDistributionTx) && atLeast(1, Coll(brunoAddress, lgdAddress, jmAddress)) // Done so we are incentivized to not spam the miner fee.

}
