// =======================
//  Project Submission Flow
//  SINGLE-SIGNATURE VERSION
// =======================

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

import { get_ergotree_hex, type contract_version } from '../contract';
import { createR8Structure, type ConstantContent } from '$lib/common/project';

import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details } from '../fetch';

import {
  getCurrentHeight,
  getChangeAddress,
  signTransaction,
  submitTransaction,
  getUtxos
} from 'wallet-svelte-component';

import {
  validateProjectContent,
  estimateRegisterSizes,
  estimateTotalBoxSize
} from '../utils/box-size-calculator';

// ===================================
// Helper: Load token metadata (FIXED)
// ===================================
async function get_token_data(token_id: string) {
  const data = await fetch_token_details(token_id);

  const emission = data["emissionAmount"] ?? 0;
  if (emission <= 0) {
    throw new Error("Token emission is 0 — cannot mint.");
  }

  return {
    amount: emission + 1, // +1 only for ID token
    decimals: data["decimals"]
  };
}

// ===================================
// Helper: Validate ErgoTree hex
// ===================================
function isValidErgoTreeHex(tree: string): boolean {
  return /^[0-9a-fA-F]+$/.test(tree) && tree.length > 10;
}

// ===================================
// Main submission flow
// ===================================
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
) {
  // -------------------------------
  // (1) Validate project JSON
  // -------------------------------
  let parsedContent;
  try {
    parsedContent = JSON.parse(projectContent);
  } catch {
    alert("Invalid project content JSON.");
    return null;
  }

  const validation = validateProjectContent(parsedContent);
  if (!validation.isValid) {
    alert(validation.message);
    return null;
  }

  // -------------------------------
  // (2) Determine owner safely
  // -------------------------------
  const walletPk = await getChangeAddress();

  let ownerTree = ErgoAddress.fromBase58(walletPk).ergoTree;
  if (owner_ergotree) {
    if (!isValidErgoTreeHex(owner_ergotree)) {
      alert("Invalid owner ErgoTree hex.");
      return null;
    }
    ownerTree = owner_ergotree;
  }

  const addressContent: ConstantContent = {
    owner: ownerTree,
    dev_addr: get_dev_contract_address(),
    dev_hash: get_dev_contract_hash(),
    dev_fee: get_dev_fee(),
    pft_token_id: token_id,
    base_token_id
  };

  // -------------------------------
  // (3) Load token data
  // -------------------------------
  const token_data = await get_token_data(token_id);

  // -------------------------------
  // (4) Registers R4–R9
  // -------------------------------
  const r4 = SPair(
    SBool(is_timestamp_limit),
    SLong(BigInt(blockLimit))
  ).toHex();

  const r5 = SLong(BigInt(minimumSold)).toHex();

  // R6: SAFE 2-element structure (contract compatible)
  const r6 = SColl(SLong, [0n, 0n]).toHex();

  const r7 = SLong(BigInt(exchangeRate)).toHex();
  const r8 = createR8Structure(addressContent).toHex();
  const r9 = SString(projectContent);

  // -------------------------------
  // (5) Estimate box size (FIXED)
  // -------------------------------
  const registerSizes = estimateRegisterSizes(r4, r5, r6, r7, r8, r9);
  const ergoTree = get_ergotree_hex(addressContent, version);

  const estimatedSize = estimateTotalBoxSize(
    ergoTree.length,
    2, // minted APT + contributed token
    registerSizes
  );

  let minValue = BOX_VALUE_PER_BYTE * BigInt(estimatedSize);
  if (minValue < SAFE_MIN_BOX_VALUE) minValue = SAFE_MIN_BOX_VALUE;

  // -------------------------------
  // (6) Build project output
  // -------------------------------
  const projectOutput = new OutputBuilder(minValue, ergoTree)
    .mintToken({
      amount: BigInt(token_data.amount),
      name: `${title} APT`,
      decimals: token_data.decimals,
      description: `Temporal-funding Token for ${title}`
    })
    .addTokens([
      { tokenId: token_id, amount: token_amount.toString() }
    ])
    .setAdditionalRegisters({
      R4: r4,
      R5: r5,
      R6: r6,
      R7: r7,
      R8: r8,
      R9: r9
    });

  // -------------------------------
  // (7) Build transaction
  // -------------------------------
  const height = await getCurrentHeight();
  const utxos = await getUtxos();

  const unsignedTx = await new TransactionBuilder(height)
    .from(utxos)
    .to([projectOutput])
    .sendChangeTo(walletPk)
    .payFee(RECOMMENDED_MIN_FEE_VALUE)
    .build()
    .toEIP12Object();

  // -------------------------------
  // (8) Sign & submit
  // -------------------------------
  yield "Please sign the transaction…";

  const signed = await signTransaction(unsignedTx);
  const txId = await submitTransaction(signed);

  return txId;
}
