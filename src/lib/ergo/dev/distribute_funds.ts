import {
    OutputBuilder,
    TransactionBuilder
} from '@fleet-sdk/core';
import { get_dev_contract_address } from './dev_contract';
import { ErgoPlatform } from '../platform';

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
        await (new ErgoPlatform).connect();

        let inputs = [box];

        const minerFeeAmount = 1100000;

        totalAmount -= minerFeeAmount;

        // Calculate individual shares
        const brunoAmount = Math.floor((brunoShare / 100) * totalAmount);
        const lgdAmount = Math.floor((lgdShare / 100) * totalAmount);
        const jmAmount = Math.floor((jmShare / 100) * totalAmount);
        const orderAmount = Math.floor((orderShare / 100) * totalAmount);
        
        const calculatedTotal = brunoAmount + lgdAmount + jmAmount + orderAmount;

        if (totalAmount !== calculatedTotal) {
            throw new Error(
                `Invalid shares: The total amount (${totalAmount}) does not match the sum of calculated shares (${calculatedTotal}). Details: Bruno (${brunoAmount}), LGD (${lgdAmount}), JM (${jmAmount}), Order (${orderAmount}).`
            );
        }

        // Ensure valid distribution
        if (orderAmount < 0) {
            throw new Error("Invalid distribution: total shares exceed 100%");
        }

        // Build outputs for each recipient
        const outputs = [
            new OutputBuilder(BigInt(brunoAmount), brunoAddress),
            new OutputBuilder(BigInt(lgdAmount), lgdAddress),
            new OutputBuilder(BigInt(jmAmount), jmAddress),
            new OutputBuilder(BigInt(orderAmount), orderAddress)
        ];

        // Build and sign the transaction
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to(outputs)
            .payFee(BigInt(minerFeeAmount))
            .sendChangeTo(get_dev_contract_address())
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
