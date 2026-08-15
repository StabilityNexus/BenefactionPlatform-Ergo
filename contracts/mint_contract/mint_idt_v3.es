{
/*
    The function of the following contract is to ensure that the minted token can be spent exclusively
    in the contract corresponding to the constant 'contract_bytes_hash'.

    v3 (#176): the project box now carries a singleton NFT at tokens(0) and the IDT/APT at tokens(1),
    where v2 had the IDT at tokens(0) doing both jobs. The NFT is minted in this very transaction,
    at no extra cost: on Ergo a newly minted token takes the id of INPUTS(0), and this box is input 0,
    so the identity is pinned to a box that has just been spent and can never be reproduced.

    This contract does not ensure:
    1. The token amount should match the issuance amount of the PFT in the main contract.
    2. Name, description, and decimal quantity aligned with the project and PFT.
*/

    val contractBox = OUTPUTS(0)

    // The minted id is the id of INPUTS(0), so this box has to be input 0 for the check below to
    // mean what it says.
    val spentFirst = INPUTS(0).id == SELF.id

    val correctSpend = {
        val isIDT = SELF.tokens(0)._1 == contractBox.tokens(1)._1
        val spendAll = SELF.tokens(0)._2 == contractBox.tokens(1)._2

        isIDT && spendAll
    }

    // The project NFT: minted here, a singleton, and at the index the contract reads identity from.
    val correctNft = {
        val isMintedHere = contractBox.tokens(0)._1 == SELF.id
        val isSingleton = contractBox.tokens(0)._2 == 1L

        isMintedHere && isSingleton
    }

    val correctContract = {
        fromBase16("`+contract_bytes_hash+`") == blake2b256(contractBox.propositionBytes)
    }

    sigmaProp(allOf(Coll(
        spentFirst,
        correctSpend,
        correctNft,
        correctContract
    )))
}
