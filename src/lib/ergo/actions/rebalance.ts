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
export async function rebalance(
    project: Project,
    token_amount: number
): Promise<string|null> {
    
    token_amount = Math.floor(token_amount * Math.pow(10, project.token_details.decimals));
    
    console.log("wants to add ", token_amount)

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await ergo.get_utxos())];

    // Building the project output
    let contract_output = new OutputBuilder(
        BigInt(project.value),
        get_address(project.constants)
    )
    .addTokens({
        tokenId: project.project_id,
        amount: BigInt(project.current_idt_amount)
    });

    console.log("PFT current amount "+project.current_pft_amount /  Math.pow(10, project.token_details.decimals))
    let contract_token_amount = project.current_pft_amount + token_amount;
    console.log("contract token amount "+contract_token_amount /  Math.pow(10, project.token_details.decimals))
    if (contract_token_amount > 0) {
        contract_output.addTokens({
            tokenId: project.token_id,
            amount: (contract_token_amount).toString()
        });
    }

    contract_output.setAdditionalRegisters({
        R4: SInt(project.block_limit).toHex(),                        // Block limit for withdrawals/refunds
        R5: SLong(BigInt(project.minimum_amount)).toHex(),            // Minimum sold
        R6: SColl(SLong, [
            BigInt(project.sold_counter), 
            BigInt(project.refund_counter), 
            BigInt(project.auxiliar_exchange_counter)
        ]).toHex(),
        R7: SLong(BigInt(project.exchange_rate)).toHex(),             // Exchange rate ERG/Token
        R8: SString(project.constants.raw ?? ""),                   // Withdrawal address (hash of walletPk)
        R9: SString(project.content.raw)                              // Project content
    });
    let outputs: OutputBuilder[] = [contract_output];
    
    // Building withdraw to address output
    if (token_amount < 0) {
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,
                walletPk
            )
            .addTokens({
                tokenId: project.token_id,
                amount: ((-1)*token_amount).toString()
            })
        )
    }

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}
