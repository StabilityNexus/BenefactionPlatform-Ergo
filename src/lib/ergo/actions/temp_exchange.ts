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
import { get_ergotree_hex } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction } from '../wallet-utils';
import { SColl } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function temp_exchange(
    project: Project,
    token_amount: number
): Promise<string|null> {

    token_amount = Math.floor(token_amount * Math.pow(10, project.token_details.decimals));

    // Get the wallet address (will be the user address)
    const walletPk = await getChangeAddress();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await window.ergo!.get_utxos())];

    // Building the project output
    let contractOutput = new OutputBuilder(
        BigInt(project.value),
        get_ergotree_hex(project.constants, project.version)
    )
    .addTokens({
        tokenId: project.project_id,
        amount: BigInt(project.current_idt_amount + token_amount)
    });

    if (project.current_pft_amount !== token_amount) {
        contractOutput.addTokens({
            tokenId: project.token_id,
            amount: BigInt(project.current_pft_amount - token_amount)
        });
    }
    
    // Handle base tokens for v1_2 multitoken contracts
    if (project.version === "v1_2" && project.base_token_id && project.base_token_id !== "") {
        // Find current base token amount in the project box
        let currentBaseTokenAmount = 0;
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = Number(token.amount);
                break;
            }
        }
        
        // Add base token to contract output (amount remains unchanged during temp exchange)
        if (currentBaseTokenAmount > 0) {
            contractOutput.addTokens({
                tokenId: project.base_token_id,
                amount: BigInt(currentBaseTokenAmount)
            });
        }
    }

    // Set additional registers based on contract version
    contractOutput.setAdditionalRegisters({
        R4: SInt(project.block_limit).toHex(),
        R5: SLong(BigInt(project.minimum_amount)).toHex(),
        R6: SColl(SLong, [BigInt(project.sold_counter), BigInt(project.refund_counter), BigInt(project.auxiliar_exchange_counter + token_amount)]).toHex(),
        R7: SLong(BigInt(project.exchange_rate)).toHex(),
        R8: SString(project.constants.raw ?? ""),
        R9: SString(project.content.raw)
    });

    let walletOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        walletPk
    )
    .addTokens({
        tokenId: project.token_id,
        amount: BigInt(token_amount)
    })

    let outputs = [contractOutput, walletOutput];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
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
    }
}
