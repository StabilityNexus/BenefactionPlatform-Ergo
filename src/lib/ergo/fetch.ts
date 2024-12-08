

/**
    https://api.ergoplatform.com/api/v1/docs/#operation/postApiV1BoxesUnspentSearch
*/

import { SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { explorer_uri } from "./envs";

type RegisterValue = {
    renderedValue: string;
    serializedValue: string;
  };

type ApiBox = {
    boxId: string;
    value: string | bigint;
    assets: { tokenId: string; amount: string | bigint }[];
    ergoTree: string;
    creationHeight: number;
    additionalRegisters: {
        R4?: RegisterValue;
        R5?: RegisterValue;
        R6?: RegisterValue;
        R7?: RegisterValue;
        R8?: RegisterValue;
        R9?: RegisterValue;
    };
    index: number;
    transactionId: string;
};

const expectedSigmaTypes = {
    R4: 'SInt',
    R5: 'SLong',
    R6: '(SLong, SLong)',
    R7: 'SLong',
    R8: 'Coll[SByte]',
    R9: 'Coll[SByte]'
};

function hasValidSigmaTypes(additionalRegisters: any): boolean {
    for (const [key, expectedType] of Object.entries(expectedSigmaTypes)) {
        if (additionalRegisters[key] && additionalRegisters[key].sigmaType !== expectedType) {
            return false;
        }
    }
    return true;
}


async function fetch_token_details(id: string): Promise<TokenEIP4> {
    const url = explorer_uri+'/api/v1/tokens/'+id;
        const response = await fetch(url, {
            method: 'GET',
        });

        try{
            if (response.ok) {
                let json_data = await response.json();
                if (json_data['type'] == 'EIP-004') {
                    return {
                        "name": json_data['name'],
                        "description": json_data['description'],
                        "decimals": json_data['decimals']
                    }
                }
            }
        } catch {}
        return {
            'name': 'tokens',
            'description': "",
            'decimals': 0
        };
}

export async function fetch_projects(explorer_uri: string, ergo_tree_template_hash: string): Promise<Map<string, Project>> {
    try {
        let params = {
            offset: 0,
            limit: 500,
        };
        let projects = new Map<string, Project>();
        let moreDataAvailable = true;
        let registers = {};

        while (moreDataAvailable) {
            const url = explorer_uri+'/api/v1/boxes/unspent/search';
            const response = await fetch(url + '?' + new URLSearchParams({
                offset: params.offset.toString(),
                limit: params.limit.toString(),
            }), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                    "ergoTreeTemplateHash": ergo_tree_template_hash,
                    "registers": registers,
                    "constants": {},
                    "assets": []
                }),
            });

            if (response.ok) {
                let json_data = await response.json();
                if (json_data.items.length == 0) {
                    moreDataAvailable = false;
                    break;
                }
                for (const e of json_data.items) {
                    console.log(e)
                    if (hasValidSigmaTypes(e.additionalRegisters)) {
                        const constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "")

                        if (constants === null) { console.log("constants null"); continue; }
                        if (constants.project_id === undefined) { console.log("constants project id"); continue; }
                        if (e.assets.length > 0 && e.assets[0].tokenId !== constants.token_id) { console.log("Constant token error with "+e); continue; }

                        let token_id = constants.token_id;
                        let [token_amount_sold, refunded_token_amount] = e.additionalRegisters.R6.renderedValue.match(/\d+/g)?.map(Number);
                        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                        let current_token_amount = e.assets.length > 0 ? e.assets[0].amount : 0;
                        let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
                        let minimum_token_amount = parseInt(e.additionalRegisters.R5.renderedValue);
                        let block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
                        let collected_value = (token_amount_sold * exchange_rate);

                        console.log("set")

                        projects.set(constants.project_id, {
                            platform: new ErgoPlatform(),
                            box: {
                                boxId: e.boxId,
                                value: e.value,
                                assets: e.assets,
                                ergoTree: e.ergoTree,
                                creationHeight: e.creationHeight,
                                additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                                    acc[key] = value.serializedValue;
                                    return acc;
                                }, {} as {
                                    [key: string]: string;
                                }),
                                index: e.index,
                                transactionId: e.transactionId
                            },
                            project_id: constants.project_id,
                            token_id: constants.token_id,
                            block_limit: block_limit,
                            minimum_amount: minimum_token_amount,
                            total_amount: current_token_amount + token_amount_sold - refunded_token_amount,
                            current_amount: current_token_amount,
                            refunded_amount: refunded_token_amount,
                            amount_sold: token_amount_sold,
                            exchange_rate: exchange_rate,
                            content: getProjectContent(
                                token_id.slice(0, 8), 
                                hexToUtf8(e.additionalRegisters.R9.renderedValue) ?? ""
                            ),
                            constants: constants,
                            value: e.value,
                            collected_value: collected_value  - Number(SAFE_MIN_BOX_VALUE),
                            current_value: current_erg_value,
                            token_details: await fetch_token_details(token_id)
                        })
                    }
                }                
                params.offset += params.limit;
            } 
            else {
                console.error('Error while making the POST request');
                return new Map();
            }
        }
        return projects;
    } catch (error) {
        console.error('Error while making the POST request:', error);
        return new Map();
    }
}
