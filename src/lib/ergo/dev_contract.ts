import { compile } from "@fleet-sdk/compiler";
import { blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";

function generate_contract(): string {
    return `
{
    val minerFee = 1100000
    val minerFeeErgoTreeBytesHash: Coll[Byte] = fromBase16("e540cceffd3b8dd0f401193576cc413467039695969427df94454193dddfb375")
    
    val feeDenom: Long   = 75L
    val brunoNum: Long   = 25L
    val lgdNum: Long = 25L
    val jmNum: Long = 25L
    
    val brunoAddress: SigmaProp   = PK("9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD")
    val lgdAddress: SigmaProp = PK("9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD")
    val jmAddress: SigmaProp = PK("9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD")

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

    sigmaProp(validFeeDistributionTx) && atLeast(1, Coll(brunoAddress, lgdAddress, jmAddress)) // Done so we are incentivized to not spam the miner fee.

}
    `;
}

export function get_dev_contract_bytes(): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(generate_contract(), {version: 1}).toBytes()  // Compile contract to ergo tree
        )                                                         // Blake2b256 hash of contract bytes
    );
}