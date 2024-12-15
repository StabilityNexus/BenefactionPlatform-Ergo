{
/*
    The function of the following contract is to ensure that the minted token can be spent exclusively 
    in the contract corresponding to the constant 'contract_bytes_hash'.

    This contract does not ensure:
    1. The token amount should match the issuance amount of the PFT in the main contract.
    2. Name, description, and decimal quantity aligned with the project and PFT.
*/

    val contractBox = OUTPUTS(0)

    val correctSpend = {
        val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1
        val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2
    }

    val correctContract = {
        fromBase16("`+contract_bytes_hash+`") == blake2b256(contractBox.propositionBytes)
    }

    sigmaProp(allOf(Coll(
        correctSpend,
        correctContract
    )))
}