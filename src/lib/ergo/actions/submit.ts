// =======================
//  Project Submission Flow
//  SINGLE-SIGNATURE VERSION
// =======================
//
// This file replaces the previous 2-step flow (mint → create)
// with ONE atomic transaction:
//
// • Mints the project token
// • Creates the project (APT) box
// • Adds registers R4–R9
// • Sends only ONE signing request to Nautilus
//
// No debugging code, no extra logs — pure clean PR-ready version.
//

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
// Helper: Load token metadata
// ===================================
async function get_token_data(token_id: string) {
  const data = await fetch_token_details(token_id);

// Validate raw emission amount first
const emissionAmount = data["emissionAmount"] ?? 0;

if (emissionAmount === 0) {
    throw new Error("Token emission is 0 – cannot mint.");
}

// Final minted supply for APT/IDT
const emission = emissionAmount + 1;

return {
    amount: emission,
    decimals: data["decimals"]
};

}


// ===================================
// Main: Build & submit project TX
// SINGLE SIGNATURE
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
  // (2) Determine wallet owner tree
  // -------------------------------
  const walletPk = await getChangeAddress();

  const addressContent: ConstantContent = {
    owner: owner_ergotree || ErgoAddress.fromBase58(walletPk).ergoTree,   // This makes user the owner
    dev_addr: get_dev_contract_address(),
    dev_hash: get_dev_contract_hash(),
    dev_fee: get_dev_fee(),
    pft_token_id: token_id,
    base_token_id: base_token_id
  };

  // -------------------------------
  // (3) Load token emission metadata
  // -------------------------------
  const token_data = await get_token_data(token_id);

  // -------------------------------
  // (4) Build registers R4–R9
  // -------------------------------
  // R4: (is_timestamp_limit, blockLimit)
  const r4 = SPair(
    SBool(is_timestamp_limit),
    SLong(BigInt(blockLimit))
  ).toHex();

  // R5: minimum sold requirement
  const r5 = SLong(BigInt(minimumSold)).toHex();

  // R6: empty tracking structure
  const r6 = SColl(SLong, [0n, 0n, 0n]).toHex();

  // R7: exchange rate
  const r7 = SLong(BigInt(exchangeRate)).toHex();

  // R8: contract-required constants (owner, dev info, token ids)
  const r8 = createR8Structure(addressContent).toHex();

  // R9: project content JSON (UTF-8 encoded)
  const r9 = SString(projectContent);


  // -------------------------------
  // (5) Estimate box size & min value
  // -------------------------------
  const registerSizes = estimateRegisterSizes(r4, r5, r6, r7, r8, r9);

  const ergoTree = get_ergotree_hex(addressContent, version);

  const estimatedSize = estimateTotalBoxSize(
    ergoTree.length,
    3,                 // number of assets the box will contain
    registerSizes
  );

  let minValue = BOX_VALUE_PER_BYTE * BigInt(estimatedSize);
  if (minValue < SAFE_MIN_BOX_VALUE) minValue = SAFE_MIN_BOX_VALUE;


  // -------------------------------
  // (6) Build the SINGLE output box
  //     This box mints AND creates project
  // -------------------------------
  const projectOutput = new OutputBuilder(minValue, ergoTree)
    .mintToken({
      amount: BigInt(token_data.amount),
      name: title + " APT",
      decimals: token_data.decimals,
      description: "Temporal-funding Token for " + title
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
  // (7) Build unsigned transaction
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
  // (8) Only ONE signature needed
  // -------------------------------
  yield "Please sign the transaction…";

  const signed = await signTransaction(unsignedTx);


  // -------------------------------
  // (9) Submit to Ergo network
  // -------------------------------
  const txId = await submitTransaction(signed);

  return txId;
}
