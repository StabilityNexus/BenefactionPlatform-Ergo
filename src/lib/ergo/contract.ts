
import { type ConstantContent } from "$lib/common/project";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";

import CONTRACT_V1_0 from '../../../contracts/bene_contract/contract_v1_0.es?raw';
import CONTRACT_V1_1 from '../../../contracts/bene_contract/contract_v1_1.es?raw';
import CONTRACT_V1_2 from '../../../contracts/bene_contract/contract_v1_2.es?raw';

export type contract_version = "v1_0" | "v1_1" | "v1_2";

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

function generate_contract_v1_2(
  owner_addr: string, 
  dev_fee_contract_bytes_hash: string, 
  dev_fee: number, 
  token_id: string, 
  base_token_id: string = ""
): string {
  return CONTRACT_V1_2
  .replace(/`\+owner_addr\+`/g, owner_addr)
    .replace(/`\+dev_fee_contract_bytes_hash\+`/g, dev_fee_contract_bytes_hash)
    .replace(/`\+dev_fee\+`/g, dev_fee.toString())
    .replace(/`\+token_id\+`/g, token_id)
    .replace(/`\+base_token_id\+`/g, base_token_id);

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
    case "v1_2":
      f = generate_contract_v1_2;
      break;
    default:
      throw new Error("Invalid contract version");
  }
  return f
}

export function get_address(constants: ConstantContent, version: contract_version) {

    // In case that dev_hash is undefined, we try to use the current contract hash. But the tx will fail if the hash is different.
    let contract;
    if (version === "v1_2") {
        contract = handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id, constants.base_token_id || "");
    } else {
        contract = handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id);
    }
    let ergoTree = compile(contract, {version: 1, network: network_id})

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function get_template_hash(version: contract_version): string {
  const random_mainnet_addr = "9f3iPJTiciBYA6DnTeGy98CvrwyEhiP7wNrhDrQ1QeKPRhTmaqQ";
  const random_testnet_addr = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
  let random_addr = network_id == "mainnet" ? random_mainnet_addr : random_testnet_addr;
  const random_dev_contract = uint8ArrayToHex(blake2b256("9a3d2f6b"));

  let contract;
  if (version === "v1_2") {
    contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5, "", "");
  } else {
    contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5, "");
  }
  return hex.encode(sha256(compile(contract, {version: 1, network: network_id}).template.toBytes()))
}

function get_contract_hash(constants: ConstantContent, version: contract_version): string {
  try {
      const contractSource = version === "v1_2"
          ? handle_contract_generator(version)(
              constants.owner, 
              constants.dev_hash ?? get_dev_contract_hash(), 
              constants.dev_fee, 
              constants.token_id, 
              constants.base_token_id || "" // Ensure empty string if undefined
          )
          : handle_contract_generator(version)(
              constants.owner, 
              constants.dev_hash ?? get_dev_contract_hash(), 
              constants.dev_fee, 
              constants.token_id
          );

      const ergoTree = compile(contractSource, {
          version: 1, 
          network: network_id
      });

      return uint8ArrayToHex(blake2b256(ergoTree.toBytes()));
  } catch (error) {
      console.error("Error compiling contract:", error);
      throw new Error(`Failed to compile contract: ${error.message}`);
  }
}
export function mint_contract_address(constants: ConstantContent, version: contract_version) {
  const contract_bytes_hash = get_contract_hash(constants, version);
  let contract = `
{
  val contractBox = OUTPUTS(0)

  val correctSpend = {
      val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1
      val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

      isIDT && spendAll
  }

  val correctContract = {
      fromBase16("`+contract_bytes_hash+`") == blake2b256(contractBox.propositionBytes)
  }

  sigmaProp(allOf(Coll(
      correctSpend,
      correctContract
  )))
}
`

  let ergoTree = compile(contract, {version: 1, network: network_id})

  let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
  return ergoTree.toAddress(network).toString();
}