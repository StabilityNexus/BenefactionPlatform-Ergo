
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

/**
 * Fetches token data and validates emission amount
 * @param token_id - The token ID to fetch data for
 * @returns Token data with amount as bigint and decimals, or null if invalid
 */
async function get_token_data(token_id: string): Promise<{ amount: bigint; decimals: number } | null> {
    try {
        const token_fetch = await fetch_token_details(token_id);
        const emission = token_fetch['emissionAmount'] ?? 0;

        if (emission === 0) {
            alert(token_id + " token emission amount is 0.");
            return null;
        }

        // Return emission amount as bigint (increment will be done in submit_project)
        return { amount: BigInt(emission), decimals: token_fetch['decimals'] };
    } catch (error) {
        console.error("Error fetching token data:", error);
        alert("Failed to fetch token details. Please check the token ID.");
        return null;
    }
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
 * Submit a project to the blockchain using a single transaction with multiple outputs
 * 
 * This function creates a single transaction with two outputs:
 * 1. Mint output: Creates a new token (APT + IDT) following EIP-004 standard
 * 2. Campaign output: Creates the campaign box with the minted token
 * 
 * Benefits over the old two-transaction approach:
 * - User signs only once (better UX)
 * - Both outputs created atomically (both succeed or both fail)
 * - Faster campaign creation (no wait for confirmation)
 * - Lower total fees (single transaction overhead)
 * 
 * Technical approach:
 * - Uses FleetSDK's multiple .to() calls to add both outputs
 * - Token ID is predicted as inputs[0].boxId (Ergo standard)
 * - Mint output must be first (for token ID prediction to work)
 * - Campaign output references the predicted token ID
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

    // Get token emission amount and add 1 for the identity token
    const token_data = await get_token_data(token_id);
    if (!token_data) {
        return null; // Error already shown to user
    }

    const id_token_amount = token_data.amount + 1n; // Add 1 using bigint arithmetic

    // Validate token_amount before conversion to BigInt
    if (!Number.isSafeInteger(token_amount) || token_amount < 0) {
        alert("Invalid token amount: must be a positive integer.");
        return null;
    }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await getUtxos();

    // In a single transaction with multiple outputs, the token ID will be the first input's boxId
    // This is because Ergo's token ID = box ID of the box that minted it
    const project_id = inputs[0].boxId;

    console.log("Predicted token ID:", project_id);

    // Build the mint output (first output - MUST be first for token ID prediction)
    const mintOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        mint_contract_address(addressContent, version)
    )
        .mintToken({
            amount: id_token_amount, // Already bigint
            name: title + " APT",
            decimals: token_data.decimals,
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

    // Estimate total box size (2 tokens: project_id + pft_token_id)
    const totalEstimatedSize = estimateTotalBoxSize(
        ergoTreeAddress.length,
        2, // number of tokens (project_id and pft_token_id)
        registerSizes
    );

    let minRequiredValue = BOX_VALUE_PER_BYTE * BigInt(totalEstimatedSize);
    if (minRequiredValue < SAFE_MIN_BOX_VALUE) {
        minRequiredValue = SAFE_MIN_BOX_VALUE;
    }

    // Build the campaign output (second output)
    const contractOutput = new OutputBuilder(
        minRequiredValue,
        ergoTreeAddress
    )
        .addTokens([
            {
                tokenId: project_id,  // Use predicted token ID
                amount: id_token_amount // Already bigint
            },
            {
                tokenId: token_id ?? "",
                amount: BigInt(token_amount) // Safe after validation
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

    // Build the transaction with multiple outputs
    // FleetSDK supports multiple .to() calls to add multiple outputs in a single transaction
    // The mint output MUST be first so the token ID prediction works correctly
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs from user's UTXOs
        .to(mintOutput)                        // First output: mint box (MUST be first!)
        .to(contractOutput)                    // Second output: campaign box
        .sendChangeTo(walletPk)                // Send change back to wallet
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // Pay transaction fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert to EIP-12 compatible object

    try {
        playBeep();
    } catch (error) {
        console.error('Error executing play beep:', error);
    }

    // Sign the transaction (user signs once for both outputs!)
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Submit the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Transaction ID ->", transactionId);
    console.log("Campaign created with token ID:", project_id);
    console.log("Both mint and campaign boxes created atomically!");

    return transactionId;
}
