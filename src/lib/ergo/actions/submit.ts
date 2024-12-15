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

async function get_emission_amount(token_id: string): Promise<number> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return id_token_amount
}

async function mint_tx(constants: ConstantContent, amount: number): Promise<Box> {
    // Get the wallet address (will be the project address)
    const walletPk = await ergo.get_change_address();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(constants)
        )
        .mintToken({ 
            amount: BigInt(amount),
            name: "TestToken",
            decimals: 2, 
            description: "This is a test token minted with Fleet SDK"
          }) 
    ]

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

    console.log("Mint tx id: "+transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.")
        throw new Error("Mint tx failed.")
    }

    console.log("Token created "+ (await fetch_token_details(inputs[0].boxId)).name)
    console.log("Token minted id: "+inputs[0].boxId)
    return box
}

// Function to submit a project to the blockchain
export async function submit_project(
    token_id: string, 
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate ERG/Token
    projectContent: string,    // Project content
    minimumSold: number     // Minimum amount sold to allow withdrawal
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
    let id_token_amount = await get_emission_amount(token_id);

    // Build the mint tx.
    let mint_box = await mint_tx(addressContent, id_token_amount);
    let project_id = mint_box.assets[0].tokenId;

    if (project_id === null) { alert("Token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await ergo.get_utxos()];

    // Building the project output
    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            get_address(addressContent)    // Address of the project contract
        )
        .addTokens({
            tokenId: project_id,
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
        })
    ];

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
