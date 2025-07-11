import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';

import { SString } from '../utils';
import { type Project } from '../../common/project';
import { get_address } from '../contract';
import { SColl } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function buy_refund(
    project: Project,
    token_amount: number
): Promise<string|null> {

    /*
        Token amount positive means buy action.
        Token amount negative means refund action.
    */

    token_amount = Math.floor(token_amount * Math.pow(10, project.token_details.decimals));

    // Calculate base token amount based on project's base token
    const isERGBase = !project.base_token_id || project.base_token_id === "";
    let base_token_amount = Math.abs(token_amount) * project.exchange_rate;

    // Get the wallet address (will be the user address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await ergo.get_utxos())];

    // Calculate ERG value for the contract
    let contractErgValue = project.value;
    if (isERGBase) {
        if (token_amount > 0) {
            // Buy: add ERG to contract
            contractErgValue = project.value + base_token_amount;
        } else {
            // Refund: subtract ERG from contract
            contractErgValue = project.value - base_token_amount;
        }
    }

    // Building the project output
    let output = new OutputBuilder(
        BigInt(contractErgValue).toString(),
        get_address(project.constants, project.version)
    )
    .addTokens({
        tokenId: project.project_id,
        amount: BigInt(project.current_idt_amount - token_amount)  // Buy: extract tokens, Refund: add tokens
    });

    // Add PFT tokens if they exist
    if (project.current_pft_amount > 0) {
        output.addTokens({
            tokenId: project.token_id,
            amount: BigInt(project.current_pft_amount)  // PFT token maintains constant
        });
    }

    // Handle base token changes for non-ERG base tokens
    if (!isERGBase && project.base_token_id) {
        // Find current base token amount in the project box
        let currentBaseTokenAmount = 0;
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = Number(token.amount);
                break;
            }
        }
        
        // Calculate new base token amount
        let newBaseTokenAmount;
        if (token_amount > 0) {
            // Buy: add base tokens to contract
            newBaseTokenAmount = currentBaseTokenAmount + base_token_amount;
        } else {
            // Refund: subtract base tokens from contract
            newBaseTokenAmount = currentBaseTokenAmount - base_token_amount;
        }
        
        // Add base token with updated amount
        output.addTokens({
            tokenId: project.base_token_id,
            amount: BigInt(newBaseTokenAmount)
        });
    }

    // Update counters
    let sold_counter = BigInt(token_amount > 0 ? project.sold_counter + token_amount : project.sold_counter);
    let refund_counter = BigInt(token_amount < 0 ? project.refund_counter + Math.abs(token_amount) : project.refund_counter);
    
    // Handle different register formats based on contract version
    if (project.version === "v1_2") {
        // v1_2 uses new register format with base token support
        const base_token_id_len = project.base_token_id ? project.base_token_id.length / 2 : 0;
        output.setAdditionalRegisters({
            R4: SInt(project.block_limit).toHex(),
            R5: SLong(BigInt(project.minimum_amount)).toHex(),
            R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),
            R7: SColl(SLong, [BigInt(project.exchange_rate), BigInt(base_token_id_len)]).toHex(),
            R8: SString(project.constants.raw ?? ""),
            R9: SString(project.content.raw)
        });
    } else {
        // Legacy format for v1_0 and v1_1 (ERG only)
        output.setAdditionalRegisters({
            R4: SInt(project.block_limit).toHex(),
            R5: SLong(BigInt(project.minimum_amount)).toHex(),
            R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),
            R7: SLong(BigInt(project.exchange_rate)).toHex(),
            R8: SString(project.constants.raw ?? ""),
            R9: SString(project.content.raw)
        });
    }
    
    let outputs = [output];

    // Create user outputs based on action type
    if (token_amount > 0) {
        // Buy: user gets project tokens
        let userOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk)
            .addTokens({
                tokenId: project.project_id,
                amount: token_amount.toString()
            });
        outputs.push(userOutput);
    } else if (token_amount < 0) {
        // Refund: user gets base tokens back
        if (isERGBase) {
            // For ERG refunds, user gets ERG
            let userOutput = new OutputBuilder(
                (base_token_amount + SAFE_MIN_BOX_VALUE).toString(), // Add minimum box value
                walletPk
            );
            outputs.push(userOutput);
        } else if (project.base_token_id) {
            // For token refunds, user gets base tokens
            let userOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk)
                .addTokens({
                    tokenId: project.base_token_id,
                    amount: base_token_amount.toString()
                });
            outputs.push(userOutput);
        }
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();
    
    try {
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log("Transaction error:", e);
        throw e; // Re-throw to help with debugging
    }
}