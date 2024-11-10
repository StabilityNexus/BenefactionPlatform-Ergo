

/**
    https://api.ergoplatform.com/api/v1/docs/#operation/postApiV1BoxesUnspentSearch
*/

import { type Project, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";

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
    R6: 'SLong',
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

export async function fetch_projects(explorer_uri: string, ergo_tree_template_hash: string, ergo: any): Promise<Map<string, Project>> {
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
                    if (hasValidSigmaTypes(e.additionalRegisters)) {
                        let token_id = e.assets[0].tokenId;
                        let amount_sold = parseInt(e.additionalRegisters.R6.renderedValue);
                        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                        let current_amount = e.assets[0].amount;
                        let current_value = e.value - 1000000;

                        // Refunded amount
                        let collected_value = (amount_sold * exchange_rate) - 1000000;
                        let ergs_refunded = collected_value - current_value;
                        let refunded_amount = ergs_refunded / exchange_rate;
                        
                        projects.set(token_id, {
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
                            token_id: e.assets[0].tokenId,
                            block_limit: parseInt(e.additionalRegisters.R4.renderedValue),
                            minimum_amount: parseInt(e.additionalRegisters.R5.renderedValue),
                            total_amount: current_amount + amount_sold - refunded_amount,
                            current_amount: current_amount,
                            refunded_amount: refunded_amount,
                            amount_sold: amount_sold,
                            exchange_rate: exchange_rate,
                            content: getProjectContent(
                                token_id.slice(0, 8), 
                                hexToUtf8(e.additionalRegisters.R9.renderedValue) ?? ""
                            ),
                            owner: hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "",
                            value: e.value,
                            collected_value: collected_value,
                            current_value: current_value
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
