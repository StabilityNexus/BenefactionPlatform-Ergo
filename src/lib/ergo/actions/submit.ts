import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box,
    BOX_VALUE_PER_BYTE,
    ErgoAddress
} from '@fleet-sdk/core';
import { SBool, SColl, SPair } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_ergotree_hex, mint_contract_address } from '../contract';
import { createR8Structure, type ConstantContent } from '$lib/common/project';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details } from '../fetch';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';
import {
    validateProjectContent,
    type ProjectContent,
    estimateRegisterSizes,
    estimateTotalBoxSize
} from '../utils/box-size-calculator';

async function get_token_data(token_id: string): Promise<{ amount: number, decimals: number }> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id + " token emission amount is 0."); throw new Error(token_id + " token emission amount is 0.") }
    id_token_amount += 1;
    return { "amount": id_token_amount, "decimals": token_fetch['decimals'] }
}

// Function to submit a project to the blockchain
export async function* submit_project(
    version: contract_version,
    token_id: string,
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    is_timestamp_limit: boolean, // Whether the limit is based on timestamp or block height
    exchangeRate: number,   // Exchange rate base_token/PFT
    projectContent: string,    // Project content (JSON with title, description, image, link)
    minimumSold: number,     // Minimum amount sold to allow withdrawal
    title: string,
    base_token_id: string = "",  // Base token ID for contributions (empty for ERG)
    owner_ergotree: string = ""  // Optional: Owner ErgoTree (if different from wallet)
): AsyncGenerator<string, string | null, void> {

    // Parse and validate project content
    let parsedContent: ProjectContent;
    try {
        parsedContent = JSON.parse(projectContent);
    } catch (error) {
        alert("Invalid project content format.");
        return null;
    }

    // Validate that the project content (title, description, image, link) fits within limits
    const validation = validateProjectContent(parsedContent);
    if (!validation.isValid) {
        alert(validation.message);
        return null;
    }

    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();

    let addressContent: ConstantContent = {
        "owner": owner_ergotree ? owner_ergotree : ErgoAddress.fromBase58(walletPk).ergoTree,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "pft_token_id": token_id,
        "base_token_id": base_token_id
    };

    // Get token emission amount.
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"] + 1;



    const inputs = await getUtxos();


    const r4Hex = SPair(SBool(is_timestamp_limit), SLong(BigInt(blockLimit))).toHex();
    const r5Hex = SLong(BigInt(minimumSold)).toHex();
    const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex();
    const r7Hex = SLong(BigInt(exchangeRate)).toHex();
    const r8Hex = createR8Structure(addressContent).toHex();
    const r9Hex = SString(projectContent);

    // Calculate register sizes using utility functions
    const registerSizes = estimateRegisterSizes(r4Hex, r5Hex, r6Hex, r7Hex, r8Hex, r9Hex);

    const ergoTreeAddress = get_ergotree_hex(addressContent, version);

    // Estimate total box size
    const totalEstimatedSize = estimateTotalBoxSize(
        ergoTreeAddress.length,
        3, // number of tokens (project_id, pft_token_id, and possibly base_token_id)
        registerSizes
    );


    let minRequiredValue = BOX_VALUE_PER_BYTE * BigInt(totalEstimatedSize);
    if (minRequiredValue < SAFE_MIN_BOX_VALUE) {
        minRequiredValue = SAFE_MIN_BOX_VALUE;
    }

    const mintOutput = new OutputBuilder(
      SAFE_MIN_BOX_VALUE,
      mint_contract_address(addressContent, version)
    ).mintToken({
      amount: BigInt(id_token_amount),
      name: title + " APT",
      decimals: token_data.decimals,
      description: "Temporal-funding Token for the " + title + " project."
    });

    // Token ID generated INSIDE the same transaction
    const projectTokenId = inputs[0].boxId;

    // 🔹 Output 2: Campaign box (uses minted token)
    const campaignOutput = new OutputBuilder(
      minRequiredValue,
      ergoTreeAddress
    )
      .addTokens([
        {
          tokenId: projectTokenId,
          amount: BigInt(id_token_amount)
        },
        {
          tokenId: token_id,
          amount: BigInt(token_amount)
        }
      ])
      .setAdditionalRegisters({
        R4: r4Hex,
        R5: r5Hex,
        R6: r6Hex,
        R7: r7Hex,
        R8: r8Hex,
        R9: r9Hex
      });
    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
    .from(inputs)                          // Inputs coming from the user's UTXOs
    .to([mintOutput, campaignOutput])                          // Outputs (the new project box)
    .sendChangeTo(walletPk)                // Send change back to the wallet
    .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
    .build()                               // Build the transaction
    .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    yield "Please sign the project transaction...";

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}
