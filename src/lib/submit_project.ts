import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder
} from '@fleet-sdk/core';

import { ergo_tree_address } from './envs';
import { stringToSerialized } from './utils';

// Function to submit a project to the blockchain
export async function submit_project(
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    tokenAmount: number,    // Amount of tokens being created
    exchangeRate: number,   // Exchange rate ERG/Token
    projectLink: string,    // Link or hash containing project information
    minimumSold: number     // Minimum amount sold to allow withdrawal
): Promise<string|null> {
    
    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    // Building the project output
    let outputs: OutputBuilder[] = [];
    const projectOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
        ergo_tree_address    // Address of the project contract
    );

    // Minting a new token since tokenId is always null
    projectOutput.mintToken({
        amount: tokenAmount.toString() // Amount of tokens being minted
    });

    // Set additional registers in the output box
    projectOutput.setAdditionalRegisters({
        R4: '',
        R5: stringToSerialized(blockLimit.toString()),      // Block limit for withdrawals/refunds
        R6: stringToSerialized(exchangeRate.toString()),    // Exchange rate ERG/Token
        R7: stringToSerialized(walletPk),                   // Withdrawal address (projectAddress is walletPk)
        R8: stringToSerialized(projectLink),                // Link or hash with project info
        R9: stringToSerialized(minimumSold.toString())      // Minimum amount sold
    });

    // Add the project box to the outputs list
    outputs.push(projectOutput);

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
