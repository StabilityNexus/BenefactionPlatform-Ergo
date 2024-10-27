

/**
    https://api.ergoplatform.com/api/v1/docs/#operation/postApiV1BoxesUnspentSearch
*/

import type { Project } from "./project";
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
                    let token_id = e.assets[0].tokenId;
                    projects.set(token_id, {
                        box: e,
                        token_id: e.assets[0].tokenId.slice(0, 6),
                        block_limit: parseInt(hexToUtf8(e.additionalRegisters.R4.renderedValue), 10),
                        minimum_amount: parseInt(hexToUtf8(e.additionalRegisters.R5.renderedValue), 10),
                        total_amount: e.assets[0].amount,
                        exchange_rate: parseInt(hexToUtf8(e.additionalRegisters.R7.renderedValue), 10),
                        link: hexToUtf8(e.additionalRegisters.R9.renderedValue) ?? "",
                        owner: hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "",
                        value: e.value,
                        amount_sold: parseInt(hexToUtf8(e.additionalRegisters.R6.renderedValue), 10),
                    })
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