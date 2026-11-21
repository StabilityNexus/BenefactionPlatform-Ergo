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

export async function buy_refund(
    project: Project,
    token_amount: number
): Promise<string | null> {

    token_amount = Math.trunc(token_amount * Math.pow(10, project.token_details.decimals));

    const isV3 = project.version === "v3";
    const aptTokenId = getProjectAptId(project);
    const isERGBase = !project.base_token_id || project.base_token_id === "";
    const base_token_amount = BigInt(Math.abs(token_amount)) * BigInt(project.exchange_rate);

    const walletPk = await getChangeAddress();
    const walletUtxos = await getUtxos();

    if (token_amount < 0) {
        const requiredTokenAmount = BigInt(Math.abs(token_amount));
        let totalHeldApt = 0n;
        for (const utxo of walletUtxos) {
            for (const asset of (utxo.assets || [])) {
                if (asset.tokenId === aptTokenId) {
                    totalHeldApt += BigInt(asset.amount);
                }
            }
        }
        if (totalHeldApt < requiredTokenAmount) {
            throw new Error(`Insufficient project tokens for refund. Required: ${requiredTokenAmount}`);
        }
    }

    const inputs = [project.box, ...walletUtxos];

    let contractErgValue = BigInt(project.value);
    if (isERGBase) {
        contractErgValue = token_amount > 0
            ? BigInt(project.value) + base_token_amount
            : BigInt(project.value) - base_token_amount;
    }

    const replicaErgoTree = project.box.ergoTree || get_ergotree_hex(project.constants, project.version);
    const newAptAmount = BigInt(project.current_idt_amount) - BigInt(token_amount);
    if (newAptAmount < 0n) {
        throw new Error("Insufficient APT tokens remaining in campaign box.");
    }

    let newBaseTokenAmount = 0n;
    if (!isERGBase && project.base_token_id) {
        let currentBaseTokenAmount = 0n;
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = BigInt(token.amount);
                break;
            }
        }
        newBaseTokenAmount = token_amount > 0
            ? currentBaseTokenAmount + base_token_amount
            : currentBaseTokenAmount - base_token_amount;
        if (newBaseTokenAmount < 0n) {
            throw new Error(`Insufficient base tokens in contract.`);
        }
    }

    const sold_counter = token_amount > 0
        ? BigInt(project.sold_counter) + BigInt(token_amount)
        : BigInt(project.sold_counter);
    const refund_counter = token_amount < 0
        ? BigInt(project.refund_counter) + BigInt(Math.abs(token_amount))
        : BigInt(project.refund_counter);

    const registers = {
        R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
        R5: SLong(BigInt(project.minimum_amount)).toHex(),
        R6: SColl(SLong, [sold_counter, refund_counter, BigInt(project.auxiliar_exchange_counter)]).toHex(),
        R7: SLong(BigInt(project.exchange_rate)).toHex(),
        R8: (project.box.additionalRegisters?.R8) || createR8Structure(project.constants).toHex(),
        R9: (project.box.additionalRegisters?.R9) || SString(project.content.raw)
    };

    const buildReplicaOutput = (ergVal: bigint) => {
        const out = new OutputBuilder(ergVal, replicaErgoTree);
        if (isV3) {
            out.addTokens({ tokenId: project.project_id, amount: 1n });
            if (newAptAmount > 0n) {
                out.addTokens({ tokenId: aptTokenId, amount: newAptAmount });
            }
        } else {
            out.addTokens({ tokenId: project.project_id, amount: newAptAmount });
        }
        if (BigInt(project.current_pft_amount) > 0n) {
            out.addTokens({ tokenId: project.pft_token_id, amount: BigInt(project.current_pft_amount) });
        }
        if (!isERGBase && project.base_token_id && newBaseTokenAmount > 0n) {
            out.addTokens({ tokenId: project.base_token_id, amount: newBaseTokenAmount });
        }
        out.setAdditionalRegisters(registers);
        return out;
    };

    if (!isERGBase && isV3) {
        const probeTx = new TransactionBuilder(await getCurrentHeight())
            .from(inputs)
            .to([buildReplicaOutput(contractErgValue)])
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build();
        const minBoxErg = BigInt(serializeBox(probeTx.outputs[0]).toBytes().length) * 360n;
        if (minBoxErg > contractErgValue) {
            contractErgValue = minBoxErg;
        }
    }

    const outputs: OutputBuilder[] = [buildReplicaOutput(contractErgValue)];

    if (token_amount > 0) {
        outputs.push(
            new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk).addTokens({
                tokenId: aptTokenId,
                amount: BigInt(token_amount)
            })
        );
    } else if (token_amount < 0) {
        if (isERGBase) {
            const refundOutErg = base_token_amount >= SAFE_MIN_BOX_VALUE ? base_token_amount : SAFE_MIN_BOX_VALUE;
            outputs.push(new OutputBuilder(refundOutErg, walletPk));
        } else if (project.base_token_id) {
            outputs.push(
                new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk).addTokens({
                    tokenId: project.base_token_id,
                    amount: base_token_amount
                })
            );
        }
    }

    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    const signedTransaction = await signTransaction(unsignedTransaction);
    return await submitTransaction(signedTransaction);
}
