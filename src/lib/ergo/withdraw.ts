import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from './utils';
import { type Project } from '../common/project';
import { get_address } from './contract';

// Function to submit a project to the blockchain
export async function withdraw(
    project: Project,
    amount: number
): Promise<string|null> {
    
    amount = amount * 1000000000
    console.log("wants withdraw ", amount)

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await ergo.get_utxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];
    const contractOutput = new OutputBuilder(
        BigInt(project.value - amount),
        get_address(project.constants)    // Address of the project contract
    );

    const devAddress = project.constants.dev;
    const devFeePercentage = project.constants.dev_fee;
    let devAmount = amount * devFeePercentage/100;

    contractOutput.addTokens({
        tokenId: project.token_id,
        amount: project.current_amount.toString()
    });

    // Set additional registers in the output box
    contractOutput.setAdditionalRegisters({
        R4: SInt(project.block_limit).toHex(),                     // Block limit for withdrawals/refunds
        R5: SLong(BigInt(project.minimum_amount)).toHex(),         // Minimum sold
        R6: SLong(BigInt(project.amount_sold)).toHex(),            // Tokens sold counter
        R7: SLong(BigInt(project.exchange_rate)).toHex(),          // Exchange rate ERG/Token
        R8: SString(project.constants.raw),                              // Dev content
        R9: SString(project.content.raw)                           // Project content
    });
    outputs.push(contractOutput);

    outputs.push(
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE + BigInt(amount),
            walletPk
        )
    )

    const devOutput = new OutputBuilder(
        BigInt(devAmount),
        devAddress
    )
    outputs.push(devOutput);

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
