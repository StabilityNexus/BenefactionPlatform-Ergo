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

async function get_token_data(token_id: string): Promise<{ emissionAmount: number, decimals: number }> {
    const token_fetch = await fetch_token_details(token_id);
    const emission = token_fetch['emissionAmount'] ?? 0;
    if (emission === 0) {
        alert(token_id + " token emission amount is 0.");
        throw new Error(token_id + " token emission amount is 0.");
    }
    return { emissionAmount: emission, decimals: token_fetch['decimals'] };
}

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
): AsyncGenerator<string, string[] | null, void> {

    let parsedContent: ProjectContent;
    try {
        parsedContent = JSON.parse(projectContent);
    } catch {
        alert("Invalid project content format.");
        return null;
    }

    const validation = validateProjectContent(parsedContent);
    if (!validation.isValid) {
        alert(validation.message);
        return null;
    }

    const MAX_SAFE_INT = 9007199254740991;
    if (token_amount < 0 || token_amount !== Math.floor(token_amount) || token_amount > MAX_SAFE_INT) {
        alert("Invalid token amount. It must be a non-negative safe integer (smallest units). ");
        return null;
    }

    const walletPk = await getChangeAddress();
    const walletUtxos = await getUtxos();
    if (walletUtxos.length === 0) {
        alert("No wallet UTXOs available.");
        return null;
    }

    if (!token_id) {
        alert("Invalid PFT token id.");
        return null;
    }

    const isV3 = version === "v3";
    const token_data = await get_token_data(token_id);
    const id_token_amount = isV3 ? token_data.emissionAmount : (token_data.emissionAmount + 1);

    const issuanceBox = walletUtxos[0];
    const mintInputs = [issuanceBox, ...walletUtxos.filter((b: any) => b.boxId !== issuanceBox.boxId)];
    const apt_token_id = issuanceBox.boxId;

    const addressContent: ConstantContent = {
        owner: owner_ergotree ? owner_ergotree : ErgoAddress.fromBase58(walletPk).ergoTree,
        dev_addr: get_dev_contract_address(),
        dev_hash: get_dev_contract_hash(),
        dev_fee: get_dev_fee(),
        pft_token_id: token_id,
        base_token_id: base_token_id,
        ...(isV3 ? { apt_token_id: apt_token_id } : {})
    };

    const r4Hex = SPair(SBool(is_timestamp_limit), SLong(BigInt(blockLimit))).toHex();
    const r5Hex = SLong(BigInt(minimumSold)).toHex();
    const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex();
    const r7Hex = SLong(BigInt(exchangeRate)).toHex();
    const r8Hex = createR8Structure(addressContent).toHex();
    const r9Hex = SString(projectContent);

    const registerSizes = estimateRegisterSizes(r4Hex, r5Hex, r6Hex, r7Hex, r8Hex, r9Hex);
    const ergoTreeAddress = get_ergotree_hex(addressContent, version);

    const nonNftProjectTokens: Array<{ tokenId: string; amount: bigint }> = [
        { tokenId: apt_token_id, amount: BigInt(id_token_amount) }
    ];
    if (token_amount > 0) {
        nonNftProjectTokens.push({ tokenId: token_id, amount: BigInt(token_amount) });
    }

    const numProjectBoxTokens = nonNftProjectTokens.length + (isV3 ? 1 : 0);
    const totalEstimatedSize = estimateTotalBoxSize(ergoTreeAddress.length, numProjectBoxTokens, registerSizes);

    let minRequiredValue = BOX_VALUE_PER_BYTE * BigInt(totalEstimatedSize);
    if (minRequiredValue < SAFE_MIN_BOX_VALUE) {
        minRequiredValue = SAFE_MIN_BOX_VALUE;
    }

    const mintOutput = new OutputBuilder(
        SAFE_MIN_BOX_VALUE,
        mint_contract_address(addressContent, version)
    ).mintToken({
        amount: BigInt(id_token_amount),
        name: title + " APT",
        decimals: token_data.decimals,
        description: "Temporal-funding Token for the " + title + " project."
    });

    const currentHeight = await getCurrentHeight();

    const txA = new TransactionBuilder(currentHeight)
        .from(mintInputs)
        .to(mintOutput)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

    const creatorErgoTree = ErgoAddress.fromBase58(walletPk).ergoTree;
    const txBInputs = [txA.outputs[0], ...txA.outputs.slice(1).filter((out) => out.ergoTree === creatorErgoTree)];
    const projectOutput = new OutputBuilder(minRequiredValue, ergoTreeAddress);
    if (isV3) {
        projectOutput.mintToken({ amount: 1n });
    }
    projectOutput
        .addTokens(nonNftProjectTokens)
        .setAdditionalRegisters({
            R4: r4Hex,
            R5: r5Hex,
            R6: r6Hex,
            R7: r7Hex,
            R8: r8Hex,
            R9: r9Hex
        });

    const txB = new TransactionBuilder(currentHeight)
        .from(txBInputs)
        .to(projectOutput)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .sendChangeTo(walletPk)
        .build();

    const unsignedTransactions = [txA.toEIP12Object(), txB.toEIP12Object()];

    yield "Please sign the campaign creation transaction...";

    const transactionIds: string[] = [];
    for (const tx of unsignedTransactions) {
        const signed = await signTransaction(tx);
        const txId = await submitTransaction(signed);
        transactionIds.push(txId);
    }

    return transactionIds;
}
