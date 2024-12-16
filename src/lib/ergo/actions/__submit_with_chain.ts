import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box
} from '@fleet-sdk/core';
import { SInt, SPair } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/project';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details, wait_until_confirmation } from '../fetch';

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

// Function to submit a project to the blockchain
export async function submit_project(
    token_id: string, 
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate ERG/Token
    projectContent: string,    // Project content
    minimumSold: number,     // Minimum amount sold to allow withdrawal
    title: string
): Promise<string|null> {

    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();

    let addressContent: ConstantContent = {
        "owner": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id
    };

    // Get token emission amount.
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"];
    let id_token_decimals = token_data["decimals"];

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    let mintOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(addressContent)
        )
        .mintToken({ 
            amount: BigInt(id_token_amount),
            name: title+" APT",    // A pro for use IDT (identity token) and TFT (temporal funding token) with the same token is that the TFT token that the user holds has the same id than the project.  This allows the user to verify the exact project in case than two projects has the same name.
            decimals: id_token_decimals, 
            description: "Temporal-funding Token for the " + title + " project. Please, exchange the PFT for the project token on Bene once the deadline has passed."
        });

    let contractOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            get_address(addressContent)    // Address of the project contract
        )
        .addTokens({
            tokenId: inputs[0].boxId,
            amount: BigInt(id_token_amount)  // The mint contract force to spend all the id_token_amount
        })
        .addTokens({
            tokenId: token_id ?? "",
            amount: token_amount.toString()
        })
        .setAdditionalRegisters({
           R4: SInt(blockLimit).toHex(),                              // Block limit for withdrawals/refunds
           R5: SLong(BigInt(minimumSold)).toHex(),                    // Minimum sold
           R6: SPair(SLong(BigInt(0)), SLong(BigInt(0))).toHex(),     // Pair [Tokens sold counter, Tokens refunded counter]
           R7: SLong(BigInt(exchangeRate)).toHex(),                   // Exchange rate ERG/Token
           R8: SString(JSON.stringify(addressContent)),               // Owner address, dev address and dev fee.
           R9: SString(projectContent)                                // Project content
        });

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs) 
        .to(mintOutput)  
        .sendChangeTo(walletPk) 
        .payFee(RECOMMENDED_MIN_FEE_VALUE)  
        .build()
        .chain((builder) => 
            builder
                .to(contractOutput)
                .payFee(RECOMMENDED_MIN_FEE_VALUE)
                .build()
        )
        .toEIP12Object();

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}
