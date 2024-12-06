import {
    OutputBuilder,
    TransactionBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE
} from '@fleet-sdk/core';
import { get_dev_contract_address } from './dev_contract';

// Simplified function to send funds to specified addresses
export async function distributeFunds(
    box: any,
    brunoAddress: string,
    lgdAddress: string,
    jmAddress: string,
    orderAddress: string,
    brunoShare: number,
    lgdShare: number,
    jmShare: number,
    orderShare: number,
    totalAmount: number
): Promise<string | null> {
    try {
        let inputs = [box];

        // Calculate individual shares
        const brunoAmount = Math.floor((brunoShare / 100) * totalAmount);
        const lgdAmount = Math.floor((lgdShare / 100) * totalAmount);
        const jmAmount = Math.floor((jmShare / 100) * totalAmount);
        const orderAmount = Math.floor((orderShare / 100) * totalAmount);
        
        if (totalAmount == brunoAmount + lgdAmount + jmAmount + orderAmount) {
            throw new Error("Invalid shares.");
        }

        // Ensure valid distribution
        if (orderAmount < 0) {
            throw new Error("Invalid distribution: total shares exceed 100%");
        }

        // Build outputs for each recipient
        const outputs = [
            new OutputBuilder(SAFE_MIN_BOX_VALUE + brunoAmount, brunoAddress),
            new OutputBuilder(SAFE_MIN_BOX_VALUE + lgdAmount, lgdAddress),
            new OutputBuilder(SAFE_MIN_BOX_VALUE + jmAmount, jmAddress),
            new OutputBuilder(SAFE_MIN_BOX_VALUE + orderAmount, orderAddress)
        ];

        // Build and sign the transaction
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to(outputs)
            .sendChangeTo(get_dev_contract_address())
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();

        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Submit the transaction
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error distributing funds:", error);
        return null;
    }
}
