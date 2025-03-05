

/**
    https://api.ergoplatform.com/api/v1/docs/#operation/postApiV1BoxesUnspentSearch
*/

import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { explorer_uri } from "./envs";
import { ergo_tree_template_hash, get_template_hash } from "./contract";

const expectedSigmaTypes = {
    R4: 'SInt',
    R5: 'SLong',
    R6: 'Coll[SLong]',
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


export async function fetch_token_details(id: string): Promise<TokenEIP4> {
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
                        "decimals": json_data['decimals'],
                        "emissionAmount": json_data['emissionAmount']
                    }
                }
                else if (json_data['type'] == null) {
                    return {
                        "name": id.slice(0,6),
                        "description": "",
                        "decimals": 0,
                        "emissionAmount": json_data['emissionAmount']
                    }
                }
            }
        } catch {}
        return {
            'name': 'token',
            'description': "",
            'decimals': 0,
            'emissionAmount': null
        };
}

export async function wait_until_confirmation(tx_id: string): Promise<Box | null> {
    const url = explorer_uri + '/api/v1/transactions/' + tx_id;

    // Wait for 90 seconds before retrying
    await new Promise(resolve => setTimeout(resolve, 90000));

    const startTime = Date.now();

    while (true) {
        try {
            // Perform GET request to fetch transaction details
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const json_data = await response.json();

                // Check if numConfirmations is greater than 0
                if (json_data.numConfirmations > 0) {
                    let e = json_data['outputs'][0];
                    return {
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
                    };
                }
            } else {
               //  console.log(`Error fetching transaction: ${response.statusText}`);
            }
        } catch (error) {
           //  console.log(`Error during fetch: ${error}`);
        }

        // Check if 5 minutes have passed
        if (Date.now() - startTime > 5 * 60 * 1000) {
            return null;
        }

        // Wait for 5 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

export async function fetch_projects(): Promise<Map<string, Project>> {
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
                    "ergoTreeTemplateHash": get_template_hash("v1_0"),
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
                        const constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "")

                        if (constants === null) { console.log("constants null"); continue; }
                        if (e.assets.length > 1 && e.assets[1].tokenId !== constants.token_id) { console.log("Constant token error with "+e); continue; }

                        let project_id = e.assets[0].tokenId;
                        let token_id = constants.token_id;
                        let [token_amount_sold, refunded_token_amount, auxiliar_exchange_counter] = JSON.parse(e.additionalRegisters.R6.renderedValue);
                        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                        let current_pft_amount = e.assets.length > 1 ? e.assets[1].amount : 0;
                        let total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
                        let unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
                        let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
                        let minimum_token_amount = parseInt(e.additionalRegisters.R5.renderedValue);
                        let block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
                        let collected_value = (token_amount_sold * exchange_rate);

                        projects.set(project_id, {
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
                            project_id: project_id,
                            current_idt_amount: e.assets[0].amount,
                            token_id: constants.token_id,
                            block_limit: block_limit,
                            minimum_amount: minimum_token_amount,
                            maximum_amount: total_pft_amount,
                            total_pft_amount: total_pft_amount,
                            current_pft_amount: current_pft_amount,
                            unsold_pft_amount: unsold_pft_amount,
                            refund_counter: refunded_token_amount,
                            sold_counter: token_amount_sold,
                            auxiliar_exchange_counter: auxiliar_exchange_counter,
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
