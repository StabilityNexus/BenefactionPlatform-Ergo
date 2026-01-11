import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
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

    // Token amounts on-chain must be integers (smallest units).
    // We validate this early because we later convert `token_amount` to `bigint`.
    // Note: avoid `Number.isInteger/isSafeInteger` here to keep editor/tsserver compatibility
    // when `.svelte-kit/tsconfig.json` hasn't been generated yet.
    const MAX_SAFE_INT = 9007199254740991;
    if (token_amount < 0 || token_amount !== Math.floor(token_amount) || token_amount > MAX_SAFE_INT) {
        alert("Invalid token amount. It must be a non-negative safe integer (smallest units). ");
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

    /*
        Why chained transactions:
        - In Ergo's UTXO model, an output box can only be spent by a *later* transaction.
        - Minting creates a box protected by `mint_idt.es` that must be spent into the campaign contract.
        - We therefore build a *chained* pair of transactions (Tx A -> Tx B) and ask the wallet to sign
          the full bundle in a single prompt.

        Safety/correctness:
        - No confirmation wait is needed: Tx B references Tx A's output and both can be included in the
          same block. Either both confirm or neither does.
        - The minted token id is deterministic: it is derived from the first input box id of Tx A.
    */

    // Wallet UTXOs used to fund the chained bundle.
    const walletUtxos = await getUtxos();
    if (walletUtxos.length === 0) {
        alert("No wallet UTXOs available.");
        return null;
    }

    if (!token_id) {
        alert("Invalid PFT token id.");
        return null;
    }

    // CRITICAL: token id determinism.
    // The minted token id MUST equal the boxId of the FIRST input of the minting transaction.
    // We explicitly pick and lock `issuanceBox` to guarantee both:
    // - `project_id` correctness, and
    // - `issuanceBox` is actually the first input passed to FleetSDK.
    const issuanceBox = walletUtxos[0];
    const mintInputs = [issuanceBox, ...walletUtxos.filter((b: any) => b.boxId !== issuanceBox.boxId)];

    // Token id of an issued token is always the boxId of the first input of the issuance transaction.
    const project_id = issuanceBox.boxId;

    const r4Hex = SPair(SBool(is_timestamp_limit), SLong(BigInt(blockLimit))).toHex();
    const r5Hex = SLong(BigInt(minimumSold)).toHex();
    const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex();
    const r7Hex = SLong(BigInt(exchangeRate)).toHex();
    const r8Hex = createR8Structure(addressContent).toHex();
    const r9Hex = SString(projectContent);

    // Calculate register sizes using utility functions
    const registerSizes = estimateRegisterSizes(r4Hex, r5Hex, r6Hex, r7Hex, r8Hex, r9Hex);

    const ergoTreeAddress = get_ergotree_hex(addressContent, version);

    // Build token list programmatically.
    // CRITICAL: never use placeholder token ids (e.g. `token_id ?? ""`) because it can create invalid boxes.
    // Base token id is a *parameter* (in R8) and is not required to be present in the box at creation.
    const projectTokens: Array<{ tokenId: string; amount: bigint }> = [
        { tokenId: project_id, amount: BigInt(id_token_amount) },
        { tokenId: token_id, amount: BigInt(token_amount) }
    ];

    // Estimate total box size
    const totalEstimatedSize = estimateTotalBoxSize(
        ergoTreeAddress.length,
        projectTokens.length,
        registerSizes
    );


    let minRequiredValue = BOX_VALUE_PER_BYTE * BigInt(totalEstimatedSize);
    if (minRequiredValue < SAFE_MIN_BOX_VALUE) {
        minRequiredValue = SAFE_MIN_BOX_VALUE;
    }

    // Tx A output: mint box locked by `mint_idt.es`. It will be immediately spent by Tx B.
    const mintOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        mint_contract_address(addressContent, version)
    ).mintToken({
        amount: BigInt(id_token_amount),
        name: title + " APT",
        decimals: token_data["decimals"],
        description: "Temporal-funding Token for the " + title + " project."
    });

    // Tx B output #0: campaign/project box. This must be OUTPUTS(0) for `mint_idt.es` validation.
    const projectOutput = new OutputBuilder(
        minRequiredValue,
        ergoTreeAddress
    )
        .addTokens(projectTokens)
        .setAdditionalRegisters({
            R4: r4Hex,
            R5: r5Hex,
            R6: r6Hex,
            R7: r7Hex,
            R8: r8Hex,
            R9: r9Hex
        });

    // Build a chained bundle (Tx A -> Tx B). Wallet signs once.
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        // CRITICAL: force issuanceBox to be INPUTS(0) so minted token id is deterministic.
        .from(mintInputs)
        .to(mintOutput)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .chain((builder, parent) =>
            builder
                .from(parent.outputs[0])
                // CRITICAL: `mint_idt.es` requires the campaign box to be OUTPUTS(0) of Tx B.
                // Keep `projectOutput` as the first/only explicit output before change.
                .to(projectOutput)
                .payFee(RECOMMENDED_MIN_FEE_VALUE)
                .sendChangeTo(walletPk)
                .build()
        )
        .toEIP12Object();

    yield "Please sign the campaign creation transaction...";

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}
