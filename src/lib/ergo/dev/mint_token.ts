import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    SAFE_MIN_BOX_VALUE,
    TransactionBuilder
} from '@fleet-sdk/core';
import { get_dev_contract_address } from './dev_contract';
import { ErgoPlatform } from '../platform';

export async function mint_token(amount: number, name: string, decimals: number): Promise<void> {
    try {
        await (new ErgoPlatform).connect();

        // Build and sign the transaction
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(await ergo.get_utxos())
            .to(
                new OutputBuilder(SAFE_MIN_BOX_VALUE, await ergo.get_change_address())
                  .mintToken({ 
                    amount: amount.toString(),  // the amount of tokens being minted without decimals
                    name: name,  // the name of the token
                    decimals: decimals,  // the number of decimals
                    description: "This is a test token minted with Fleet SDK"
                  }) 
              )
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .sendChangeTo(await ergo.get_change_address())
            .build()
            .toEIP12Object();

        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Submit the transaction
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction ID:", transactionId);
    } catch (error) {
        console.error("Error distributing funds:", error);
    }
}
