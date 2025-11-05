/**
* ===================================================================================
* Contract for a "Digital Public Good" (used for Type NFTs)
* ===================================================================================
*
* PURPOSE:
* To protect a box containing an NFT and its metadata in registers, ensuring
* the information serves as a permanent and immutable standard for the ecosystem.
*
* SPENDING RULES:
* 1. Anyone can spend this box (no signature required).
* 2. Spending is only valid if a single output box is created that is an
* exact replica of the input, except for its ERG value, which must
* be greater than or equal. This allows for top-ups to pay storage rent.
*
* -----------------------------------------------------------------------------------
* R4: Coll[Byte] -> typeName
* - Purpose: Human-readable name of the type (e.g., "Web URL").
*
* R5: Coll[Byte] -> description
* - Purpose: Brief description of the type's use and purpose.
*
* R6: Coll[Byte] -> schemaURI
* - Purpose: URI to a schema (JSON Schema, IPFS) that defines the data
* structure for proofs that use this type.
*
* R7: Boolean -> isReputationProof
* - Purpose: Boolean value that is `true` if this type is used for
* a reputation proof, and `false` otherwise.
*
* R8: (Empty) -> reserved_1
* - Purpose: Reserved for future extensions.
*
* R9: (Empty) -> reserved_2
* - Purpose: Reserved for future extensions.
* -----------------------------------------------------------------------------------
*/
{
  // Filters the outputs to find the one containing the same NFT as this box (SELF).
  val successorOutputs = OUTPUTS.filter { (box: Box) =>
    box.tokens.size > 0 && box.tokens(0)._1 == SELF.tokens(0)._1
  }

  // Validates that exactly one successor box has been found.
  if (successorOutputs.size == 1) {
    val successor = successorOutputs(0)

    // Defines the immutability conditions.
    // Each register from R4 to R9 must be checked individually.
    // R7 now checks for a Boolean instead of a Coll[Byte].
    val registersAreImmutable = (
      successor.R4[Coll[Byte]] == SELF.R4[Coll[Byte]] &&
      successor.R5[Coll[Byte]] == SELF.R5[Coll[Byte]] &&
      successor.R6[Coll[Byte]] == SELF.R6[Coll[Byte]] &&
      successor.R7[Boolean] == SELF.R7[Boolean] &&
      successor.R8[Coll[Byte]] == SELF.R8[Coll[Byte]] &&
      successor.R9[Coll[Byte]] == SELF.R9[Coll[Byte]]
    )

    val dataIsImmutable = (
      // The protection script cannot change.
      successor.propositionBytes == SELF.propositionBytes &&
      // The NFT token must be preserved identically.
      successor.tokens(0) == SELF.tokens(0) &&
      // Registers R4-R9 must be identical.
      registersAreImmutable
    )

    // The ERG value of the output must be greater than or equal to the input's.
    val canOnlyAddErgs = successor.value >= SELF.value

    // The transaction is valid if the immutability and value conditions are met.
    sigmaProp(dataIsImmutable && canOnlyAddErgs)

  } else {
    // Fails if exactly one successor is not found, to prevent
    // the destruction or duplication of the NFT.
    sigmaProp(false)
  }
}
