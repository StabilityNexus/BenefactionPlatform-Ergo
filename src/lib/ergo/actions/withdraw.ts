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
import { get_dev_contract_address } from '../dev/dev_contract';
import { SColl, SPair } from '@fleet-sdk/serializer';

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
    let projectAmount = BigInt(amount) - BigInt(devAmount) - BigInt(1100000);

    let number_of_dev_holders = BigInt(4);  // Should be variable.
    if (projectAmount < SAFE_MIN_BOX_VALUE || devAmount < SAFE_MIN_BOX_VALUE * number_of_dev_holders) {
        alert("The amount must be greater.")  // TODO improve the message.
        return null;
    }

    if (project.value > amount) {  // project.value represents the current ERG balance plus the minimum box value. Therefore, the maximum probable amount is likely equal to project.value minus the minimum box value (managed through the interface).
        const contractOutput = new OutputBuilder(
            BigInt(project.value - amount),
            get_address(project.constants, project.version)    // Address of the project contract
        ).addTokens({
            tokenId: project.project_id,
            amount: BigInt(project.current_idt_amount)
        });
    
        if (project.current_pft_amount > 0) {
            contractOutput.addTokens({
                tokenId: project.token_id,
                amount: BigInt(project.current_pft_amount)
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
            
            // Add base token to contract output (amount remains unchanged during ERG withdrawal)
            if (currentBaseTokenAmount > 0) {
                contractOutput.addTokens({
                    tokenId: project.base_token_id,
                    amount: BigInt(currentBaseTokenAmount)
                });
            }
        }
    
        // Set additional registers in the output box based on contract version
        if (project.version === "v1_2") {
            // v1_2 uses new register format with base token support
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
            // Legacy format for v1_0 and v1_1 (ERG only)
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

    outputs.push(
        new OutputBuilder(
            projectAmount,
            walletPk
        )
    );

    outputs.push(
        new OutputBuilder(
            BigInt(devAmount),
            devAddress
        )
    );

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(BigInt(1100000))               // Pay the recommended minimum fee
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
