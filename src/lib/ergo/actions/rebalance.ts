import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SBool, SColl, SPair } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { createR8Structure, getProjectAptId, type Project } from '../../common/project';
import { get_ergotree_hex } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';

export async function rebalance(
    project: Project,
    token_amount: number
): Promise<string | null> {

    try {
        token_amount = Math.trunc(token_amount * Math.pow(10, project.token_details.decimals));

        const isV3 = project.version === "v3";
        const aptTokenId = getProjectAptId(project);
        const walletPk = await getChangeAddress();
        const walletUtxos = await getUtxos();
        const inputs = [project.box, ...walletUtxos];
        const replicaErgoTree = project.box.ergoTree || get_ergotree_hex(project.constants, project.version);

        const contract_output = new OutputBuilder(BigInt(project.value), replicaErgoTree);

        if (isV3) {
            contract_output.addTokens({ tokenId: project.project_id, amount: 1n });
            if (BigInt(project.current_idt_amount) > 0n) {
                contract_output.addTokens({ tokenId: aptTokenId, amount: BigInt(project.current_idt_amount) });
            }
        } else {
            contract_output.addTokens({ tokenId: project.project_id, amount: BigInt(project.current_idt_amount) });
        }

        const contract_token_amount = BigInt(project.current_pft_amount) + BigInt(token_amount);
        if (contract_token_amount > 0n) {
            contract_output.addTokens({ tokenId: project.pft_token_id, amount: contract_token_amount });
        }

        if (project.base_token_id && project.base_token_id !== "") {
            let currentBaseTokenAmount = 0n;
            for (const token of project.box.assets) {
                if (token.tokenId === project.base_token_id) {
                    currentBaseTokenAmount = BigInt(token.amount);
                    break;
                }
            }
            if (currentBaseTokenAmount > 0n) {
                contract_output.addTokens({ tokenId: project.base_token_id, amount: currentBaseTokenAmount });
            }
        }

        contract_output.setAdditionalRegisters({
            R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
            R5: SLong(BigInt(project.minimum_amount)).toHex(),
            R6: SColl(SLong, [
                BigInt(project.sold_counter),
                BigInt(project.refund_counter),
                BigInt(project.auxiliar_exchange_counter)
            ]).toHex(),
            R7: SLong(BigInt(project.exchange_rate)).toHex(),
            R8: (project.box.additionalRegisters?.R8) || createR8Structure(project.constants).toHex(),
            R9: (project.box.additionalRegisters?.R9) || SString(project.content.raw)
        });

        const outputs: OutputBuilder[] = [contract_output];

        if (token_amount < 0) {
            outputs.push(
                new OutputBuilder(SAFE_MIN_BOX_VALUE, walletPk).addTokens({
                    tokenId: project.pft_token_id,
                    amount: BigInt(-token_amount)
                })
            );
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
    } catch {
        return null;
    }
}
