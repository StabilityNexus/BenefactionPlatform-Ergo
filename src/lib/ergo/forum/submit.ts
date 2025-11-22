import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    type Box,
    type Amount,
    ErgoAddress
} from '@fleet-sdk/core';
import { SColl, SByte, SBool } from '@fleet-sdk/serializer';
import { type RPBox } from './object';
import { PROFILE_TYPE_NFT_ID } from './envs';
import { explorer_uri } from '$lib/common/store';
import { get } from 'svelte/store';
import { hexToBytes } from './utils';
import { ergo_tree_address } from './contract';
import { stringToBytes } from '@scure/base';

// Global ergo wallet connector (injected by browser wallet extension)
declare const ergo: any;

/**
 * Generates or modifies a reputation proof by building and submitting a transaction.
 * @param token_amount The amount of the token for the new proof box.
 * @param total_supply The total supply of the reputation token set.
 * @param type_nft_id The token ID of the Type NFT that defines the standard for this proof.
 * @param object_pointer The object this proof is about (e.g., a URL, another token ID).
 * @param polarization `true` for a positive proof, `false` for a negative one.
 * @param content The JSON or string content for register R9.
 * @param is_locked `true` to make the resulting box immutable.
 * @param input_proof The existing RPBox to spend from (for splitting or modifying).
 * @returns A promise that resolves to the transaction ID string, or null on failure.
 */
export async function generate_reputation_proof(
    token_amount: number,
    total_supply: number,
    type_nft_id: string,
    object_pointer: string | undefined,
    polarization: boolean,
    content: object | string | null,
    is_locked: boolean = false,
    input_proof?: RPBox,
): Promise<string | null> {


    console.log("Generating reputation proof with parameters:", {
        token_amount,
        total_supply,
        type_nft_id,
        object_pointer,
        polarization,
        content,
        is_locked,
        input_proof
    });

    const creatorAddressString = await ergo.get_change_address();
    if (!creatorAddressString) {
        throw new Error("Could not get the creator's address from the wallet.");
    }
    const creatorP2PKAddress = ErgoAddress.fromBase58(creatorAddressString);

    // Fetch the Type NFT box to be used in dataInputs. This is required by the contract.
    const typeNftBoxResponse = await fetch(`${get(explorer_uri)}/api/v1/boxes/byTokenId/${type_nft_id}`);
    if (!typeNftBoxResponse.ok) {
        alert("Could not fetch the Type NFT box. Aborting transaction.");
        return null;
    }
    const typeNftBox = (await typeNftBoxResponse.json()).items[0];

    console.log("type nft box ", typeNftBox)

    // Inputs for the transaction
    const utxos = await ergo.get_utxos();
    const inputs: Box<Amount>[] = input_proof ? [input_proof.box, ...utxos] : utxos;
    let dataInputs = [typeNftBox];

    // If splitting from an existing proof box with a different type NFT, we need to include both type NFTs
    if (input_proof && input_proof.type.tokenId !== type_nft_id) {
        const inputTypeNftBoxResponse = await fetch(`${get(explorer_uri)}/api/v1/boxes/byTokenId/${input_proof.type.tokenId}`);
        if (inputTypeNftBoxResponse.ok) {
            const inputTypeNftBox = (await inputTypeNftBoxResponse.json()).items[0];
            dataInputs.push(inputTypeNftBox);
            console.log("Added input proof's type NFT box to data inputs:", inputTypeNftBox.boxId);
        }
    }

    const outputs: OutputBuilder[] = [];

    // --- Create the main output for the new/modified proof ---
    const new_proof_output = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        ergo_tree_address
    );

    if (input_proof === undefined || input_proof === null) {
        // Minting a new token if no input proof is provided
        new_proof_output.mintToken({
            amount: token_amount.toString(),
            name: "Reputation Proof Token", // Optional: EIP-4 metadata
        });

        if (!object_pointer) object_pointer = inputs[0].boxId;  // Points to the self token being evaluated by default
    }
    else {
        // Transferring existing tokens
        new_proof_output.addTokens({
            tokenId: input_proof.token_id,
            amount: token_amount.toString()
        });

        // If splitting, create a change box to send the remaining tokens back to the same contract
        if (input_proof.token_amount - token_amount > 0) {
            outputs.push(
                new OutputBuilder(SAFE_MIN_BOX_VALUE, ergo_tree_address)
                    .addTokens({
                        tokenId: input_proof.token_id,
                        amount: (input_proof.token_amount - token_amount).toString()
                    })
                    // The change box must retain the original registers
                    .setAdditionalRegisters(input_proof.box.additionalRegisters)
            );
        }

        if (!object_pointer) object_pointer = input_proof.token_id
    }

    const propositionBytes = hexToBytes(creatorP2PKAddress.ergoTree);
    if (!propositionBytes) {
        throw new Error(`Could not get proposition bytes from address ${creatorAddressString}.`);
    }

    const raw_content = typeof (content) === "object" ? JSON.stringify(content) : content ?? "";

    const new_registers = {
        R4: SColl(SByte, hexToBytes(type_nft_id) ?? "").toHex(),
        R5: SColl(SByte, hexToBytes(object_pointer) ?? "").toHex(),
        R6: SBool(is_locked).toHex(),
        R7: SColl(SByte, propositionBytes).toHex(),
        R8: SBool(polarization).toHex(),
        R9: SColl(SByte, stringToBytes("utf8", raw_content)).toHex(),
    };

    console.log("New registers:", new_registers)

    new_proof_output.setAdditionalRegisters(new_registers);

    outputs.push(new_proof_output);

    // --- Build and submit the transaction ---
    try {
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to(outputs)
            .sendChangeTo(creatorP2PKAddress)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .withDataFrom(dataInputs)
            .build()
            .toEIP12Object();

        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);



        console.log("Transaction ID -> ", transactionId);
        return transactionId;
    } catch (e: any) {
        console.error("Error building or submitting transaction:", e);
        alert(`Transaction failed: ${e?.message || e}`);
        return null;
    }
}