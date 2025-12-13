
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
    if (id_token_amount === 0) {
        alert(token_id + " token emission amount is 0.");
        throw new Error(token_id + " token emission amount is 0.")
    }
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

/**
 * Submit a project to the blockchain using a chained transaction
 * 
 * This function creates a single chained transaction that:
 * 1. Mints a new token (APT + IDT) in the first part
 * 2. Creates the campaign box using the minted token in the second part
 * 
 * Benefits over the old two-transaction approach:
 * - User signs only once (better UX)
 * - No waiting for confirmation between transactions
 * - Atomic operation (both succeed or both fail)
 * - Faster campaign creation
 * 
 * @param version - Contract version to use
 * @param token_id - PFT token ID for contributions
 * @param token_amount - Amount of PFT tokens
 * @param blockLimit - Block height or timestamp limit
 * @param is_timestamp_limit - Whether limit is timestamp-based
 * @param exchangeRate - Exchange rate base_token/PFT
 * @param projectContent - JSON string with project details
 * @param minimumSold - Minimum amount to allow withdrawal
 * @param title - Project title
 * @param base_token_id - Base token for contributions (empty for ERG)
 * @param owner_ergotree - Optional owner ErgoTree
 * @returns Transaction ID or null on failure
 */
export async function submit_project(
    version: contract_version,
    token_id: string,
    token_amount: number,
    blockLimit: number,
    is_timestamp_limit: boolean,
    exchangeRate: number,
    projectContent: string,
    minimumSold: number,
    title: string,
    base_token_id: string = "",
    owner_ergotree: string = ""
): Promise<string | null> {

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

    // Get token emission amount
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"] + 1;

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await getUtxos();

    // In a chained transaction, the token ID will be the first input's boxId
    // This is because Ergo's token ID = box ID of the box that minted it
    const project_id = inputs[0].boxId;

    console.log("Predicted token ID:", project_id);

    // Build the mint output (first part of chained transaction)
    let mintOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        mint_contract_address(addressContent, version)
    )
        .mintToken({
            amount: BigInt(id_token_amount),
            name: title + " APT",
            decimals: token_data["decimals"],
            description: "Temporal-funding Token for the " + title + " project."
        });

    // Prepare registers for the campaign box
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

    // Build the campaign output (second part of chained transaction)
    let contractOutput = new OutputBuilder(
        minRequiredValue,
        ergoTreeAddress
    )
        .addTokens([
            {
                tokenId: project_id,  // Use predicted token ID
                amount: BigInt(id_token_amount)
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
        });

    // Build the chained transaction
    // First part: mint token
    // Second part: create campaign box using minted token
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs from user's UTXOs
        .to(mintOutput)                        // First output: mint box
        .sendChangeTo(walletPk)                // Send change back to wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay fee for first part
        .build()                               // Build first transaction
        .chain((builder) =>                    // Chain second transaction
            builder
                .to(contractOutput)            // Second output: campaign box
                .payFee(RECOMMENDED_MIN_FEE_VALUE)  // Pay fee for second part
                .build()
        )
        .toEIP12Object();

    try {
        playBeep();
    } catch (error) {
        console.error('Error executing play beep:', error);
    }

    // Sign the transaction (user signs once for both parts!)
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Submit the chained transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Chained transaction ID ->", transactionId);
    console.log("Campaign created with token ID:", project_id);

    return transactionId;
}
