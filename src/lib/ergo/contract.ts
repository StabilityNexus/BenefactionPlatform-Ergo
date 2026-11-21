import { type ConstantContent } from "$lib/common/project";
import { compile } from "@fleet-sdk/compiler";
import * as FleetCore from "@fleet-sdk/core";
import { Network } from "@fleet-sdk/core";
import { sha256, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from "./dev/dev_contract";

import CONTRACT_V1_0 from '../../../contracts/bene_contract/contract_v1_0.es?raw';
import CONTRACT_V1_1 from '../../../contracts/bene_contract/contract_v1_1.es?raw';
import CONTRACT_V2 from '../../../contracts/bene_contract/contract_v2.es?raw';
import CONTRACT_V3 from '../../../contracts/bene_contract/contract_v3.es?raw';

import MINT_CONTRACT_V2 from '../../../contracts/mint_contract/mint_idt.es?raw';
import MINT_CONTRACT_V3 from '../../../contracts/mint_contract/mint_idt_v3.es?raw';

export type contract_version = "v3" | "v2" | "v1_1" | "v1_0";

export const TERMINAL_ERGOTREE_HEX = "1906010100d17300";

const templateHashCache = new Map<string, string>();

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

export function get_ergotree_hex(constants: ConstantContent, version: contract_version = "v2") {
    let contract: string;
    switch (version) {
        case "v3":
            contract = CONTRACT_V3;
            break;
        case "v2":
            contract = CONTRACT_V2;
            break;
        case "v1_1":
            contract = generate_contract_v1_1(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.pft_token_id);
            break;
        case "v1_0":
            contract = generate_contract_v1_0(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.pft_token_id);
            break;
        default:
            throw new Error("Invalid contract version");
    }
    return compile(contract, { version: 1, network: network_id }).toHex();
}

export function get_template_hash(version: contract_version): string {
    const cacheKey = `${network_id}:${version}`;
    const cached = templateHashCache.get(cacheKey);
    if (cached) return cached;

    const rc = {
        owner: "9fcwctfPQPkDfHgxBns5Uu3dwWpaoywhkpLEobLuztfQuV5mt3T",
        dev_addr: get_dev_contract_address(),
        dev_hash: get_dev_contract_hash(),
        dev_fee: get_dev_fee(),
        pft_token_id: "a3f7c9e12bd45890ef12aa7c6d54b9317c0df4a28b6e5590d4f1b3e8c92d77af",
        base_token_id: "2c5d596d617aaafe16f3f58b2c562d046eda658f0243dc1119614160d92a4717"
    };

    const contract =
        version === "v3" ? CONTRACT_V3 :
        version === "v2" ? CONTRACT_V2 :
        version === "v1_1" ? generate_contract_v1_1(rc.owner, rc.dev_hash, rc.dev_fee, rc.pft_token_id) :
        generate_contract_v1_0(rc.owner, rc.dev_hash, rc.dev_fee, rc.pft_token_id);

    const ergoTree = compile(contract, { version: 1, network: network_id });
    const hash = uint8ArrayToHex(sha256(ergoTree.template));
    templateHashCache.set(cacheKey, hash);
    return hash;
}

export function compute_ergotree_template_hash(ergoTreeHex: string): string | null {
    try {
        const ErgoTreeCls = (FleetCore as any).ErgoTree;
        if (!ErgoTreeCls) return null;
        const tree = new ErgoTreeCls(ergoTreeHex);
        return uint8ArrayToHex(sha256(tree.template));
    } catch {
        return null;
    }
}

function get_contract_hash(version: contract_version): string {
    const src = version === "v3" ? CONTRACT_V3 : CONTRACT_V2;
    const ergoTree = compile(src, { version: 1, network: network_id });
    return uint8ArrayToHex(blake2b256(ergoTree.bytes));
}

export function mint_contract_address(_constants: ConstantContent, version: contract_version = "v2") {
    const contract_bytes_hash = get_contract_hash(version);
    const mintTemplate = version === "v3" ? MINT_CONTRACT_V3 : MINT_CONTRACT_V2;
    const contract = mintTemplate.replace(/`\+contract_bytes_hash\+`/g, contract_bytes_hash);
    const ergoTree = compile(contract, { version: 1, network: network_id });
    const network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}
