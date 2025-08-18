import {
    OutputBuilder,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { type Project } from '../../common/project';
import { get_address } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction } from '../wallet-utils';
import { get_dev_contract_address } from '../dev/dev_contract';
import { SColl, SPair } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function withdraw(
    project: Project,
    amount: number
): Promise<string|null> {
    
    // Check if this is a multi-token contract (v1_2) with a base token
    const isMultiToken = project.version === "v1_2" && project.base_token_id && project.base_token_id !== "";
    const isERGBase = !isMultiToken;
    
    // For ERG-based contracts, convert to nanoERG
    if (isERGBase) {
        amount = amount * Math.pow(10, 9);
    }
    // For token-based contracts, amount is already in the smallest unit
    
    console.log("wants withdraw ", amount, isERGBase ? "(ERG)" : "(base token)")

    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await window.ergo!.get_utxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];

    const devAddress = project.constants.dev_addr ?? get_dev_contract_address();
    const devFeePercentage = project.constants.dev_fee;
    
    // Get current base token amount if multi-token
    let currentBaseTokenAmount = 0;
    if (isMultiToken) {
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = Number(token.amount);
                break;
            }
        }
    }

    // Calculate extracted amount based on contract logic
    const extractedBaseAmount = isERGBase ? amount : Math.min(amount, currentBaseTokenAmount);
    
    // Validation based on contract requirements
    if (isERGBase) {
        // ERG withdrawal validation
        if (extractedBaseAmount > project.value) {
            alert("Not enough ERG to withdraw.");
            return null;
        }
    } else {
        // Token withdrawal validation
        if (extractedBaseAmount > currentBaseTokenAmount) {
            alert("Not enough base tokens to withdraw.");
            return null;
        }
    }

    // Calculate dev fee and project amounts according to contract logic
    const minnerFeeAmount = 1100000; // Contract constant
    let devFeeAmount = Math.floor(extractedBaseAmount * devFeePercentage / 100);
    
    // Apply contract logic: if devFeeAmount < 1, set to 0
    if (devFeeAmount < 1) {
        devFeeAmount = 0;
    }
    
    const projectAmountBase = extractedBaseAmount - devFeeAmount;
    
    // For ERG, subtract miner fee from project amount. For base tokens, no miner fee needed.
    const projectAmount = isERGBase ? projectAmountBase - minnerFeeAmount : projectAmountBase;

    // Validation according to contract requirements
    if (isERGBase) {
        if (projectAmount < SAFE_MIN_BOX_VALUE) {
            alert("The withdrawal amount is too small after fees.");
            return null;
        }
    } else {
        if (projectAmount <= 0) {
            alert("The withdrawal amount is too small after fees.");
            return null;
        }
    }

    // Determine if this is a full withdrawal according to contract logic
    const allFundsWithdrawn = isERGBase ? 
        (extractedBaseAmount === project.value) : 
        (extractedBaseAmount === currentBaseTokenAmount);
    const allTokensWithdrawn = project.current_pft_amount === 0; // No PFT tokens left
    const isFullWithdrawal = allFundsWithdrawn && allTokensWithdrawn;
    
    console.log("Withdrawal details:", {
        extractedBaseAmount,
        devFeeAmount,
        projectAmount,
        allFundsWithdrawn,
        allTokensWithdrawn,
        isFullWithdrawal
    });

    if (!isFullWithdrawal) {  
        // Partial withdrawal - need to replicate contract (isSelfReplication = true)
        
        // Calculate remaining amounts for the contract
        const remainingErg = isERGBase ? 
            BigInt(project.value - extractedBaseAmount) : 
            BigInt(project.value);
        
        const remainingBaseToken = isERGBase ? 
            BigInt(0) : 
            BigInt(currentBaseTokenAmount - extractedBaseAmount);
        
        const contractOutput = new OutputBuilder(
            remainingErg,
            get_address(project.constants, project.version)
        ).addTokens({
            tokenId: project.project_id,
            amount: BigInt(project.current_idt_amount) // APT remains constant
        });
    
        // Add PFT tokens if they exist (ProofFundingTokenRemainsConstant)
        if (project.current_pft_amount > 0) {
            contractOutput.addTokens({
                tokenId: project.token_id,
                amount: BigInt(project.current_pft_amount)
            });
        }
        
        // Handle remaining base tokens for multi-token contracts
        if (isMultiToken && remainingBaseToken > 0) {
            contractOutput.addTokens({
                tokenId: project.base_token_id!,
                amount: remainingBaseToken
            });
        }
    
        // Set registers - all counters remain constant for withdrawal
        if (project.version === "v1_2") {
            const base_token_id_len = project.base_token_id ? project.base_token_id.length / 2 : 0;
            contractOutput.setAdditionalRegisters({
                R4: SInt(project.block_limit).toHex(),
                R5: SLong(BigInt(project.minimum_amount)).toHex(),
                R6: SColl(SLong, [BigInt(project.sold_counter), BigInt(project.refund_counter), BigInt(project.auxiliar_exchange_counter)]).toHex(),
                R7: SColl(SLong, [BigInt(project.exchange_rate), BigInt(base_token_id_len)]).toHex(),
                R8: SString(project.constants.raw ?? ""),
                R9: SString(project.content.raw)
            });
        } else {
            contractOutput.setAdditionalRegisters({
                R4: SInt(project.block_limit).toHex(),
                R5: SLong(BigInt(project.minimum_amount)).toHex(),
                R6: SColl(SLong, [BigInt(project.sold_counter), BigInt(project.refund_counter), BigInt(project.auxiliar_exchange_counter)]).toHex(),
                R7: SLong(BigInt(project.exchange_rate)).toHex(),
                R8: SString(project.constants.raw ?? ""),
                R9: SString(project.content.raw)
            });
        }
        outputs.push(contractOutput);
    }
    // If isFullWithdrawal is true, no contract output is created (contract ends)

    // Project output (OUTPUTS(1) in contract)
    if (isERGBase) {
        // For ERG-based, project receives ERG
        outputs.push(
            new OutputBuilder(
                BigInt(projectAmount),
                walletPk
            )
        );
    } else {
        // For multi-token, project receives base tokens
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,  // Minimum ERG for the box
                walletPk
            ).addTokens({
                tokenId: project.base_token_id!,
                amount: BigInt(projectAmount)
            })
        );
    }

    // Dev fee output (OUTPUTS(2) in contract) - only if devFeeAmount > 0
    if (devFeeAmount > 0) {
        if (isERGBase) {
            // For ERG-based, dev receives ERG
            outputs.push(
                new OutputBuilder(
                    BigInt(devFeeAmount),
                    devAddress
                )
            );
        } else {
            // For multi-token, dev receives base tokens
            outputs.push(
                new OutputBuilder(
                    SAFE_MIN_BOX_VALUE,  // Minimum ERG for the box
                    devAddress
                ).addTokens({
                    tokenId: project.base_token_id!,
                    amount: BigInt(devFeeAmount)
                })
            );
        }
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(BigInt(1100000))               // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    try {
        // Sign the transaction
        const signedTransaction = await signTransaction(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await submitTransaction(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e)
        return null;
    }
}