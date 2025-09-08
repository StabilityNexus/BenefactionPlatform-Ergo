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
    
    // Convert amount to smallest unit
    if (isERGBase) {
        // For ERG-based contracts, convert to nanoERG
        amount = amount * Math.pow(10, 9);
    } else {
        // For token-based contracts, convert to smallest unit using token decimals
        const baseTokenDecimals = project.base_token_details?.decimals || 0;
        amount = amount * Math.pow(10, baseTokenDecimals);
    }
    
    console.log("wants withdraw ", amount, isERGBase ? "(ERG)" : "(base token)")

    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();
    
    // Validate that the connected wallet is the project owner
    const projectOwnerAddress = project.constants.owner;
    console.log("Project owner address:", projectOwnerAddress);
    console.log("Connected wallet address:", walletPk);
    
    if (walletPk !== projectOwnerAddress) {
        console.error("Error: Connected wallet is not the project owner. Owner:", projectOwnerAddress, "Connected:", walletPk);
        alert("Only the project owner can withdraw funds from the contract");
        return null;
    }
    
    // Get the UTXOs from the current wallet to use as inputs
    const walletUtxos = await window.ergo!.get_utxos();
    const inputs = [project.box, ...walletUtxos];
    
    // Calculate minimum ERG needed for the transaction
    let minErgNeeded = BigInt(1100000); // Transaction fee
    
    if (!isERGBase) {
        // For token withdrawals, we need ERG for output boxes
        minErgNeeded += SAFE_MIN_BOX_VALUE; // Project output box (always needed)
        
        // Get current base token amount to check withdrawal limits
        const currentBaseTokenAmount = project.box.assets.find(a => a.tokenId === project.base_token_id)?.amount || 0;
        const extractedAmount = Math.min(amount, Number(currentBaseTokenAmount));
        
        // Check if dev fee output will be created
        const devFeeAmount = Math.floor(extractedAmount * project.constants.dev_fee / 100);
        const willReplicate = extractedAmount < Number(currentBaseTokenAmount) || project.current_pft_amount > 0;
        
        // Dev output is needed if: devFeeAmount > 0 OR it's a partial withdrawal
        const shouldHaveDevOutput = devFeeAmount > 0 || willReplicate;
        if (shouldHaveDevOutput) {
            minErgNeeded += SAFE_MIN_BOX_VALUE; // Dev output box
        }
        
        // Check if contract will be replicated (partial withdrawal)
        if (willReplicate) {
            // Contract replication box already has ERG from project.value
            // But we still count it in our minimum calculation
            // The contract box will use its existing ERG value
        }
        
        // Validate that we have enough ERG from inputs
        const totalErg = inputs.reduce((sum, box) => sum + BigInt(box.value), BigInt(0));
        if (totalErg < minErgNeeded) {
            alert(`Insufficient ERG in wallet. Need at least ${Number(minErgNeeded) / 1e9} ERG to cover transaction costs.`);
            console.error(`Need ${minErgNeeded} nanoERG, but only have ${totalErg} nanoERG available`);
            return null;
        }
    }

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
        // Important: Must maintain token order - APT first, then PFT if it exists
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

    // Project output (OUTPUTS(1) for partial withdrawal, OUTPUTS(0) for full withdrawal)
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

    // Dev fee output (OUTPUTS(2) for partial withdrawal, OUTPUTS(1) for full withdrawal with fee)
    // According to contract logic: shouldHaveDevOutput = devFeeAmount > 0 || !allFundsWithdrawn || !allTokensWithdrawn
    const shouldHaveDevOutput = devFeeAmount > 0 || !isFullWithdrawal;
    
    if (shouldHaveDevOutput && devFeeAmount > 0) {
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
    } else if (shouldHaveDevOutput && devFeeAmount === 0) {
        // Edge case: partial withdrawal with 0 dev fee still needs an output for contract validation
        // This happens when the withdrawal amount is very small
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,
                devAddress
            )
        );
    }

    console.log(outputs)

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