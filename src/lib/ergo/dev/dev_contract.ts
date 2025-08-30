import { compile } from "@fleet-sdk/compiler";
import { blake2b256, hex, sha256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "../utils";
import { Network } from "@fleet-sdk/core";
import { network_id } from "../envs";
import { distributeFunds } from "./distribute_funds";
import { explorer_uri } from "$lib/common/store";
import { get } from "svelte/store";

import DEV_FEE_CONTRACT from '../../../../contracts/dev_fee_contract/dev_fee.es?raw';

function wallets() {
    let bruno;
    let lgd;
    let jm;
    let order;

    if (network_id == "mainnet")
    {
        bruno = "9fBF4dceTsqdhsYUNVZHjsv4jqoKVzVv3KywFCycbkEXEq5j6bp";
        lgd   = "9gkRrMRdSstibAsVzCtYumUGbXDPQZHkfuAaqmA49FNH3tN4XDg";
        jm    = "9ejNy2qoifmzfCiDtEiyugthuXMriNNPhNKzzwjPtHnrK3esvbD";
        order = "9h9hjN2KC3jEyCa6KEYKBotPRESdo9oa29yyKcoSLWwtaX2VvhM";
    }
    else 
    {
        bruno = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
        lgd   = "3WxiAefTPNZckPoXq4sUx2SSPYyqhXppee7P1AP1C1A8bQyFP79S";
        jm    = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
        order = "3WxiAefTPNZckPoXq4sUx2SSPYyqhXppee7P1AP1C1A8bQyFP79S";
    }

    return {
        "bruno": bruno,
        "lgd": lgd,
        "jm": jm,
        "order": order
    }
}

function generate_contract(): string {
    let w = wallets()
    let bruno = w['bruno']
    let lgd = w['lgd']
    let jm = w['jm']
    let order = w['order']

    return DEV_FEE_CONTRACT
        .replace(/`\+bruno\+`/g, bruno)
        .replace(/`\+lgd\+`/g, lgd)
        .replace(/`\+jm\+`/g, jm)
        .replace(/`\+order\+`/g, order);
}

export function get_dev_contract_hash(): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(generate_contract(), {version: 1, network: network_id}).toBytes()  // Compile contract to ergo tree
        )                                                         // Blake2b256 hash of contract bytes
    );
}

export function get_dev_contract_address(): string {
    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return compile(generate_contract(), {version: 1, network: network_id}).toAddress(network).toString()
}

export function get_dev_fee(): number {
    return 5;
}

function get_template_hash(): string {
    let contract = generate_contract();
    return hex.encode(sha256(compile(contract, {version: 1, network: network_id}).template.toBytes()))
  }

export async function download_dev() {
    try {
        let params = {
            offset: 0,
            limit: 500,
        };
        let moreDataAvailable = true;

        while (moreDataAvailable) {
            const url = get(explorer_uri)+'/api/v1/boxes/unspent/search';
            const response = await fetch(url + '?' + new URLSearchParams({
                offset: params.offset.toString(),
                limit: params.limit.toString(),
            }), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                    "ergoTreeTemplateHash": get_template_hash(),
                    "registers": {},
                    "constants": {},
                    "assets": []
                }),
            });

            if (response.ok) {
                let json_data = await response.json();
                return json_data.items.map(e => ({
                    boxId: e.boxId,
                    value: e.value,
                    assets: e.assets,
                    ergoTree: e.ergoTree,
                    creationHeight: e.creationHeight,
                    additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                        acc[key] = value.serializedValue;
                        return acc;
                    }, {}),
                    index: e.index,
                    transactionId: e.transactionId
                }));
            } else {
                console.log(response)
            }
        }
    } catch (error) {
        console.error('Error while making the POST request:', error);
    }
    return []
}

export async function execute_dev(box) {
    try {
        console.log(`Executing action with Box ID: ${box.boxId} and Value: ${box.value}`);

        let w = wallets()
        let bruno = w['bruno']
        let lgd = w['lgd']
        let jm = w['jm']
        let order = w['order']

        distributeFunds(box, bruno, lgd, jm, order, 32, 32, 32, 4, box.value);
    } catch (e) {
        console.error("Error executing action:", e.message);
    }
}
