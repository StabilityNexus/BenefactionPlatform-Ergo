import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong
} from '@fleet-sdk/core';
import { SInt } from '@fleet-sdk/serializer';
import { SString } from './utils';
import { get_address } from './contract';
import { dev_address, dev_fee } from './envs';
import { type ConstantContent } from '$lib/common/project';

// Function to submit a project to the blockchain
export async function submit_project(
    token_id: string | null, 
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate ERG/Token
    projectContent: string,    // Project content
    minimumSold: number     // Minimum amount sold to allow withdrawal
): Promise<string|null> {

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    let addressContent: ConstantContent = {
        "owner": walletPk,
        "dev": dev_address,
        "dev_fee": dev_fee
    };

    // Building the project output
    let outputs: OutputBuilder[] = [];
    const projectOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
        get_address(addressContent)    // Address of the project contract
    );

    if (token_id === null) {
        projectOutput.mintToken({
            amount: token_amount?.toString() ?? "1000000000"
        });
    } else {
        projectOutput.addTokens({
            tokenId: token_id,
            amount: token_amount.toString()
          }, {sum: false})
    }
    
    // Set additional registers in the output box
    projectOutput.setAdditionalRegisters({
       R4: SInt(blockLimit).toHex(),                              // Block limit for withdrawals/refunds
       R5: SLong(BigInt(minimumSold)).toHex(),                    // Minimum sold
       R6: SLong(BigInt(0)).toHex(),                              // Tokens sold counter
       R7: SLong(BigInt(exchangeRate)).toHex(),                   // Exchange rate ERG/Token
       R8: SString(JSON.stringify(addressContent)),                               // Owner address, dev address and dev fee.
       R9: SString(projectContent)                                // Project content
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