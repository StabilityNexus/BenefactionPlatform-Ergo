{
    val contractBox = OUTPUTS(0)
    val nftId = SELF.id
    val spentFirst = INPUTS(0).id == nftId

    val noDuplicateNftInAnyBox = OUTPUTS.forall({ (box: Box) =>
        box.tokens.filter({ (token: (Coll[Byte], Long)) => token._1 == nftId }).size <= 1
    })

    val totalMintedNft = OUTPUTS.map({ (box: Box) =>
        val matching = box.tokens.filter({ (token: (Coll[Byte], Long)) => token._1 == nftId })
        if (matching.size > 0) matching(0)._2 else 0L
    }).fold(0L, { (acc: Long, curr: Long) => acc + curr })

    val correctNft = {
        contractBox.tokens.size >= 2 &&
        contractBox.tokens(0)._1 == nftId &&
        contractBox.tokens(0)._2 == 1L &&
        noDuplicateNftInAnyBox &&
        totalMintedNft == 1L
    }
    val r8Constants = contractBox.R8[Coll[Coll[Byte]]].get
    val hasValidAptR8 = if (r8Constants.size >= 6) {
        r8Constants(5) == SELF.tokens(0)._1
    } else {
        false
    }

    val correctIdtSpend = {
        SELF.tokens.size >= 1 &&
        contractBox.tokens.size >= 2 &&
        SELF.tokens(0)._1 == contractBox.tokens(1)._1 &&
        SELF.tokens(0)._2 == contractBox.tokens(1)._2 &&
        hasValidAptR8
    }

    val correctContract = {
        fromBase16("`+contract_bytes_hash+`") == blake2b256(contractBox.propositionBytes)
    }

    sigmaProp(allOf(Coll(
        spentFirst,
        correctNft,
        correctIdtSpend,
        correctContract
    )))
}
