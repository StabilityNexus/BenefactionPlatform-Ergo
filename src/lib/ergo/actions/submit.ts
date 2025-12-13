
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
import { fetch_token_details, wait_until_confirmation } from '../fetch';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';
import { reserveBoxes, releaseBoxes, registerPendingTx, areBoxesReserved } from '$lib/common/pending-utxos';
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

function playBeep(frequency = 1000, duration = 3000) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.setValueAtTime(0.25, now + 0.5);
    gain.gain.linearRampToValueAtTime(0, now + 0.55);

    osc.start(now);
    osc.stop(now + 0.55);
}

async function* mint_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number): AsyncGenerator<string, Box, void> {
    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await getUtxos();

    // Prevent double spend by reserving the wallet inputs
    if (areBoxesReserved(inputs)) {
        throw new Error('Input box already reserved by a pending transaction; wait until confirmation or try again later.');
    }
    const reserved = reserveBoxes(inputs);
    if (!reserved) {
        throw new Error('Input box already reserved by a pending transaction; wait until confirmation or try again later.');
    }

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(constants, version)
        )
            .mintToken({
                amount: BigInt(amount),
                name: title + " APT",    // A pro for use IDT (identity token) and TFT (temporal funding token) with the same token is that the TFT token that the user holds has the same id than the project.  This allows the user to verify the exact project in case than two projects has the same name.
                decimals: decimals,
                description: "Temporal-funding Token for the " + title + " project."
            })
    ]

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    yield "Please sign the mint transaction...";

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Mint tx id: " + transactionId);

    // Register pending tx cleanup
    registerPendingTx(transactionId, inputs).catch(err => {
        console.warn('Failed to register pending tx cleanup for mint transaction:', err);
        try { releaseBoxes(inputs); } catch (e) { /* ignore */ }
    });

    yield "Waiting for mint confirmation... (this may take a few minutes)";

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.")
        throw new Error("Mint tx failed.")
    }

    return box
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

    // Build the mint tx.
    yield "Preparing mint transaction...";
    const mintGen = mint_tx(title, addressContent, version, id_token_amount, token_data["decimals"]);
    let mintResult = await mintGen.next();
    while (!mintResult.done) {
        yield mintResult.value;
        mintResult = await mintGen.next();
    }
    let mint_box = mintResult.value;

    let project_id = mint_box.assets[0].tokenId;

    if (project_id === null) { alert("Token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await window.ergo!.get_utxos()];

    if (areBoxesReserved(inputs)) {
        alert('Some inputs are currently used by a pending transaction, wait for confirmation or try again later.');
        return null;
    }
    const reserved = reserveBoxes(inputs);
    if (!reserved) { alert('Failed to reserve inputs for transaction; please try again later.'); return null; }

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

    // Building the project output
    let outputs: OutputBuilder[] = [new OutputBuilder(
        minRequiredValue,                       // Minimum value in ERG that a box can have
        ergoTreeAddress        // Address of the project contract
    )
        .addTokens([
            {
                tokenId: project_id,
                amount: BigInt(id_token_amount)     // The mint contract force to spend all the id_token_amount
            },
            {
                tokenId: token_id ?? "",
                amount: token_amount.toString()
            }
        ])
        .setAdditionalRegisters({
            R4: r4Hex,
            R5: r5Hex,
            R6: r6Hex,
            R7: r7Hex,
            R8: r8Hex,
            R9: r9Hex
        })];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    try {
        playBeep();
    } catch (error) {
        console.error('Error executing play beep:', error);
    }

    yield "Please sign the project transaction...";

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    // Register pending tx cleanup for main submission
    registerPendingTx(transactionId, inputs).catch(err => {
        console.warn('Failed to register pending tx cleanup: ', err);
        try { releaseBoxes(inputs); } catch (e) { /* ignore */ }
    });
    return transactionId;
}
