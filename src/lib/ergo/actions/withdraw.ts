import {
    OutputBuilder,
    TransactionBuilder,
    SLong,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { createR8Structure, getProjectAptId, type Project } from '../../common/project';
import { get_ergotree_hex, TERMINAL_ERGOTREE_HEX, type contract_version } from '../contract';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';
import { get_dev_contract_address } from '../dev/dev_contract';
import { SColl, SPair, SByte, SBool } from '@fleet-sdk/serializer';

export function calculateDevFee(
    extractedBaseAmount: bigint,
    devFeePercentage: number | bigint,
    version: contract_version
): bigint {
    const feePct = BigInt(devFeePercentage);
    if (extractedBaseAmount <= 0n || feePct <= 0n) return 0n;
    if (version === "v3") return (extractedBaseAmount * feePct + 99n) / 100n;
    return (extractedBaseAmount * feePct) / 100n;
}

export async function withdraw(
    project: Project,
    amount: number
): Promise<string | null> {

    const isV3 = project.version === "v3";
    const isMultiToken = (project.version === "v2" || isV3) && Boolean(project.base_token_id && project.base_token_id !== "");
    const isERGBase = !isMultiToken;

    const decimals = isERGBase ? 9 : (project.base_token_details?.decimals || 0);
    const requestedUnits = BigInt(Math.round(amount * Math.pow(10, decimals)));

    const walletPk = await getChangeAddress();
    const ownerRecipient = project.constants.owner || walletPk;
    const inputs = [project.box, ...(await getUtxos())];

    const outputs: OutputBuilder[] = [];
    const devAddress = project.constants.dev_addr ?? get_dev_contract_address();
    const devFeePercentage = project.constants.dev_fee;

    let currentBaseTokenAmount = 0n;
    if (isMultiToken) {
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = BigInt(token.amount);
                break;
            }
        }
    }

    const boxErgValue = BigInt(project.value);
    const extractedBaseAmount = isERGBase
        ? requestedUnits
        : (requestedUnits < currentBaseTokenAmount ? requestedUnits : currentBaseTokenAmount);

    if (extractedBaseAmount <= 0n) return null;
    if (isERGBase && extractedBaseAmount > boxErgValue) return null;
    if (!isERGBase && extractedBaseAmount > currentBaseTokenAmount) return null;

    const devFeeAmount = calculateDevFee(extractedBaseAmount, devFeePercentage, project.version);
    if (!isV3 && devFeePercentage > 0 && devFeeAmount === 0n) return null;

    const projectAmount = extractedBaseAmount - devFeeAmount;
    if (isERGBase ? projectAmount < SAFE_MIN_BOX_VALUE : projectAmount <= 0n) return null;

    const allFundsWithdrawn = isERGBase ? (extractedBaseAmount === boxErgValue) : (extractedBaseAmount === currentBaseTokenAmount);
    const allTokensWithdrawn = BigInt(project.current_pft_amount) === 0n;
    const isFullWithdrawal = allFundsWithdrawn && allTokensWithdrawn;

    if (!isFullWithdrawal) {
        const remainingErg = isERGBase ? (boxErgValue - extractedBaseAmount) : boxErgValue;
        const remainingBaseToken = isERGBase ? 0n : (currentBaseTokenAmount - extractedBaseAmount);
        const replicaErgoTree = project.box.ergoTree || get_ergotree_hex(project.constants, project.version);

        const contractOutput = new OutputBuilder(remainingErg, replicaErgoTree);

        if (isV3) {
            contractOutput.addTokens({ tokenId: project.project_id, amount: 1n });
            if (BigInt(project.current_idt_amount) > 0n) {
                contractOutput.addTokens({ tokenId: getProjectAptId(project), amount: BigInt(project.current_idt_amount) });
            }
        } else {
            contractOutput.addTokens({ tokenId: project.project_id, amount: BigInt(project.current_idt_amount) });
        }

        if (BigInt(project.current_pft_amount) > 0n) {
            contractOutput.addTokens({ tokenId: project.pft_token_id, amount: BigInt(project.current_pft_amount) });
        }

        if (isMultiToken && remainingBaseToken > 0n) {
            contractOutput.addTokens({ tokenId: project.base_token_id!, amount: remainingBaseToken });
        }

        if (project.version === "v1_0" || project.version === "v1_1") {
            contractOutput.setAdditionalRegisters({
                R4: project.box.additionalRegisters.R4,
                R5: project.box.additionalRegisters.R5,
                R6: project.box.additionalRegisters.R6,
                R7: project.box.additionalRegisters.R7,
                R8: project.box.additionalRegisters.R8,
                R9: project.box.additionalRegisters.R9
            });
        } else {
            contractOutput.setAdditionalRegisters({
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
        }
        outputs.push(contractOutput);
    }

    if (isERGBase) {
        outputs.push(new OutputBuilder(projectAmount, ownerRecipient));
    } else {
        const ownerBoxErg = (isFullWithdrawal && isV3 && boxErgValue > SAFE_MIN_BOX_VALUE)
            ? boxErgValue
            : SAFE_MIN_BOX_VALUE;
        outputs.push(
            new OutputBuilder(ownerBoxErg, ownerRecipient).addTokens({
                tokenId: project.base_token_id!,
                amount: projectAmount
            })
        );
    }

    if (isERGBase) {
        if (devFeeAmount > 0n) {
            outputs.push(new OutputBuilder(devFeeAmount, devAddress));
        }
    } else if (!isV3 || devFeePercentage > 0) {
        const devOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, devAddress);
        if (devFeeAmount > 0n) {
            devOutput.addTokens({ tokenId: project.base_token_id!, amount: devFeeAmount });
        }
        const tokenIdBytes = project.base_token_id!.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16));
        devOutput.setAdditionalRegisters({ R4: SColl(SByte, tokenIdBytes).toHex() });
        outputs.push(devOutput);
    }

    if (isFullWithdrawal && isV3) {
        outputs.push(
            new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_ERGOTREE_HEX).addTokens({
                tokenId: project.project_id,
                amount: 1n
            })
        );
    }

    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(1_100_000n)
        .build()
        .toEIP12Object();

    try {
        const signedTransaction = await signTransaction(unsignedTransaction);
        return await submitTransaction(signedTransaction);
    } catch {
        return null;
    }
}
