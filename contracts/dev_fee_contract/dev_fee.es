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
    // Outputs: Bruno, Lgd, Jossemii, The Stable Order, MinerFee
    // Context Variables: None

    // ===== Compile Time Constants ($) ===== //
    //

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
    
    val brunoAddress: SigmaProp   = PK("9fBF4dceTsqdhsYUNVZHjsv4jqoKVzVv3KywFCycbkEXEq5j6bp")
    val lgdAddress: SigmaProp = PK("9gkRrMRdSstibAsVzCtYumUGbXDPQZHkfuAaqmA49FNH3tN4XDg")
    val jmAddress: SigmaProp = PK("9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD")
    val orderAddress: SigmaProp = PK("9h9hjN2KC3jEyCa6KEYKBotPRESdo9oa29yyKcoSLWwtaX2VvhM")

    // ===== Fee Distribution Tx ===== //
    val validFeeDistributionTx: Boolean = {                         

        // Outputs
        val brunoBoxOUT: Box    = OUTPUTS(0)
        val lgdBoxOUT: Box  = OUTPUTS(1)
        val jmBoxOUT: Box  = OUTPUTS(2)
        val orderBoxOUT: Box = OUTPUTS(3)
        val minerFeeBoxOUT: Box = OUTPUTS(4)

        val outputAmount: Long = OUTPUTS.map({ (output: Box) => output.value }).fold(0L, { (acc: Long, curr: Long) => acc + curr })
        val devAmount: Long = outputAmount - minerFeeBoxOUT.value // In case the miner fee increases in the future.

        val validMinAmount: Boolean = (outputAmount >= 5000000L) // This prevents dust transactions
        
        val validDevBoxes: Boolean = {

            val brunoAmount: Long   = (brunoNum * devAmount) / feeDenom
            val lgdAmount: Long = (lgdNum * devAmount) / feeDenom
            val jmAmount: Long = (jmNum * devAmount) / feeDenom
            val orderAmount: Long = (orderNum * devAmount) / feeDenom

            val validBruno: Boolean   = (brunoBoxOUT.value == brunoAmount) && (brunoBoxOUT.propositionBytes == brunoAddress.propBytes)
            val validLgd: Boolean = (lgdBoxOUT.value == lgdAmount) && (lgdBoxOUT.propositionBytes == lgdAddress.propBytes)
            val validJm: Boolean = (jmBoxOUT.value == jmAmount) && (jmBoxOUT.propositionBytes == jmAddress.propBytes)
            val validOrder: Boolean = (orderBoxOUT.value == orderAmount) && (orderBoxOUT.propositionBytes == orderAddress.propBytes)

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

        val validOutputSize: Boolean = (OUTPUTS.size == 6)

        allOf(Coll(
            validMinAmount,
            validDevBoxes,
            validMinerFee,
            validOutputSize
        ))

    }

    sigmaProp(validFeeDistributionTx) && atLeast(1, Coll(brunoAddress, lgdAddress, jmAddress, validOrder)) // Done so we are incentivized to not spam the miner fee.

}