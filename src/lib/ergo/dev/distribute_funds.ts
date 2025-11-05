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
    totalAmount: number,
    tokenId?: string
): Promise<string | null> {
    try {
        await (new ErgoPlatform).connect();

        const minerFeeAmount = 1100000;
        const isTokenDistribution = !!tokenId;
        const SAFE_MIN_BOX_VALUE = 1000000; // Minimum ERG for token boxes

        // For token distributions, we need wallet UTXOs to cover ERG for outputs
        let inputs = [box];
        if (isTokenDistribution && window.ergo) {
            const walletUtxos = await window.ergo!.get_utxos();
            inputs = [box, ...walletUtxos];
        }

        // Only subtract miner fee from ERG distributions
        if (!isTokenDistribution) {
            totalAmount -= minerFeeAmount;
        }

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
        const outputs = [];
        
        if (isTokenDistribution) {
            // Token distribution - each output needs minimum ERG + tokens
            outputs.push(
                new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), brunoAddress)
                    .addTokens({ tokenId, amount: BigInt(brunoAmount) })
            );
            outputs.push(
                new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), lgdAddress)
                    .addTokens({ tokenId, amount: BigInt(lgdAmount) })
            );
            outputs.push(
                new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), jmAddress)
                    .addTokens({ tokenId, amount: BigInt(jmAmount) })
            );
            outputs.push(
                new OutputBuilder(BigInt(SAFE_MIN_BOX_VALUE), orderAddress)
                    .addTokens({ tokenId, amount: BigInt(orderAmount) })
            );
        } else {
            // ERG distribution
            outputs.push(new OutputBuilder(BigInt(brunoAmount), brunoAddress));
            outputs.push(new OutputBuilder(BigInt(lgdAmount), lgdAddress));
            outputs.push(new OutputBuilder(BigInt(jmAmount), jmAddress));
            outputs.push(new OutputBuilder(BigInt(orderAmount), orderAddress));
        }

        // Get wallet address for change
        const changeAddress = isTokenDistribution && window.ergo 
            ? await window.ergo!.get_change_address()
            : get_dev_contract_address();

        // Build and sign the transaction
        const unsignedTransaction = await new TransactionBuilder(await window.ergo!.get_current_height())
            .from(inputs)
            .to(outputs)
            .payFee(BigInt(minerFeeAmount))
            .sendChangeTo(changeAddress)  // For tokens: send change to wallet, for ERG: to dev contract
            .build()
            .toEIP12Object();

        const signedTransaction = await window.ergo!.sign_tx(unsignedTransaction);

        // Submit the transaction
        const transactionId = await window.ergo!.submit_tx(signedTransaction);

        console.log("Transaction ID:", transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error distributing funds:", error);
        return null;
    }
}
