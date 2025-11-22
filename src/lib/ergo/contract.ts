import { type ConstantContent } from "$lib/common/project";
import { compile } from "@fleet-sdk/compiler";
import { Network, ErgoAddress } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from "./dev/dev_contract";

// Keep old imports only for get_template_hash (needed by fetch.ts)
import CONTRACT_V1_0 from '../../../contracts/bene_contract/contract_v1_0.es?raw';
import CONTRACT_V1_1 from '../../../contracts/bene_contract/contract_v1_1.es?raw';

// Current version contract
import CONTRACT_V2 from '../../../contracts/bene_contract/contract_v2.es?raw';
import MINT_CONTRACT from '../../../contracts/mint_contract/mint_idt.es?raw';

// Only v2 is supported for new projects
export type contract_version = "v2" | "v2_erg";

// Legacy versions only for template hash identification
type legacy_contract_version = "v1_0" | "v1_1";
type any_contract_version = contract_version | legacy_contract_version;

function generate_contract_v1_0(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string) {
  return CONTRACT_V1_0
    .replace(/`\+owner_addr\+`/g, owner_addr)
    .replace(/`\+dev_fee_contract_bytes_hash\+`/g, dev_fee_contract_bytes_hash)
    .replace(/`\+dev_fee\+`/g, dev_fee.toString())
    .replace(/`\+token_id\+`/g, token_id);
}

function generate_contract_v1_1(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string) {
  return CONTRACT_V1_1
    .replace(/`\+owner_addr\+`/g, owner_addr)
    .replace(/`\+dev_fee_contract_bytes_hash\+`/g, dev_fee_contract_bytes_hash)
    .replace(/`\+dev_fee\+`/g, dev_fee.toString())
    .replace(/`\+token_id\+`/g, token_id);
}

/**
 * Generate v2 contract (current version)
 */
function generate_contract_v2(
  owner_addr: string,
  dev_fee_contract_bytes_hash: string,
  dev_fee: number,
  pft_token_id: string,
  base_token_id: string = ""
): string {
  // Convert address to ErgoTree hex for P2S/P2PK support
  const ownerErgoTree = ErgoAddress.fromBase58(owner_addr).ergoTree;

  return CONTRACT_V2
    .replace(/`\+owner_ergotree\+`/g, ownerErgoTree)
    .replace(/`\+dev_fee_contract_bytes_hash\+`/g, dev_fee_contract_bytes_hash)
    .replace(/`\+dev_fee\+`/g, dev_fee.toString())
    .replace(/`\+pft_token_id\+`/g, pft_token_id)
    .replace(/`\+base_token_id\+`/g, base_token_id);
}

function handle_contract_generator(version: any_contract_version) {
  let f;
  switch (version) {
    case "v1_0":
      f = generate_contract_v1_0;
      break;
    case "v1_1":
      f = generate_contract_v1_1;
      break;
    case "v2":
    case "v2_erg": // v2_erg uses the same contract as v2
      f = generate_contract_v2;
      break;
    default:
      throw new Error("Invalid contract version");
  }
  return f
}

/**
 * Get ErgoTree hex for current version contracts only (v2)
 */
export function get_ergotree_hex(constants: ConstantContent, version: contract_version) {
  const contract = generate_contract_v2(
    constants.owner,
    constants.dev_hash ?? get_dev_contract_hash(),
    constants.dev_fee,
    constants.pft_token_id,
    constants.base_token_id || ""
  );

  const ergoTree = compile(contract, { version: 1, network: network_id });
  return ergoTree.toHex();
}

/**
 * Get template hash for ANY version (including legacy v1_0, v1_1)
 * This is needed by fetch.ts to identify old projects
 */
export function get_template_hash(version: any_contract_version): string {
  const random_constants = {
    "owner": "9fcwctfPQPkDfHgxBns5Uu3dwWpaoywhkpLEobLuztfQuV5mt3T",  // RANDOM
    "dev_addr": get_dev_contract_address(),   // RANDOM
    "dev_hash": get_dev_contract_hash(),   // RANDOM
    "dev_fee": get_dev_fee(),    //  RANDOM
    "pft_token_id": "a3f7c9e12bd45890ef12aa7c6d54b9317c0df4a28b6e5590d4f1b3e8c92d77af",   // RANDOM
    "base_token_id": version == "v2_erg" ? "" : "2c5d596d617aaafe16f3f58b2c562d046eda658f0243dc1119614160d92a4717" // RANDOM
  }

  let contract;
  if (version === "v2" || version === "v2_erg") {
    version = "v2"; // treat v2_erg as v2 for contract generation
    contract = handle_contract_generator(version)(random_constants.owner, random_constants.dev_hash ?? get_dev_contract_hash(), random_constants.dev_fee, random_constants.pft_token_id, random_constants.base_token_id || "");
  } else {
    contract = handle_contract_generator(version)(random_constants.owner, random_constants.dev_hash ?? get_dev_contract_hash(), random_constants.dev_fee, random_constants.pft_token_id);
  }

  let ergoTree = compile(contract, { version: 1, network: network_id });
  let templateBytes = ergoTree.template;
  return uint8ArrayToHex(sha256(templateBytes));
}

/**
 * Get contract hash for v2 contracts only
 */
function get_contract_hash(constants: ConstantContent, version: contract_version): string {
  try {
    const contractSource = generate_contract_v2(
      constants.owner,
      constants.dev_hash ?? get_dev_contract_hash(),
      constants.dev_fee,
      constants.pft_token_id,
      constants.base_token_id || ""
    );

    const ergoTree = compile(contractSource, {
      version: 1,
      network: network_id
    });

    return uint8ArrayToHex(blake2b256(ergoTree.bytes));
  } catch (error: any) {
    console.error("Error compiling contract:", error);
    throw new Error(`Failed to compile contract: ${error?.message || error}`);
  }
}

/**
 * Get mint contract address for v2 contracts only
 */
export function mint_contract_address(constants: ConstantContent, version: contract_version) {
  const contract_bytes_hash = get_contract_hash(constants, version);
  let contract = MINT_CONTRACT.replace(/`\+contract_bytes_hash\+`/g, contract_bytes_hash);

  let ergoTree = compile(contract, { version: 1, network: network_id })

  let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
  return ergoTree.toAddress(network).toString();
}