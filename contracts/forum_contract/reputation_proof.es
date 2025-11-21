/**
* ===================================================================================
* Contract for a "Reputation Token"
* ===================================================================================
*
* PURPOSE:
* To govern a box that is part of a collection of "reputation" boxes.
* This contract ensures that the entire collection remains coherent, that data
* is unique, and that only the owner can authorize changes. It acts as a
* piece of a distributed state that is validated atomically.
*
* SPENDING RULES:
* There are two ways to spend this box:
*
* 1. ADMIN PATH (SIGNATURE REQUIRED):
* a. AUTHORIZATION: The transaction must be signed by the owner (R7).
* b. BINDING TO A STANDARD: The "Type NFT" box must be provided
* in dataInputs[0]. The R4 register must match the token ID of that NFT.
* c. OUTPUT RULES: Rules for uniqueness, metadata preservation,
* and locking logic (frozen/mutable) apply.
*
* 2. ERG TOP-UP PATH (PUBLIC AND SIGNATURE-FREE):
* a. ANYONE can spend this box to prevent "demurrage" (storage rent).
* b. CONDITION: The transaction is only valid if it creates a single output box that
* is an EXACT REPLICA of the input (same tokens, registers, and script),
* but with an equal or greater ERG value. No other changes are allowed.
*
* RECOMMENDED REGISTER AND TOKEN STRUCTURE:
* -----------------------------------------------------------------------------------
* Token(0): (Coll[Byte], Long) -> (repTokenId, amount)
* - Purpose: The reputation token that this contract protects.
*
* R4: Coll[Byte]               -> typeNftTokenId
* - Purpose: ID of the "Type NFT" token to which this box adheres.
*
* R5: Coll[Byte]               -> uniqueObjectData
* - Purpose: Data that, together with R4, uniquely identifies this object
* within the collection.
*
* R6:  Boolean                -> isLocked
* - Purpose: Lock status
*
* R7: Coll[Byte]              -> propositionBytes of the owner (must be spent one box with this script to confirm ownership)
*
* R8: Boolean                  -> customFlag
* - Purpose: A boolean flag for custom application logic.
*
* R9: Coll[Byte]               -> reserved_1
* - Purpose: Reserved for future extensions.
* -----------------------------------------------------------------------------------
*/
{

  val DIGITAL_PUBLIC_GOOD = fromBase16("`+DIGITAL_PUBLIC_GOOD_SCRIPT_HASH+`")

  // --- Path 1: Admin Transaction (signed by the owner) ---
  val ownerSignedPath = {
    val isOwner = INPUTS.exists { (b: Box) => b.propositionBytes == SELF.R7[Coll[Byte]].get }
    if (isOwner) {

      // Extract data from this box's (SELF) register structure.
      val isLocked = SELF.R6[Boolean].get
      val repTokenId = SELF.tokens(0)._1
      
      // PROOF OF COMPLETENESS

      val repBoxesOnInputs = INPUTS.filter { (b: Box) =>
        blake2b256(b.propositionBytes) == blake2b256(SELF.propositionBytes) &&
        b.tokens.size > 0 && b.tokens(0)._1 == repTokenId &&
        b.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get &&
        b.R4[Coll[Byte]].isDefined &&
        b.R5[Coll[Byte]].isDefined &&
        b.R8[Boolean].isDefined
      }

      val repBoxesOnOutputs = OUTPUTS.filter { (b: Box) =>
        blake2b256(b.propositionBytes) == blake2b256(SELF.propositionBytes) &&
        b.tokens.size > 0 && b.tokens(0)._1 == repTokenId &&
        b.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get &&
        b.R4[Coll[Byte]].isDefined &&
        b.R5[Coll[Byte]].isDefined &&
        b.R8[Boolean].isDefined
      }

      val correctManagedSupply = {
        val inputsAmount = repBoxesOnInputs.fold(0L, { (sum: Long, b: Box) => sum + b.tokens(0)._2 })
        val outputsAmount = repBoxesOnOutputs.fold(0L, { (sum: Long, b: Box) => sum + b.tokens(0)._2 })

        val valuePreserved = {

          val tokensArePreserved = {
            val secondaryInputTokens = repBoxesOnInputs.flatMap({ (b: Box) =>
              if (b.tokens.size > 1) { b.tokens.slice(1, b.tokens.size) } else { Coll[(Coll[Byte], Long)]() }
            })
            val secondaryOutputTokens = repBoxesOnOutputs.flatMap({ (b: Box) =>
              if (b.tokens.size > 1) { b.tokens.slice(1, b.tokens.size) } else { Coll[(Coll[Byte], Long)]() }
            })
            
            val uniqueTokenIds = secondaryInputTokens.fold(Coll[Coll[Byte]](), { (acc: Coll[Coll[Byte]], t: (Coll[Byte], Long)) =>
              if (acc.exists({ (x: Coll[Byte]) => x == t._1 })) acc else acc.append(Coll(t._1))
            })
            
            uniqueTokenIds.forall({ (tokenId: Coll[Byte]) =>
              val totalIn = secondaryInputTokens
                .filter({ (t: (Coll[Byte], Long)) => t._1 == tokenId })
                .fold(0L, { (sum: Long, t: (Coll[Byte], Long)) => sum + t._2 })
              val totalOut = secondaryOutputTokens
                .filter({ (t: (Coll[Byte], Long)) => t._1 == tokenId })
                .fold(0L, { (sum: Long, t: (Coll[Byte], Long)) => sum + t._2 })
              totalOut >= totalIn
            })
          }

          val nativeErgIsPreserved = {
            val totalNativeIn = repBoxesOnInputs.fold(0L, { (sum: Long, b: Box) => sum + b.value })
            val totalNativeOut = repBoxesOnOutputs.fold(0L, { (sum: Long, b: Box) => sum + b.value })
            totalNativeOut >= totalNativeIn
          }

          tokensArePreserved && nativeErgIsPreserved
        }

        inputsAmount == outputsAmount &&  // Reputation proof tokens are preserved.
        valuePreserved
      }
      
      val typeExists: Boolean = {
        // Get the token ID to check from the box's register R4
        val typeTokenIdToCheck: Coll[Byte] = SELF.R4[Coll[Byte]].get

        // Extract the token IDs from the collection of type NFT boxes
        val availableTypeTokenIds: Coll[Coll[Byte]] = CONTEXT.dataInputs.filter { (b: Box) =>
          blake2b256(b.propositionBytes) == DIGITAL_PUBLIC_GOOD &&
          b.creationInfo._2 <= CONTEXT.preHeader.timestamp
        }.map { (b: Box) => 
          b.tokens(0)._1
        }

        availableTypeTokenIds.exists { (id: Coll[Byte]) => 
          id == typeTokenIdToCheck
        }
      }

      // LOCKING LOGIC
      val correctLock =  {
        if (isLocked) {
          repBoxesOnOutputs.exists { (x: Box) => {
            x.tokens(0)._2 >= SELF.tokens(0)._2 &&              // Preserve token amount or increase it.
            x.R4[Coll[Byte]].get == SELF.R4[Coll[Byte]].get &&  // Preserve type NFT ID.
            x.R5[Coll[Byte]].get == SELF.R5[Coll[Byte]].get &&  // Preserve unique object data.
            x.R6[Boolean].get == true &&                        // Once locked, always locked.
            x.R9[Coll[Byte]].get == SELF.R9[Coll[Byte]].get     // Preserve reserved data.
          }}
        }
        else { true }
      }

      correctManagedSupply && typeExists && correctLock
    } 
    else { false }
  }

  // --- Path 2: ERG Top-Up (public, no signature) ---
  val publicTopUpPath = {
    // Filter the outputs to find the one that is a successor to this box.
    val successorOutputs = OUTPUTS.filter { (box: Box) =>
      box.propositionBytes == SELF.propositionBytes &&
      box.tokens.size > 0 &&
      box.tokens(0)._1 == SELF.tokens(0)._1
    }

    // If exactly one successor is found...
    if (successorOutputs.size == 1) {
      val successor = successorOutputs(0)

      // Define the conditions for total immutability.
      val registersAreImmutable = (
        successor.R4[Coll[Byte]] == SELF.R4[Coll[Byte]] &&
        successor.R5[Coll[Byte]] == SELF.R5[Coll[Byte]] &&
        successor.R6[Boolean]    == SELF.R6[Boolean]    &&
        successor.R7[Coll[Byte]] == SELF.R7[Coll[Byte]] &&
        successor.R8[Boolean]    == SELF.R8[Boolean]    &&
        successor.R9[Coll[Byte]] == SELF.R9[Coll[Byte]]
      )
      
      val tokensAreImmutable = successor.tokens == SELF.tokens
      
      // The ERG value of the output must be greater than or equal to the input's.
      val canOnlyAddErgs = successor.value >= SELF.value

      // The transaction is valid if everything is immutable and only ERGs are added.
      registersAreImmutable && tokensAreImmutable && canOnlyAddErgs
    } else {
      false
    }
  }
  
  // The transaction is valid if it meets the owner path OR the public top-up path.
  sigmaProp(ownerSignedPath || publicTopUpPath)
}
