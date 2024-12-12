import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    TransactionBuilder
} from '@fleet-sdk/core';
import { get_dev_contract_address } from './dev_contract';
import { ErgoPlatform } from '../platform';

// Function to submit a project to the blockchain
export async function submit_test(): Promise<void> {

    await (new ErgoPlatform).connect();

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [ ...(await ergo.get_utxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];

    const devAddress = get_dev_contract_address(); 
    
    const devOutput = new OutputBuilder(
        BigInt(5)*SAFE_MIN_BOX_VALUE,
        devAddress
    )
    outputs.push(devOutput);

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(BigInt(SAFE_MIN_BOX_VALUE))               // Pay the recommended minimum fee
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
