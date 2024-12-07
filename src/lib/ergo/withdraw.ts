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
import { get_dev_contract_address } from './dev/dev_contract';

// Function to submit a project to the blockchain
export async function withdraw(
    project: Project,
    amount: number
): Promise<string|null> {
    
    amount = amount * Math.pow(10, 9);
    
    console.log("wants withdraw ", amount)

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await ergo.get_utxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];

    const devAddress = project.constants.dev_addr ?? get_dev_contract_address();  // If the constants do not contain the address and the development contract on the code base has changed, the transaction cannot be executed. In that case it is necessary to run the application from the commit with which the contract was created.
    const devFeePercentage = project.constants.dev_fee;
    let devAmount = amount * devFeePercentage/100;
    let projectAmount = BigInt(amount) - BigInt(devAmount) - RECOMMENDED_MIN_FEE_VALUE;

    let number_of_dev_holders = BigInt(4);  // Should be variable.
    if (projectAmount < SAFE_MIN_BOX_VALUE || devAmount < SAFE_MIN_BOX_VALUE * number_of_dev_holders) {
        alert("The amount must be greater.")  // TODO improve the message.
    }

    if (project.value > amount) {
        const contractOutput = new OutputBuilder(
            BigInt(project.value - amount),
            get_address(project.constants)    // Address of the project contract
        );
    
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
            R8: SString(project.constants.raw ?? ""),                              // Dev content
            R9: SString(project.content.raw)                           // Project content
        });
        outputs.push(contractOutput);
    }

    outputs.push(
        new OutputBuilder(
            projectAmount,
            walletPk
        )
    )

    const devOutput = new OutputBuilder(
        BigInt(devAmount),
        devAddress
    )
    outputs.push(devOutput);

    console.log(inputs)
    console.log(outputs)

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
