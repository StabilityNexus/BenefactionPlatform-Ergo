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
    let base_token_amount = token_amount * project.exchange_rate;

    // Get the wallet address (will be the user address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await ergo.get_utxos())];

    // Calculate ERG value changes
    let ergValueChange = 0;
    if (isERGBase) {
        // For ERG base token, the ERG value of the contract changes
        ergValueChange = base_token_amount;
    }
    // For non-ERG base tokens, ERG value remains the same

    // Building the project output
    let output = new OutputBuilder(
        BigInt(project.value + ergValueChange).toString(),  // ERG value change only for ERG base token
        get_address(project.constants, project.version)    // Address of the project contract
    )
    .addTokens({
        tokenId: project.project_id,
        amount: BigInt(project.current_idt_amount - token_amount)  // On buy action: extract tokens, on refund: add tokens
    })
    .addTokens({
        tokenId: project.token_id,
        amount: BigInt(project.current_pft_amount)  // PFT token maintains constant
    });

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
        
        // Add base token with updated amount
        output.addTokens({
            tokenId: project.base_token_id,
            amount: BigInt(currentBaseTokenAmount + base_token_amount)  // On buy: add base tokens, on refund: subtract base tokens
        });
    }

    let sold_counter   = BigInt(token_amount > 0 ? project.sold_counter + token_amount : project.sold_counter);
    let refund_counter = BigInt(token_amount < 0 ? project.refund_counter - token_amount : project.refund_counter);
    
    // Handle different register formats based on contract version
    if (project.version === "v1_2") {
        // v1_2 uses new register format with base token support
        const base_token_id_len = project.base_token_id ? project.base_token_id.length / 2 : 0;
        output.setAdditionalRegisters({
            R4: SInt(project.block_limit).toHex(),                                                          // Block limit for withdrawals/refunds
            R5: SLong(BigInt(project.minimum_amount)).toHex(),                                              // Minimum sold
            R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),      
            R7: SColl(SLong, [BigInt(project.exchange_rate), BigInt(base_token_id_len)]).toHex(),          // [Exchange rate base_token/PFT, Base token ID length]
            R8: SString(project.constants.raw ?? ""),                                                       // Constants including base token ID
            R9: SString(project.content.raw)                                                                // Project content
        });
    } else {
        // Legacy format for v1_0 and v1_1 (ERG only)
        output.setAdditionalRegisters({
            R4: SInt(project.block_limit).toHex(),                                                          // Block limit for withdrawals/refunds
            R5: SLong(BigInt(project.minimum_amount)).toHex(),                                              // Minimum sold
            R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),      
            R7: SLong(BigInt(project.exchange_rate)).toHex(),                                               // Exchange rate ERG/Token
            R8: SString(project.constants.raw ?? ""),                                                       // Withdrawal address (hash of walletPk)
            R9: SString(project.content.raw)                                                                // Project content
        });
    }
    
    let outputs = [output];

    // Create user output for buy transactions
    if (token_amount > 0) {
        let userOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE,
            walletPk
        )
        .addTokens({
            tokenId: project.project_id,
            amount: (token_amount).toString()
        });

        outputs.push(userOutput);
    } else if (token_amount < 0 && !isERGBase && project.base_token_id) {
        // For refund transactions with non-ERG base tokens, create user output with base tokens
        let userOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE,
            walletPk
        )
        .addTokens({
            tokenId: project.base_token_id,
            amount: Math.abs(base_token_amount).toString()
        });

        outputs.push(userOutput);
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object
    
    try {
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e)
    }
}