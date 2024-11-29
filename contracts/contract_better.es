{
    // ===== Contract Description ===== //
    // Name: Token Sale Contract
    // Description: Manages token sales with features like token purchase, refund, and fund withdrawal
    // Version: 1.0.0
    // Author: [Your Name/Organization]

    // ===== Box Contents ===== //
    // Tokens
    // 1. (TokenId, Total Token Amount)
    // Registers
    // R4: Int       Block limit until allowed withdrawal or refund
    // R5: Long      Minimum amount of tokens that need to be sold
    // R6: Long      Amount of tokens that have already been sold
    // R7: Long      ERG/Token exchange rate
    // R8: Coll[Byte] Contract owner details (base58 address) in JSON format
    // R9: Coll[Byte] Project content (title, description) in JSON format

    // ===== Transactions ===== //
    // 1. Buy Tokens
    // Inputs: Token Sale Contract
    // Outputs: Updated Token Sale Contract, User Token Box
    // Constraints: 
    //   - Correct token exchange
    //   - Update sold tokens counter
    //   - Token transfer to user

    // 2. Refund Tokens
    // Inputs: Token Sale Contract
    // Outputs: Refunded Tokens, Refund ERG to User
    // Constraints:
    //   - Block limit passed
    //   - Minimum sales not reached
    //   - Correct token and ERG exchange

    // 3. Withdraw Funds
    // Inputs: Token Sale Contract
    // Outputs: Project Address, Dev Fee Address
    // Constraints:
    //   - Minimum sales reached
    //   - Correct dev fee calculation
    //   - Contract replication or full withdrawal

    // 4. Withdraw Unsold Tokens
    // Inputs: Token Sale Contract
    // Outputs: Project Address with Tokens
    // Constraints:
    //   - Contract replication
    //   - No value change
    //   - Correct token handling

    // 5. Add Tokens
    // Inputs: Token Sale Contract
    // Outputs: Updated Token Sale Contract
    // Constraints:
    //   - Contract replication
    //   - No value change
    //   - Correct token handling

    // ===== Compile Time Constants ===== //
    // $owner_addr: Base58 address of the contract owner
    // $dev_addr: Base58 address of the developer
    // $dev_fee: Percentage fee for the developer
    // $token_id: Token identifier string

    // ===== Context Variables ===== //
    // None

    // ===== Helper Functions ===== //
    // Defined within the main contract logic

    val isSelfReplication = {
        val sameBlockLimit = SELF.R4[Int].get == OUTPUTS(0).R4[Int].get
        val sameMinimumSold = SELF.R5[Long].get == OUTPUTS(0).R5[Long].get
        val sameExchangeRate = SELF.R7[Long].get == OUTPUTS(0).R7[Long].get
        val sameConstants = SELF.R8[Coll[Byte]].get == OUTPUTS(0).R8[Coll[Byte]].get
        val sameProjectContent = SELF.R9[Coll[Byte]].get == OUTPUTS(0).R9[Coll[Byte]].get
        val sameScript = SELF.propositionBytes == OUTPUTS(0).propositionBytes

        sameBlockLimit && sameMinimumSold && sameExchangeRate && 
        sameConstants && sameProjectContent && sameScript
    }

    val projectAddr: SigmaProp = PK("`+owner_addr+`")
    
    val isToProjectAddress = {
        val isSamePropBytes: Boolean = projectAddr.propBytes == OUTPUTS(1).propositionBytes
        isSamePropBytes
    }

    val isFromProjectAddress = {
        val isSamePropBytes: Boolean = projectAddr.propBytes == INPUTS(1).propositionBytes
        isSamePropBytes
    }

    val soldCounterRemainsConstant = SELF.R6[Long].get == OUTPUTS(0).R6[Long].get

    // Token Purchase Transaction Validation
    val isBuyTokens = {
        val userBox = OUTPUTS(1)
        val userHasTokens = userBox.tokens.size > 0 && userBox.tokens(0)._1 == SELF.tokens(0)._1
        
        val correctExchange = {
            val addedValueToTheContract = OUTPUTS(0).value - SELF.value
            val exchangeRate = SELF.R7[Long].get
            val userTokenAmount = userBox.tokens(0)._2

            addedValueToTheContract == userTokenAmount * exchangeRate
        }
        
        val incrementSoldCounterCorrectly = {
            val counterIncrement = {
                val selfAlreadySoldCounter = SELF.R6[Long].get
                val outputAlreadySoldCounter = OUTPUTS(0).R6[Long].get
                outputAlreadySoldCounter - selfAlreadySoldCounter
            }
            
            val numberOfTokensBuyed = {
                val selfAlreadyTokens = if (SELF.tokens.size == 0) 0.toLong else SELF.tokens(0)._2
                val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2
                selfAlreadyTokens - outputAlreadyTokens
            }

            numberOfTokensBuyed == counterIncrement
        }

        isSelfReplication && userHasTokens && correctExchange && incrementSoldCounterCorrectly
    }

    // Token Refund Transaction Validation
    val isRefundTokens = {
        val canBeRefund = {
            val minimumNotReached = {
                val minimumSalesThreshold = SELF.R5[Long].get
                val soldCounter = SELF.R6[Long].get
                soldCounter < minimumSalesThreshold
            }
            val afterBlockLimit = HEIGHT > SELF.R4[Int].get
            
            afterBlockLimit && minimumNotReached
        }
        
        val correctExchange = {
            val retiredValueFromTheContract = SELF.value - OUTPUTS(0).value
            val addedTokensValue = {
                val addedTokensOnTheContract = {
                    val selfAlreadyTokens = if (SELF.tokens.size == 0) 0.toLong else SELF.tokens(0)._2
                    val outputAlreadyTokens = if (OUTPUTS(0).tokens.size == 0) 0.toLong else OUTPUTS(0).tokens(0)._2
                    outputAlreadyTokens - selfAlreadyTokens
                }
                addedTokensOnTheContract * SELF.R7[Long].get
            }
            
            val sameToken = {
                val selfAlreadyToken = if (SELF.tokens.size == 0) Coll[Byte]() else SELF.tokens(0)._1
                val outputAlreadyToken = if (OUTPUTS(0).tokens.size == 0) Coll[Byte]() else OUTPUTS(0).tokens(0)._1
                selfAlreadyToken == outputAlreadyToken
            }

            retiredValueFromTheContract == addedTokensValue && sameToken
        }

        isSelfReplication && soldCounterRemainsConstant && canBeRefund && correctExchange
    }

    // Withdraw Funds Transaction Validation
    val isWithdrawFunds = {
        val extractedValue: Long = {
            OUTPUTS(1).value - INPUTS.slice(1, INPUTS.size).fold(0L, { (acc: Long, box: Box) => acc + box.value })
        }

        val correctDevFee = {
            val OUT = OUTPUTS(2)
            val devFee = `+dev_fee+`
            val devAddr: SigmaProp = PK("`+dev_addr+`")

            val isToDevAddress = {
                val isSamePropBytes: Boolean = devAddr.propBytes == OUT.propositionBytes
                isSamePropBytes
            }

            val isCorrectDevAmount = {
                val devAmount = extractedValue * devFee / 100
                OUT.value == devAmount
            }

            isCorrectDevAmount && isToDevAddress
        }

        val endOrReplicate = {
            val allFundsWithdrawn = extractedValue == SELF.value
            isSelfReplication || allFundsWithdrawn
        }

        val minimumReached = {
            val minimumSalesThreshold = SELF.R5[Long].get
            val soldCounter = SELF.R6[Long].get
            soldCounter >= minimumSalesThreshold
        }
        
        endOrReplicate && soldCounterRemainsConstant && minimumReached && 
        isToProjectAddress && correctDevFee
    }

    // Maintain Contract Value
    val mantainValue = SELF.value == OUTPUTS(0).value

    // Token Amount Rebalancing Validation
    val rebalanceTokenAmountCorrectly = {
        val noAddsOtherTokens = OUTPUTS(0).tokens.size < 2
        val correctToken = if (OUTPUTS(0).tokens.size == 0) true else 
            OUTPUTS(0).tokens(0)._1 == fromBase16("`+token_id+`")
        noAddsOtherTokens && correctToken
    }

    // Withdraw Unsold Tokens Transaction Validation
    val isWithdrawUnsoldTokens = 
        isSelfReplication && soldCounterRemainsConstant && 
        isToProjectAddress && mantainValue && rebalanceTokenAmountCorrectly
    
    // Add Tokens Transaction Validation
    val isAddTokens = 
        isSelfReplication && soldCounterRemainsConstant && 
        isFromProjectAddress && mantainValue && rebalanceTokenAmountCorrectly

    // Contract Build Validation
    val correctBuild = {
        val correctTokenId = if (SELF.tokens.size == 0) true else 
            SELF.tokens(0)._1 == fromBase16("`+token_id+`")
        val onlyOneOrAnyToken = SELF.tokens.size < 2

        correctTokenId && onlyOneOrAnyToken
    }

    // Allowed Actions
    val actions = 
        isBuyTokens || 
        isRefundTokens || 
        isWithdrawFunds || 
        isWithdrawUnsoldTokens || 
        isAddTokens

    // Final Validation
    sigmaProp(correctBuild && actions)
}