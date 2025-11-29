import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';

import { SString } from '../utils';
import { createR8Structure, type Project } from '../../common/project';
import { get_ergotree_hex } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction } from '../wallet-utils';
import { SBool, SColl, SPair } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function buy_refund(
    project: Project,
    token_amount: number
): Promise<string | null> {

    /*
        Token amount positive means buy action.
        Token amount negative means refund action.
    */


    // Convert to smallest unit without rounding away from zero (handles negatives correctly)
    token_amount = Math.trunc(token_amount * Math.pow(10, project.token_details.decimals));

    // Calculate base token amount based on project's base token
    const isERGBase = !project.base_token_id || project.base_token_id === "";
    const base_token_amount = Math.abs(token_amount) * project.exchange_rate;


    // Get the wallet address (will be the user address)
    const walletPk = await getChangeAddress();

    // Get the UTXOs from the current wallet to use as inputs
    const walletUtxos = await window.ergo!.get_utxos();

    // For refunds, ensure we have the project tokens in inputs
    if (token_amount < 0) {
        // Check if user has the required project tokens
        const requiredTokenAmount = Math.abs(token_amount);
        let hasRequiredTokens = false;


        for (const utxo of walletUtxos) {
            if (utxo.assets && utxo.assets.length > 0) {
                for (const asset of utxo.assets) {
                    if (asset.tokenId === project.project_id) {
                        if (Number(asset.amount) >= requiredTokenAmount) {
                            hasRequiredTokens = true;
                            break;
                        }
                    }
                }
            }
            if (hasRequiredTokens) break;
        }


        if (!hasRequiredTokens) {
            throw new Error(`Insufficient project tokens for refund. Required: ${requiredTokenAmount}`);
        }
    }

    const inputs = [project.box, ...walletUtxos];

    // Calculate ERG value for the contract
    let contractErgValue = project.value;
    if (isERGBase) {
        if (token_amount > 0) {
            // Buy: add ERG to contract
            contractErgValue = project.value + base_token_amount;
        } else {
            // Refund: contract retains ERG (user gets ERG from separate output)
            contractErgValue = project.value; // Keep original ERG in contract
        }
    }


    // Building the project output

    const output = new OutputBuilder(
        BigInt(contractErgValue).toString(),
        get_ergotree_hex(project.constants, project.version)
    )
        .addTokens({
            tokenId: project.project_id,
            amount: BigInt(project.current_idt_amount - token_amount).toString()  // Buy: extract tokens, Refund: add tokens
        });

    // Add PFT tokens if they exist
    if (project.current_pft_amount > 0) {
        output.addTokens({
            tokenId: project.pft_token_id,
            amount: BigInt(project.current_pft_amount).toString()  // PFT token maintains constant
        });
    }

    // Handle base token changes for non-ERG base tokens
    if (!isERGBase && project.base_token_id) {
        // Find current base token amount in the project box
        let currentBaseTokenAmount = 0;
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = Number(token.amount);
                break;
            }
        }


        // Calculate new base token amount
        let newBaseTokenAmount;
        if (token_amount > 0) {
            // Buy: add base tokens to contract
            newBaseTokenAmount = currentBaseTokenAmount + base_token_amount;
        } else {
            // Refund: subtract base tokens from contract (they go to user)
            newBaseTokenAmount = currentBaseTokenAmount - base_token_amount;
        }


        // Ensure we don't have negative base tokens in contract
        if (newBaseTokenAmount < 0) {
            throw new Error(`Insufficient base tokens in contract. Available: ${currentBaseTokenAmount}, Required: ${base_token_amount}`);
        }

        // Add base token with updated amount only if > 0 to avoid zero-amount token in output
        if (newBaseTokenAmount > 0) {
            output.addTokens({
                tokenId: project.base_token_id,
                amount: BigInt(newBaseTokenAmount).toString()
            });
        }
    }

    // Update counters
    const sold_counter = BigInt(token_amount > 0 ? project.sold_counter + token_amount : project.sold_counter);
    const refund_counter = BigInt(token_amount < 0 ? project.refund_counter + Math.abs(token_amount) : project.refund_counter);

    output.setAdditionalRegisters({
        R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
        R5: SLong(BigInt(project.minimum_amount)).toHex(),
        R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),
        R7: SLong(BigInt(project.exchange_rate)).toHex(),
        R8: createR8Structure(project.constants).toHex(),
        R9: SString(project.content.raw)
    });

    const outputs = [output];

    // Create user outputs based on action type
    if (token_amount > 0) {
        // Buy: user gets project tokens
        const userOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk)
            .addTokens({
                tokenId: project.project_id,
                amount: token_amount.toString()
            });
        outputs.push(userOutput);
    } else if (token_amount < 0) {
        // For refunds, user needs to provide the project tokens as input
        // The user output only contains what they receive back (base tokens)
        if (isERGBase) {
            // For ERG refunds, user gets ERG
            const userOutput = new OutputBuilder(
                (BigInt(base_token_amount) + SAFE_MIN_BOX_VALUE).toString(), // Add minimum box value
                walletPk
            );
            outputs.push(userOutput);
        } else if (project.base_token_id) {
            // For token refunds, user gets base tokens
            const userOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk)
                .addTokens({
                    tokenId: project.base_token_id,
                    amount: base_token_amount.toString()
                });
            outputs.push(userOutput);
        }
    }

    // Building the unsigned transaction using Fleet SDK's built-in change handling
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)  // Fleet SDK automatically handles ERG and token change
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();


    // Final sanity check: ensure all token amounts in outputs are > 0
    try {
	const invalidTokens: Array<{ outIndex: number; tokenId: string; amount: string }> = [];

	(unsignedTransaction.outputs || []).forEach((o: any, idx: number) => {
		(o.assets || []).forEach((t: any) => {
			const amt = BigInt(
				typeof t.amount === "string"
					? t.amount
					: (t.amount?.toString() ?? "0")
			);
			if (amt <= 0n) {
				invalidTokens.push({
					outIndex: idx,
					tokenId: t.tokenId,
					amount: amt.toString()
				});
			}
		});
	});

    if (invalidTokens.length > 0) {
            throw new Error("Transaction has non-positive token amounts in outputs");
        }
    } catch (e) {
        console.error("Invalid transaction structure detected", e);
        throw e; // now adds meaningful debugging info
    }


    try {
        // Sign the transaction
        const signedTransaction = await signTransaction(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await submitTransaction(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log("Transaction error:", e);
        throw e; // Re-throw to help with debugging
    }
}