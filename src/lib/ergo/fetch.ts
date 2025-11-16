import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { type contract_version, get_template_hash } from "./contract";
import { tokenDetailsCache } from "./cache";
import { explorer_uri, projects } from "$lib/common/store";
import { get } from "svelte/store";

const expectedSigmaTypes = {
    R4: 'SInt',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'SLong', // For v1_0 and v1_1, will be 'Coll[SLong]' for v1_2
    R8: 'Coll[SByte]',
    R9: 'Coll[SByte]'
};

const expectedSigmaTypesV12 = {
    R4: 'SInt',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'Coll[SLong]', // For v1_2: [exchange_rate, base_token_id_len]
    R8: 'Coll[SByte]',
    R9: 'Coll[SByte]'
};

// Cache duration (e.g. 5 minutes)
const CACHE_DURATION_MS = 1000 * 60 * 5;

// Variable to track an ongoing request
let inFlightFetch: Promise<Map<string, Project>> | null = null;

function hasValidSigmaTypes(additionalRegisters: any, version: contract_version = "v1_0"): boolean {
    const expectedTypes = version === "v1_2" ? expectedSigmaTypesV12 : expectedSigmaTypes;
    for (const [key, expectedType] of Object.entries(expectedTypes)) {
        if (additionalRegisters[key] && additionalRegisters[key].sigmaType !== expectedType) {
            return false;
        }
    }
    return true;
}

export async function fetch_token_details(id: string): Promise<TokenEIP4> {
    // Use cache for token details
    const cacheKey = `token_${id}`;
    
    return await tokenDetailsCache.get(
        cacheKey,
        async () => {
            const url = get(explorer_uri)+'/api/v1/tokens/'+id;
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
        },
        30 * 60 * 1000 // 30 minutes TTL for token details
    );
}

export async function wait_until_confirmation(tx_id: string): Promise<Box | null> {
    const url = get(explorer_uri) + '/api/v1/transactions/' + tx_id;

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
                            acc[key] = (value as any).serializedValue;
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

// Internal function for fetching projects from blockchain
export async function fetchProjectsFromBlockchain() {
    console.log("Fetch projects from blockchain");
    const registers = {};
    let moreDataAvailable;

    const versions: contract_version[] = ["v1_2", "v1_0"];

    try {
        for (const version of versions) {
            moreDataAvailable = true;
            let params = {
                offset: 0, // Starts at 0 for each version
                limit: 100, // Increased limit for fewer requests
            };

            let template = get_template_hash(version);

            while (moreDataAvailable) {
                const url = get(explorer_uri) + '/api/v1/boxes/unspent/search';
                const response = await fetch(url + '?' + new URLSearchParams({
                    offset: params.offset.toString(),
                    limit: params.limit.toString(),
                }), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "ergoTreeTemplateHash": template,
                        "registers": registers,
                        "constants": {},
                        "assets": []
                    }),
                });

                if (!response.ok) {
                    console.error('Error while making the POST request');
                    moreDataAvailable = false; // Stop loop on error
                    break;
                }
                
                const json_data = await response.json();
                
                if (!json_data.items || json_data.items.length === 0) {
                    moreDataAvailable = false;
                    break;
                }

                for (const e of json_data.items) {
                    if (true || hasValidSigmaTypes(e.additionalRegisters, version)) {
                        console.log(e)
                        const constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "");

                        if (constants === null) { console.warn("constants null"); continue; }
                        if (e.assets.length > 2 && e.assets[1].tokenId !== constants.token_id) { console.warn("Constant token error with " + constants.token_id); continue; }

                        let project_id = e.assets[0].tokenId;
                        let token_id = constants.token_id;
                        let [token_amount_sold, refunded_token_amount, auxiliar_exchange_counter] = JSON.parse(e.additionalRegisters.R6.renderedValue);

                        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
                        let base_token_id = constants.base_token_id ?? "";

                        let current_pft_amount = (e.assets.find(asset => asset.tokenId === constants.token_id)?.amount) ?? 0;
                        let total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
                        let unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
                        let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
                        let minimum_token_amount = parseInt(e.additionalRegisters.R5.renderedValue);
                        let block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
                        let collected_value = (token_amount_sold * exchange_rate);

                        let base_token_details = undefined;
                        if (base_token_id && base_token_id !== "") {
                            try {
                                base_token_details = await fetch_token_details(base_token_id);
                            } catch (error) {
                                console.warn(`Failed to fetch base token details for ${base_token_id}:`, error);
                            }
                        }

                        const project: Project = {
                            version: version,
                            platform: new ErgoPlatform(),
                            box: {
                                boxId: e.boxId,
                                value: e.value,
                                assets: e.assets,
                                ergoTree: e.ergoTree,
                                creationHeight: e.creationHeight,
                                additionalRegisters: Object.entries(e.additionalRegisters).reduce((acc, [key, value]) => {
                                    acc[key] = (value as any).serializedValue;
                                    return acc;
                                }, {} as { [key: string]: string; }),
                                index: e.index,
                                transactionId: e.transactionId
                            },
                            project_id: project_id,
                            current_idt_amount: e.assets[0].amount,
                            token_id: constants.token_id,
                            base_token_id: base_token_id,
                            base_token_details: base_token_details,
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
                            collected_value: collected_value - Number(SAFE_MIN_BOX_VALUE),
                            current_value: current_erg_value,
                            token_details: await fetch_token_details(token_id)
                        };
                        const current = get(projects).data;
                        current.set(project_id, project)
                        projects.set({data: current, last_fetch: get(projects).last_fetch});
                    }
                }
                params.offset += params.limit;
            }
        }
    } catch (error) {
        console.error('Error while making the POST request:', error);
        return new Map(); // Returns empty map in case of error
    }
}

export async function fetchProjects(force: boolean = false): Promise<Map<string, Project>> {
    
    const current = get(projects);

    // 1. Return cached data if valid and not forced
    if (!force && (Date.now() - current.last_fetch < CACHE_DURATION_MS)) {
        return current.data;
    }

    // 2. If a request is in progress, return its promise
    if (inFlightFetch) {
        return inFlightFetch;
    }

    // 3. Start the fetch operation
    inFlightFetch = (async () => {
        try {
            if (force) {
                console.log("[fetchProjects] Forcing reload, clearing store...");
                projects.set({ data: new Map(), last_fetch: Date.now() });
            } else {
                projects.update(current => ({ ...current, last_fetch: Date.now() }));
            }

            await fetchProjectsFromBlockchain();

            return get(projects).data;

        } catch (error) {
            console.error("Critical error during fetchProjects:", error);
            // In case of error, return the data we had before the failure
            return get(projects).data;
        } finally {
            // 4. Release the lock for future requests
            inFlightFetch = null;
        }
    })();

    return inFlightFetch;
}