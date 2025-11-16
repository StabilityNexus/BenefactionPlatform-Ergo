
import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box,
    BOX_VALUE_PER_BYTE
} from '@fleet-sdk/core';
import { SColl, SInt } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/project';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details, wait_until_confirmation } from '../fetch';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction } from '../wallet-utils';

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

function playBeep(frequency = 1000, duration = 3000) {
    const audioCtx = new window.AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, duration);
}

async function mint_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number): Promise<Box> {
    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await window.ergo!.get_utxos();

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(constants, version)
        )
        .mintToken({ 
            amount: BigInt(amount),
            name: title+" APT",    // A pro for use IDT (identity token) and TFT (temporal funding token) with the same token is that the TFT token that the user holds has the same id than the project.  This allows the user to verify the exact project in case than two projects has the same name.
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

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Mint tx id: "+transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.")
        throw new Error("Mint tx failed.")
    }

    return box
}

// Function to submit a project to the blockchain
export async function submit_project(
    version: contract_version,
    token_id: string,
    token_amount: number,
    blockLimit: number,     // Block height until withdrawal/refund is allowed
    exchangeRate: number,   // Exchange rate base_token/PFT
    projectContent: string,    // Project content
    minimumSold: number,     // Minimum amount sold to allow withdrawal
    title: string,
    base_token_id: string = ""  // Base token ID for contributions (empty for ERG)
): Promise<string|null> {

    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();

    let addressContent: ConstantContent = {
        "owner": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id,
        "base_token_id": base_token_id
    };

    // Get token emission amount.
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"] + 1;

    // Build the mint tx.
    let mint_box = await mint_tx(title, addressContent, version, id_token_amount, token_data["decimals"]);
    let project_id = mint_box.assets[0].tokenId;

    if (project_id === null) { alert("Token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await window.ergo!.get_utxos()];

    const r4Hex = SInt(blockLimit).toHex();
    const r5Hex = SLong(BigInt(minimumSold)).toHex();
    const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex();
    const r7Hex = SLong(BigInt(exchangeRate)).toHex();
    const r8Hex = SString(JSON.stringify(addressContent));
    const r9Hex = SString(projectContent);

    const BASE_BOX_OVERHEAD = 60;          // approx. bytes (header, value, creationHeight, etc.)
    const PER_TOKEN_BYTES = 40;            // approximate per token: 32 (id) + 8 (amount)
    const PER_REGISTER_OVERHEAD = 1;       // bytes per register index/header
    const SIZE_MARGIN = 120;               // safety margin in bytes

    // tamaño registros (sumando overhead por registro)
    let registersBytes = 0;
    for (const h of [r4Hex, r5Hex, r6Hex, r7Hex, r8Hex, r9Hex]) {
        const hexBytesLen = (hexStr: string): number => {
            if (!hexStr) return 0;
            const stripHexPrefix = (h: string) => h?.startsWith('0x') ? h.slice(2) : h;
            const h = stripHexPrefix(hexStr);
            return Math.ceil(h.length / 2);
        };
        const len = hexBytesLen(h);
        registersBytes += len + PER_REGISTER_OVERHEAD;
    }

    const ergoTreeAddress = get_address(addressContent, version);

    const totalEstimatedSize = BigInt(
        BASE_BOX_OVERHEAD
        + ergoTreeAddress.length
        + PER_TOKEN_BYTES * 3        
        + registersBytes
        + SIZE_MARGIN
    );

    let minRequiredValue = BOX_VALUE_PER_BYTE * totalEstimatedSize;
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

    // Sign the transaction
    const signedTransaction = await signTransaction(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await submitTransaction(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}
