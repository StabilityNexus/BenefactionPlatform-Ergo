/**
 * Submit Project - Chained Transaction Implementation
 * 
 * This module handles campaign creation using chained transactions.
 * Instead of creating two separate transactions (mint + campaign box),
 * we now create a single chained transaction that:
 * 1. Mints the APT token via the mint contract
 * 2. Creates the campaign box that spends the mint output
 * 
 * This improves UX by requiring only one signature from the user.
 * 
 * See: https://docs.ergoplatform.com/dev/anatomy/transactions/chained/
 */

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
 * Submit a project to the blockchain using chained transactions.
 * 
 * This creates a single chained transaction that:
 * 1. First TX: Mints the APT token to the mint contract address
 * 2. Second TX (chained): Spends the mint output to create the campaign box
 * 
 * The user only needs to sign once, improving UX significantly.
 */
export async function* submit_project(
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
): AsyncGenerator<string, string | null, void> {

    // Parse and validate project content
    let parsedContent: ProjectContent;
    try {
        parsedContent = JSON.parse(projectContent);
    } catch (error) {
        alert("Invalid project content format.");
        return null;
    }

    // Validate that the project content fits within limits
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
    yield "Fetching token data...";
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"] + 1;

    // Get the UTXOs from the current wallet
    const inputs = await getUtxos();
    
    if (!inputs || inputs.length === 0) {
        alert("No UTXOs available in wallet.");
        return null;
    }

    // The first input's boxId will be used as the token ID for the minted APT
    const firstInputBoxId = inputs[0].boxId;

    yield "Building chained transaction...";

    // Prepare register values for the campaign box
    const r4Hex = SPair(SBool(is_timestamp_limit), SLong(BigInt(blockLimit))).toHex();
    const r5Hex = SLong(BigInt(minimumSold)).toHex();
    const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex();
    const r7Hex = SLong(BigInt(exchangeRate)).toHex();
    const r8Hex = createR8Structure(addressContent).toHex();
    const r9Hex = SString(projectContent);

    // Calculate register sizes for box value estimation
    const registerSizes = estimateRegisterSizes(r4Hex, r5Hex, r6Hex, r7Hex, r8Hex, r9Hex);
    const ergoTreeAddress = get_ergotree_hex(addressContent, version);

    // Estimate total box size
    const totalEstimatedSize = estimateTotalBoxSize(
        ergoTreeAddress.length,
        3, // number of tokens
        registerSizes
    );

    let minRequiredValue = BOX_VALUE_PER_BYTE * BigInt(totalEstimatedSize);
    if (minRequiredValue < SAFE_MIN_BOX_VALUE) {
        minRequiredValue = SAFE_MIN_BOX_VALUE;
    }

    const currentHeight = await getCurrentHeight();

    // Build the mint output (first transaction output)
    const mintOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        mint_contract_address(addressContent, version)
    ).mintToken({
        amount: BigInt(id_token_amount),
        name: title + " APT",
        decimals: token_data["decimals"],
        description: "Temporal-funding Token for the " + title + " project."
    });

    // Build the campaign box output (second transaction output)
    // Note: The token ID for the minted token will be the first input's boxId
    const campaignOutput = new OutputBuilder(
        minRequiredValue,
        ergoTreeAddress
    )
        .addTokens([
            {
                tokenId: firstInputBoxId, // The minted APT token ID
                amount: BigInt(id_token_amount)
            },
            {
                tokenId: token_id,
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
    // First transaction: mint the APT token
    // Second transaction (chained): create the campaign box spending the mint output
    const unsignedTransaction = await new TransactionBuilder(currentHeight)
        .from(inputs)
        .to(mintOutput)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .chain((builder) =>
            builder
                .to(campaignOutput)
                .payFee(RECOMMENDED_MIN_FEE_VALUE)
                .build()
        )
        .toEIP12Object();

    try {
        playBeep();
    } catch (error) {
        console.error('Error executing play beep:', error);
    }

    yield "Please sign the transaction...";

    // Sign the chained transaction (user signs once for both transactions)
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Submit the transaction to the network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Chained transaction id -> ", transactionId);
    return transactionId;
}
