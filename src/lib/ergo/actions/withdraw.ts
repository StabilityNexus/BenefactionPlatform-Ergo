import {
    OutputBuilder,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { createR8Structure, type Project } from '../../common/project';
import { get_ergotree_hex, supports_base_token } from '../contract';
import { addIdentityTokens, dev_fee_for } from '../replica';
import { getCurrentHeight, getChangeAddress, signTransaction, submitTransaction, getUtxos } from 'wallet-svelte-component';
import { get_dev_contract_address } from '../dev/dev_contract';
import { SColl, SPair, SByte, SBool } from '@fleet-sdk/serializer';

// Function to submit a project to the blockchain
export async function withdraw(
    project: Project,
    amount: number
): Promise<string | null> {

    // Check if this is a multi-token contract (v2) with a base token
    const isMultiToken = supports_base_token(project.version) && project.base_token_id && project.base_token_id !== "";
    const isERGBase = !isMultiToken;

    // Convert amount to smallest unit.
    //
    // Rounded, because the multiplication does not land on an integer for a good share of ordinary
    // inputs - 1.07 ERG gives 1070000000.0000001, 2.01 gives 2009999999.9999998 - and everything
    // downstream turns these into BigInt, which throws on anything fractional. Rounding rather
    // than truncating, so that 2.01 means 2010000000 and not one nanoERG less. The other actions
    // already guard this multiplication; this one did not.
    if (isERGBase) {
        // For ERG-based contracts, convert to nanoERG
        amount = Math.round(amount * Math.pow(10, 9));
    } else {
        // For token-based contracts, convert to smallest unit using token decimals
        const baseTokenDecimals = project.base_token_details?.decimals || 0;
        amount = Math.round(amount * Math.pow(10, baseTokenDecimals));
    }

    console.log("wants withdraw ", amount, isERGBase ? "(ERG)" : "(base token)")

    // Get the wallet address (will be the project address)
    const walletPk = await getChangeAddress();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [project.box, ...(await getUtxos())];

    // Building the project output
    let outputs: OutputBuilder[] = [];

    const devAddress = project.constants.dev_addr ?? get_dev_contract_address();
    const devFeePercentage = project.constants.dev_fee;

    // Get current base token amount if multi-token
    let currentBaseTokenAmount = 0;
    if (isMultiToken) {
        for (const token of project.box.assets) {
            if (token.tokenId === project.base_token_id) {
                currentBaseTokenAmount = Number(token.amount);
                break;
            }
        }
    }

    // Calculate extracted amount based on contract logic
    const extractedBaseAmount = isERGBase ? amount : Math.min(amount, currentBaseTokenAmount);

    // Validation based on contract requirements
    if (isERGBase) {
        // ERG withdrawal validation
        if (extractedBaseAmount > project.value) {
            alert("Not enough ERG to withdraw.");
            return null;
        }
    } else {
        // Token withdrawal validation
        if (extractedBaseAmount > currentBaseTokenAmount) {
            alert("Not enough base tokens to withdraw.");
            return null;
        }
    }

    // The fee is whatever the contract of THIS box computes - v3 rounds up, v2 and earlier
    // truncate. See dev_fee_for and #177.
    const devFeeAmount = Number(dev_fee_for(extractedBaseAmount, devFeePercentage, project.version));

    const projectAmountBase = extractedBaseAmount - devFeeAmount;

    // For ERG, subtract miner fee from project amount. For base tokens, no miner fee needed.
    const projectAmount = projectAmountBase;

    // Validation according to contract requirements
    if (isERGBase) {
        if (projectAmount < SAFE_MIN_BOX_VALUE) {
            alert("The withdrawal amount is too small after fees.");
            return null;
        }
    } else {
        if (projectAmount <= 0) {
            alert("The withdrawal amount is too small after fees.");
            return null;
        }
    }

    // Determine if this is a full withdrawal according to contract logic
    const allFundsWithdrawn = isERGBase ?
        (extractedBaseAmount === project.value) :
        (extractedBaseAmount === currentBaseTokenAmount);
    const allTokensWithdrawn = project.current_pft_amount === 0; // No PFT tokens left
    const isFullWithdrawal = allFundsWithdrawn && allTokensWithdrawn;

    console.log("Withdrawal details:", {
        extractedBaseAmount,
        devFeeAmount,
        projectAmount,
        allFundsWithdrawn,
        allTokensWithdrawn,
        isFullWithdrawal
    });

    if (!isFullWithdrawal) {
        // Partial withdrawal - need to replicate contract (isSelfReplication = true)

        // Calculate remaining amounts for the contract
        const remainingErg = isERGBase ?
            BigInt(project.value - extractedBaseAmount) :
            BigInt(project.value);

        const remainingBaseToken = isERGBase ?
            BigInt(0) :
            BigInt(currentBaseTokenAmount - extractedBaseAmount);

        const contractOutput = new OutputBuilder(
            remainingErg,
            get_ergotree_hex(project.constants, project.version)
        );
        // The APT is untouched by a withdrawal; the NFT rides along in v3.
        addIdentityTokens(contractOutput, project, BigInt(project.current_idt_amount));

        // Add PFT tokens if they exist (ProofFundingTokenRemainsConstant)
        if (project.current_pft_amount > 0) {
            contractOutput.addTokens({
                tokenId: project.pft_token_id,
                amount: BigInt(project.current_pft_amount)
            });
        }

        // Handle remaining base tokens for multi-token contracts
        if (isMultiToken && remainingBaseToken > 0) {
            contractOutput.addTokens({
                tokenId: project.base_token_id!,
                amount: remainingBaseToken
            });
        }

        // Set registers - all counters remain constant for withdrawal
        contractOutput.setAdditionalRegisters({
            R4: SPair(SBool(project.is_timestamp_limit), SLong(BigInt(project.block_limit))).toHex(),
            R5: SLong(BigInt(project.minimum_amount)).toHex(),
            R6: SColl(SLong, [BigInt(project.sold_counter), BigInt(project.refund_counter), BigInt(project.auxiliar_exchange_counter)]).toHex(),
            R7: SLong(BigInt(project.exchange_rate)).toHex(),
            R8: createR8Structure(project.constants).toHex(),
            R9: SString(project.content.raw)
        });
        outputs.push(contractOutput);
    }
    // If isFullWithdrawal is true, no contract output is created (contract ends)

    // Project output (OUTPUTS(1) in contract)
    if (isERGBase) {
        // For ERG-based, project receives ERG
        outputs.push(
            new OutputBuilder(
                BigInt(projectAmount),
                walletPk
            )
        );
    } else {
        // For multi-token, project receives base tokens
        outputs.push(
            new OutputBuilder(
                SAFE_MIN_BOX_VALUE,  // Minimum ERG for the box
                walletPk
            ).addTokens({
                tokenId: project.base_token_id!,
                amount: BigInt(projectAmount)
            })
        );
    }

    // Dev fee output (OUTPUTS(2) in contract)
    if (isERGBase) {
        // For ERG-based, dev receives ERG. A dev fee of 0 would create an invalid output,
        // but withdrawal amounts are expected to be large enough to always generate a fee.
        if (devFeeAmount > 0) {
            outputs.push(
                new OutputBuilder(
                    BigInt(devFeeAmount),
                    devAddress
                )
            );
        }
    } else {
        // For multi-token, the dev output box is always created to satisfy the contract.
        // It receives base tokens only if a fee is generated.
        const devOutput = new OutputBuilder(
            SAFE_MIN_BOX_VALUE,  // Minimum ERG for the box
            devAddress
        );

        if (devFeeAmount > 0) {
            devOutput.addTokens({
                tokenId: project.base_token_id!,
                amount: BigInt(devFeeAmount)
            });
        }

        // Set R4 register with token ID as Coll[Byte] so dev fee contract can identify token distributions
        // Convert hex string to byte array
        const tokenIdBytes = project.base_token_id!.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16));
        devOutput.setAdditionalRegisters({
            R4: SColl(SByte, tokenIdBytes).toHex()
        });

        outputs.push(devOutput);
    }

    console.log(outputs)

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await getCurrentHeight())
        .from(inputs)                          // Inputs coming from the user's UTXOs
        .to(outputs)                           // Outputs (the new project box)
        .sendChangeTo(walletPk)                // Send change back to the wallet
        .payFee(BigInt(1100000))               // Pay the recommended minimum fee
        .build()                               // Build the transaction
        .toEIP12Object();                      // Convert the transaction to an EIP-12 compatible object

    try {
        // Sign the transaction
        const signedTransaction = await signTransaction(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await submitTransaction(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e)
        return null;
    }
}