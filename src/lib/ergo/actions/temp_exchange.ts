import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SBool, SColl, SPair, serializeBox } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { createR8Structure, getProjectAptId, type Project } from '../../common/project';
import { get_ergotree_hex } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';

export async function temp_exchange(
    project: Project,
    token_amount: number
): Promise<string | null> {

    token_amount = Math.floor(token_amount * Math.pow(10, project.token_details.decimals));

    const isV3 = project.version === "v3";
    const aptTokenId = getProjectAptId(project);
    const walletPk = await getChangeAddress();
    const height = await getCurrentHeight();
    const inputs = [project.box, ...(await getUtxos())];
    const replicaErgoTree = project.box.ergoTree || get_ergotree_hex(project.constants, project.version);

    let currentBaseTokenAmount = 0n;
    if ((project.version === "v2" || isV3) && project.base_token_id && project.base_token_id !== "") {
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = BigInt(token.amount);
                break;
            }
        }
    }

    const registers = {
        R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
        R5: SLong(BigInt(project.minimum_amount)).toHex(),
        R6: SColl(SLong, [
            BigInt(project.sold_counter),
            BigInt(project.refund_counter),
            BigInt(project.auxiliar_exchange_counter) + BigInt(token_amount)
        ]).toHex(),
        R7: SLong(BigInt(project.exchange_rate)).toHex(),
        R8: (project.box.additionalRegisters?.R8) || createR8Structure(project.constants).toHex(),
        R9: (project.box.additionalRegisters?.R9) || SString(project.content.raw)
    };

    const buildReplicaOutput = (ergValue: bigint) => {
        const out = new OutputBuilder(ergValue, replicaErgoTree);
        const newAptAmount = BigInt(project.current_idt_amount) + BigInt(token_amount);
        if (isV3) {
            out.addTokens([
                { tokenId: project.project_id, amount: 1n },
                { tokenId: aptTokenId, amount: newAptAmount }
            ]);
        } else {
            out.addTokens({ tokenId: project.project_id, amount: newAptAmount });
        }

        const remainingPft = BigInt(project.current_pft_amount) - BigInt(token_amount);
        if (remainingPft > 0n) {
            out.addTokens({ tokenId: project.pft_token_id, amount: remainingPft });
        }
        if (currentBaseTokenAmount > 0n && project.base_token_id) {
            out.addTokens({ tokenId: project.base_token_id, amount: currentBaseTokenAmount });
        }
        out.setAdditionalRegisters(registers);
        return out;
    };

    let replicaErgValue = BigInt(project.value);
    if (isV3) {
        const probeWalletOut = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk).addTokens({
            tokenId: project.pft_token_id,
            amount: BigInt(token_amount)
        });
        const probeTx = new TransactionBuilder(height)
            .from(inputs)
            .to([buildReplicaOutput(replicaErgValue), probeWalletOut])
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build();
        const requiredMinErg = BigInt(serializeBox(probeTx.outputs[0]).toBytes().length) * 360n;
        if (requiredMinErg > replicaErgValue) {
            replicaErgValue = requiredMinErg;
        }
    }

    const contractOutput = buildReplicaOutput(replicaErgValue);
    const walletOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk).addTokens({
        tokenId: project.pft_token_id,
        amount: BigInt(token_amount)
    });

    const unsignedTransaction = await new TransactionBuilder(height)
        .from(inputs)
        .to([contractOutput, walletOutput])
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    try {
        const signedTransaction = await signTransaction(unsignedTransaction);
        return await submitTransaction(signedTransaction);
    } catch {
        return null;
    }
}
