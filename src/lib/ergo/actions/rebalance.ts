import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';

import { SString } from '../utils';
import { createR8Structure, type Project } from '../../common/project';
import { get_ergotree_hex } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';
import { reserveBoxes, releaseBoxes, registerPendingTx, areBoxesReserved } from '$lib/common/pending-utxos';
import { SBool, SColl, SPair } from '@fleet-sdk/serializer';

export async function rebalance(
    project: Project,
    token_amount: number
): Promise<string | null> {

    try {
        token_amount = Math.trunc(token_amount * Math.pow(10, project.token_details.decimals));

        console.log("wants to add ", token_amount / Math.pow(10, project.token_details.decimals), " tokens of type ", project.token_details.name);

        // Get the wallet address (will be the project address)
        const walletPk = await getChangeAddress();
        // Get the UTXOs from the current wallet to use as inputs
        const walletUtxos = await getUtxos();
        // For adding tokens, we need the project box first, then a wallet UTXO
        // This ensures INPUTS.size > 1 and INPUTS(1) comes from project address
        const inputs = [project.box, ...walletUtxos];

        // Prevent double spend by reserving these boxes for pending transactions
        if (areBoxesReserved(inputs)) {
            throw new Error('Input box already reserved by a pending transaction; wait until confirmation or try again later.');
        }

        // Reserve boxes, if reservation fails then abort
        const reserved = reserveBoxes(inputs);
        if (!reserved) {
            throw new Error('Input box already reserved by a pending transaction; wait until confirmation or try again later.');
        }

        // Building the project output
        let contract_output = new OutputBuilder(
            BigInt(project.value),
            get_ergotree_hex(project.constants, project.version)
        )
            .addTokens({
                tokenId: project.project_id,
                amount: BigInt(project.current_idt_amount)
            });

        console.log("PFT current amount " + project.current_pft_amount / Math.pow(10, project.token_details.decimals))
        let contract_token_amount = project.current_pft_amount + token_amount;
        console.log("contract token amount " + contract_token_amount / Math.pow(10, project.token_details.decimals))

        if (contract_token_amount > 0) {
            contract_output.addTokens({
                tokenId: project.pft_token_id,
                amount: (contract_token_amount).toString()
            });
        }

        // Handle base tokens for v2 multitoken contracts
        if (project.base_token_id && project.base_token_id !== "") {
            // Find current base token amount in the project box
            let currentBaseTokenAmount = 0;
            for (const token of project.box.assets) {
                if (token.tokenId === project.base_token_id) {
                    currentBaseTokenAmount = Number(token.amount);
                    break;
                }
            }

            // Add base token to contract output (amount remains unchanged during token rebalancing)
            if (currentBaseTokenAmount > 0) {
                contract_output.addTokens({
                    tokenId: project.base_token_id,
                    amount: BigInt(currentBaseTokenAmount)
                });
            }
        }

        // Set additional registers based on contract version
        contract_output.setAdditionalRegisters({
            R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
            R5: SLong(BigInt(project.minimum_amount)).toHex(),
            R6: SColl(SLong, [
                BigInt(project.sold_counter),
                BigInt(project.refund_counter),
                BigInt(project.auxiliar_exchange_counter)
            ]).toHex(),
            R7: SLong(BigInt(project.exchange_rate)).toHex(),
            R8: createR8Structure(project.constants).toHex(),
            R9: SString(project.content.raw)
        });


        let outputs: OutputBuilder[] = [contract_output];

        // Building withdraw to address output
        if (token_amount < 0) {
            outputs.push(
                new OutputBuilder(
                    SAFE_MIN_BOX_VALUE,
                    walletPk
                )
                    .addTokens({
                        tokenId: project.pft_token_id,
                        amount: ((-1) * token_amount).toString()
                    })
            )
        }

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

        console.log("Transaction id -> ", transactionId);

        // Register this transaction to unreserve inputs once it's confirmed
        registerPendingTx(transactionId, inputs).catch((err) => {
            console.warn('Failed to register pending tx cleanup: ', err);
            // Ensure release so we don't lock forever
            try { releaseBoxes(inputs); } catch (e) { /* ignore */ }
        });

        return transactionId;

    } catch (error) {
        console.error("Error in rebalance function:", error);
        // Log full prover error dump if available
        if ((error as any).info) console.error("Prover error info:\n", (error as any).info);

        // Check specific error conditions
        if ((error as any).message && (error as any).message.includes("R7")) {
            console.error("R7 register format error - check exchange rate and base token ID length");
        }

        if ((error as any).message && (error as any).message.includes("INPUTS")) {
            console.error("Input validation error - ensure wallet has UTXOs and project box is accessible");
        }

        // On error, release the boxes to avoid leaving them reserved
        try { releaseBoxes([project.box, ...walletUtxos]); } catch (e) { /* ignore */ }
        return null;
    }
}