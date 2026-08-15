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

import CONTRACT_V2 from '../../../contracts/bene_contract/contract_v2.es?raw';
import MINT_CONTRACT from '../../../contracts/mint_contract/mint_idt.es?raw';

// Current version contract
import CONTRACT_V3 from '../../../contracts/bene_contract/contract_v3.es?raw';
import MINT_CONTRACT_V3 from '../../../contracts/mint_contract/mint_idt_v3.es?raw';

export type contract_version = "v3" | "v2" | "v1_1" | "v1_0";

/**
 * The versions whose source the platform still compiles, newest first.
 *
 * Order matters where a box has to be identified: a v3 box parses as v3 and nothing else, but the
 * search is cheapest when the current version is tried first.
 */
export const CONTRACT_VERSIONS: contract_version[] = ["v3", "v2", "v1_1", "v1_0"];

/**
 * Where the project's own identity lives in `tokens`.
 *
 * v3 puts a singleton NFT at index 0 and moves the APT to index 1; before that the APT sat at
 * index 0 and did both jobs, which is the whole of #176. Every other token keeps its position
 * relative to the APT, so one offset describes the difference.
 */
export function has_project_nft(version: contract_version): boolean {
  return version === "v3";
}

/**
 * Whether the version can denominate a campaign in a token other than ERG.
 *
 * Introduced in v2 and kept in v3. Written as a predicate because the check used to be spelled
 * `version === "v2"` at each call site, which silently excluded every later version.
 */
export function supports_base_token(version: contract_version): boolean {
  return version === "v2" || version === "v3";
}

/**
 * Whether R4 holds the `(Boolean, Long)` deadline tuple rather than a bare block height.
 * v1 stored an Int; v2 introduced the tuple and v3 keeps it.
 */
export function has_deadline_tuple(version: contract_version): boolean {
  return version === "v2" || version === "v3";
}

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

function generate_contract_v2(): string {
  return CONTRACT_V2;
}

/**
 * Generate v3 contract (current version)
 */
function generate_contract_v3(): string {
  return CONTRACT_V3;
}

function handle_contract_generator(version: contract_version) {
  let f;
  switch (version) {
    case "v1_0":
      f = generate_contract_v1_0;
      break;
    case "v1_1":
      f = generate_contract_v1_1;
      break;
    case "v2":
      f = generate_contract_v2;
      break;
    case "v3":
      f = generate_contract_v3;
      break;
    default:
      throw new Error("Invalid contract version");
  }
  return f
}

/**
 * The source a constant-free version compiles from.
 *
 * v2 and v3 carry no per-project constants, so their source is the contract itself. v1_0 and v1_1
 * substituted the owner and the fee into the script, which is why they are not here: a v1 replica
 * cannot be rebuilt without the constants, and the platform has not created one for a long time.
 */
function constant_free_source(version: contract_version): string {
  switch (version) {
    case "v3":
      return CONTRACT_V3;
    case "v2":
      return CONTRACT_V2;
    default:
      throw new Error(
        `Cannot rebuild a ${version} box: its script depends on constants that are not recoverable here`
      );
  }
}

/**
 * Compiling a contract is expensive and its result never changes, so each version is compiled
 * once. This matters now that every box the platform reads is checked against the script of the
 * version it claims: without the cache that is one compilation per box per scan.
 */
const ergotree_cache = new Map<contract_version, string>();

/**
 * Get ErgoTree hex for the version of the box being rebuilt.
 *
 * Every action that replicates a project box passes the version of the box it is spending, not the
 * version the platform currently deploys: a v2 campaign has to keep replicating as v2, or the
 * contract's own `sameScript` check rejects the transaction.
 */
export function get_ergotree_hex(constants: ConstantContent, version: contract_version) {
  const cached = ergotree_cache.get(version);
  if (cached) return cached;

  const ergoTree = compile(constant_free_source(version), { version: 1, network: network_id });
  const hex = ergoTree.toHex();
  ergotree_cache.set(version, hex);
  return hex;
}

/**
 * Get template hash for ANY version (including legacy v1_0, v1_1)
 * This is needed by fetch.ts to identify old projects
 */
export function get_template_hash(version: contract_version): string {
  const random_constants = {
    "owner": "9fcwctfPQPkDfHgxBns5Uu3dwWpaoywhkpLEobLuztfQuV5mt3T",  // RANDOM
    "dev_addr": get_dev_contract_address(),   // RANDOM
    "dev_hash": get_dev_contract_hash(),   // RANDOM
    "dev_fee": get_dev_fee(),    //  RANDOM
    "pft_token_id": "a3f7c9e12bd45890ef12aa7c6d54b9317c0df4a28b6e5590d4f1b3e8c92d77af",   // RANDOM
    "base_token_id": "2c5d596d617aaafe16f3f58b2c562d046eda658f0243dc1119614160d92a4717" // RANDOM
  }

  let contract;
  if (version === "v2" || version === "v3") {
    contract = constant_free_source(version);
  } else {
    contract = handle_contract_generator(version)(random_constants.owner, random_constants.dev_hash ?? get_dev_contract_hash(), random_constants.dev_fee, random_constants.pft_token_id);
  }

  let ergoTree = compile(contract, { version: 1, network: network_id });
  let templateBytes = ergoTree.template;
  return uint8ArrayToHex(sha256(templateBytes));
}

/**
 * Blake2b-256 of the proposition bytes of `version`'s contract - what the mint contract compares
 * OUTPUTS(0) against, so that the minted tokens can only be spent into the real project box.
 */
function get_contract_hash(constants: ConstantContent, version: contract_version): string {
  try {
    const ergoTree = compile(constant_free_source(version), {
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
 * Get the mint contract address for the version being created.
 *
 * v3 mints two things in Tx B rather than one - the project NFT alongside the APT - so it has its
 * own mint contract; pairing a v3 project with the v2 mint contract would create a box with no NFT
 * at tokens(0), which v3 rejects.
 */
export function mint_contract_address(constants: ConstantContent, version: contract_version) {
  const contract_bytes_hash = get_contract_hash(constants, version);
  const source = version === "v3" ? MINT_CONTRACT_V3 : MINT_CONTRACT;
  let contract = source.replace(/`\+contract_bytes_hash\+`/g, contract_bytes_hash);

  let ergoTree = compile(contract, { version: 1, network: network_id })

  let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
  return ergoTree.toAddress(network).toString();
}
