import { type Box, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { type ConstantContent, type Project, type TokenEIP4, getConstantContent, getProjectContent } from "../common/project";
import { ErgoPlatform } from "./platform";
import { hexToUtf8 } from "./utils";
import { type contract_version, get_template_hash } from "./contract";
import { explorer_uri, projects, project_id_conflicts } from "$lib/common/store";
import { get } from "svelte/store";
import { get_dev_contract_hash, get_dev_fee } from "./dev/dev_contract";
import { resolveCanonicalBox } from "./lineage";

const expectedSigmaTypesV1 = {
    R4: 'SInt',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'SLong',
    R8: 'Coll[SByte]',
    R9: 'Coll[SByte]'
};

const expectedSigmaTypesV2 = {
    R4: '(SBoolean, SLong)',
    R5: 'SLong',
    R6: 'Coll[SLong]',
    R7: 'SLong',
    R8: 'Coll[Coll[SByte]]',
    R9: 'Coll[SByte]'
};

// Cache duration (e.g. 5 minutes)
const CACHE_DURATION_MS = 1000 * 60 * 5;

// Variable to track an ongoing request
let inFlightFetch: Promise<Map<string, Project>> | null = null;

/**
 * Two unspent boxes can claim to be the same campaign at the same time.
 *
 * A project is identified by `tokens(0)` of the contract box, which is the APT: a fungible token
 * with `amount = PFT emission + 1` that circulates to buyers by design, not a singleton NFT. The
 * contract ErgoTree carries no per-project constants either, so it is identical for every campaign
 * and anyone can reproduce it. Together that means anyone holding one unit of a campaign's APT can
 * build a box that parses as that same campaign, with an owner, an exchange rate and counters of
 * their choosing.
 *
 * When that happens there is nothing in the box that says which one is real, so the UI must not
 * pick: `fetchProjectsFromBlockchain` used to keep whichever box the explorer returned last, and
 * `fetchProjectById` whichever parsed first. Both are now recorded as conflicts and hidden.
 *
 * The real fix is a singleton NFT plus canonical-box resolution by lineage. See #176.
 */
function recordConflict(projectId: string, boxIds: string[]) {
    console.error(
        `Project ${projectId} is claimed by ${boxIds.length} unspent boxes: ${boxIds.join(", ")}. ` +
        `Refusing to display it, one of them is an impersonation.`
    );
    project_id_conflicts.update((current) => new Map(current).set(projectId, boxIds));
}

function clearConflict(projectId: string) {
    project_id_conflicts.update((current) => {
        if (!current.has(projectId)) return current;
        const next = new Map(current);
        next.delete(projectId);
        return next;
    });
}

/**
 * Which of several boxes claiming one project id descends from the mint, or null when that cannot
 * be established.
 *
 * This is the "canonical-box resolution by lineage" the note above points at. It answers the
 * question the box itself cannot: the APT says which campaign a box claims to be, and the walk
 * from the mint says which box the campaign actually is. Only called on an actual collision, so
 * the extra explorer calls are not paid for on every project of every sweep.
 */
async function resolveByLineage<T extends { box: { boxId: string } }>(
    projectId: string,
    candidates: T[]
): Promise<T | null> {
    try {
        const { box, ended } = await resolveCanonicalBox(projectId);
        if (ended) {
            console.warn(`Project ${projectId} has ended on chain; the boxes claiming it are leftovers`);
        }
        // With no canonical box - ended, or not resolvable - `box?.boxId` is undefined and matches
        // no candidate, which is the answer wanted in both cases: none of these is the campaign.
        return candidates.find((c) => c.box.boxId === box?.boxId) ?? null;
    } catch (error) {
        console.warn(`Could not resolve the lineage of ${projectId}:`, error);
        return null;
    }
}

function hasValidSigmaTypes(additionalRegisters: any, version: contract_version): boolean {
    if (!additionalRegisters) return false;
    const expectedTypes = version === "v2" ? expectedSigmaTypesV2 : expectedSigmaTypesV1;
    for (const [key, expectedType] of Object.entries(expectedTypes)) {
        // Check if register exists AND has correct type
        if (!additionalRegisters[key] || additionalRegisters[key].sigmaType !== expectedType) {
            return false;
        }
    }
    return true;
}

export async function fetch_token_details(id: string): Promise<TokenEIP4> {
    console.log("Fetching token details for ", id);
    const url = get(explorer_uri) + '/api/v1/tokens/' + id;
    const response = await fetch(url, {
        method: 'GET',
    });

    try {
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
                    "name": id.slice(0, 6),
                    "description": "",
                    "decimals": 0,
                    "emissionAmount": json_data['emissionAmount']
                }
            }
        }
    } catch { }
    return {
        'name': 'token',
        'description': "",
        'decimals': 0,
        'emissionAmount': null
    };
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

        // Check if 15 minutes have passed
        if (Date.now() - startTime > 15 * 60 * 1000) {
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

    const versions: contract_version[] = ["v2", "v1_1", "v1_0"];

    // Box id seen for each project id during THIS sweep. It cannot be read off the `projects`
    // store: a non-forced refetch keeps the previous entries, whose box ids are legitimately
    // outdated after any action on the campaign, and comparing against them would report every
    // active campaign as a conflict.
    const boxIdByProject = new Map<string, string>();
    const conflicts = new Map<string, string[]>();
    // The parsed project behind each box id above, so that a collision can be settled in favour of
    // whichever of the two the lineage points at without parsing it again.
    const seenThisSweep = new Map<string, Project>();

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
                    const project = await parseProjectBox(e, version);
                    if (!project) continue;

                    const knownBoxId = boxIdByProject.get(project.project_id);
                    if (knownBoxId !== undefined && knownBoxId !== project.box.boxId) {
                        const rival = seenThisSweep.get(project.project_id);
                        const winner = rival
                            ? await resolveByLineage(project.project_id, [rival, project])
                            : null;

                        const current = get(projects).data;
                        if (winner) {
                            // The chain settles it: one of them descends from the mint and the
                            // other does not, so the campaign can be listed instead of hidden.
                            conflicts.delete(project.project_id);
                            boxIdByProject.set(project.project_id, winner.box.boxId);
                            seenThisSweep.set(project.project_id, winner);
                            current.set(project.project_id, winner);
                        } else {
                            const boxIds = conflicts.get(project.project_id) ?? [knownBoxId];
                            if (!boxIds.includes(project.box.boxId)) boxIds.push(project.box.boxId);
                            conflicts.set(project.project_id, boxIds);

                            // Drop the one already listed instead of replacing it: neither can be trusted.
                            current.delete(project.project_id);
                        }
                        projects.set({ data: current, last_fetch: get(projects).last_fetch });
                        continue;
                    }

                    boxIdByProject.set(project.project_id, project.box.boxId);
                    seenThisSweep.set(project.project_id, project);
                    const current = get(projects).data;
                    current.set(project.project_id, project)
                    projects.set({ data: current, last_fetch: get(projects).last_fetch });
                }
                params.offset += params.limit;
            }
        }

        // This sweep covers every unspent box carrying a campaign contract template, so it is
        // authoritative for the listing: replace the previous verdict rather than accumulating.
        project_id_conflicts.set(conflicts);
    } catch (error) {
        console.error('Error while making the POST request:', error);
        return new Map(); // Returns empty map in case of error
    }
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
    console.log(`Fetching project by ID: ${projectId}`);
    const versions: contract_version[] = ["v2", "v1_1", "v1_0"];

    // This is the page someone reads before sending money, so identity is established from the
    // chain rather than taken on trust from a circulating token: walk from the mint and see which
    // box that reaches. Unlike the listing sweep, one campaign is worth the round trips - and the
    // walk is cached, so a second visit costs one call. See #176.
    let lineage: { boxId: string | null; ended: boolean } | null = null;
    try {
        const { box, ended } = await resolveCanonicalBox(projectId);
        lineage = { boxId: box?.boxId ?? null, ended };
    } catch (error) {
        console.warn(`Could not resolve the lineage of ${projectId}:`, error);
    }

    if (lineage?.ended) {
        // The chain that starts at the mint has terminated: whatever still carries this token is
        // a leftover, not the campaign. This is the #174 shape, where the closing transaction also
        // left a copy behind.
        console.warn(`Project ${projectId} has ended on chain; not displaying a leftover box`);
        return null;
    }

    try {
         const url = get(explorer_uri) + '/api/v1/boxes/unspent/byTokenId/' + projectId;
         const response = await fetch(url, {
             method: 'GET',
         });

         if (!response.ok) {
             console.error(`Error fetching project box for ${projectId}`);
             return null;
         }

         const json_data = await response.json();
         if (!json_data.items || json_data.items.length === 0) {
             console.warn(`No boxes found for project ${projectId}`);
             return null;
         }

         // Parse every box that claims to be this project, not just the first one. Returning the
         // first match would hand the page to whichever box the explorer happened to list first.
         const candidates: Project[] = [];
         for (const box of json_data.items) {
             for (const v of versions) {
                 // Try to parse with each version.
                 const p = await parseProjectBox(box, v);
                 if (p) {
                     console.log(`Successfully parsed project ${projectId} with version ${v}`);
                     candidates.push(p);
                     break;
                 }
             }
         }

         if (lineage?.boxId) {
             const canonical = candidates.find((p) => p.box.boxId === lineage!.boxId);
             if (canonical) {
                 clearConflict(projectId);
                 return canonical;
             }
             // The box the chain points at is not among the unspent ones. Whatever is here
             // instead is not the campaign, however plausible it parses.
             if (candidates.length > 1) {
                 recordConflict(projectId, candidates.map((p) => p.box.boxId));
             }
             console.warn(
                 `The canonical box ${lineage.boxId} of ${projectId} is not among the unspent boxes`
             );
             return null;
         }

         // The lineage could not be resolved at all - no such token, or the explorer did not
         // answer. Fall back to refusing a tie, which is where this stood before #176.
         if (candidates.length > 1) {
             recordConflict(projectId, candidates.map((p) => p.box.boxId));
             return null;
         }

         clearConflict(projectId);

         if (candidates.length === 1) {
             return candidates[0];
         }

         console.warn(`Failed to parse project ${projectId} with any version`);
         return null;

    } catch (error) {
        console.error(`Error fetching project ${projectId}:`, error);
        return null;
    }
}

async function parseProjectBox(e: any, version: contract_version): Promise<Project | null> {
    if (hasValidSigmaTypes(e.additionalRegisters, version)) {
        let constants: ConstantContent | null = null;

        if (version === "v1_0" || version === "v1_1") {
            constants = getConstantContent(hexToUtf8(e.additionalRegisters.R8.renderedValue) ?? "");
            if (constants === null) { console.warn("constants null"); return null; }
        }
        else {
            try {
                if (!e.additionalRegisters.R8) throw new Error("R8 missing");

                // Parse R8 using regex/split as requested, handling brackets, quotes, and spaces
                const rawValues = e.additionalRegisters.R8.renderedValue
                    .replace(/[\[\]"'\s]/g, "")
                    .split(",")
                    .filter((s: string) => s.length > 0);

                // console.log(rawValues)
                if (rawValues.length < 3) throw new Error("Insufficient R8 constants");

                constants = {
                    owner: rawValues[0],
                    dev_hash: rawValues[1],
                    dev_fee: parseInt(rawValues[2], 16),
                    pft_token_id: rawValues[3],
                    base_token_id: rawValues[4] ?? "",
                    raw: e.additionalRegisters.R8.serializedValue
                };

                const correct_dev_hash = rawValues[1] === get_dev_contract_hash();
                const correct_dev_fee = parseInt(rawValues[2], 16) === get_dev_fee();
                if (!correct_dev_hash || !correct_dev_fee) {
                    console.warn(`Dev contract hash or fee mismatch. Expected hash: ${get_dev_contract_hash()}, found: ${rawValues[1]}. Expected fee: ${get_dev_fee()}, found: ${parseInt(rawValues[2], 16)}`);
                    return null;
                }
            } catch (err) {
                console.warn("Failed to parse R8 constants", err);
                return null;
            }
        }

        let project_id = e.assets[0].tokenId;
        let token_id = constants.pft_token_id;
        let [token_amount_sold, refunded_token_amount, auxiliar_exchange_counter] = JSON.parse(e.additionalRegisters.R6.renderedValue);


        let exchange_rate = parseInt(e.additionalRegisters.R7.renderedValue);
        let base_token_id = constants.base_token_id ?? "";

        let current_pft_amount = (e.assets.find((asset: any) => asset.tokenId === constants.pft_token_id)?.amount) ?? 0;
        let total_pft_amount = current_pft_amount + auxiliar_exchange_counter;
        let unsold_pft_amount = current_pft_amount - token_amount_sold + refunded_token_amount + auxiliar_exchange_counter;
        let current_erg_value = e.value - Number(SAFE_MIN_BOX_VALUE);
        let minimum_token_amount = parseInt(e.additionalRegisters.R5.renderedValue);


        let block_limit: number = 0;
        let is_timestamp_limit = false;
        if (version === "v2") {
            const r4Value = JSON.parse(e.additionalRegisters.R4?.renderedValue.replace(/\[([a-f0-9]+)(,.*)/, '["$1"$2'));
            if (!Array.isArray(r4Value) || r4Value.length < 2) throw new Error("R4 is not a valid tuple (Type, Deadline).");

            is_timestamp_limit = r4Value[0] === true;
            block_limit = Number(r4Value[1]);
            // console.log("Parsed R4 for v2:", r4Value, "is_timestamp_limit:", is_timestamp_limit, "block_limit:", block_limit);
        } else {
            block_limit = parseInt(e.additionalRegisters.R4.renderedValue);
        }

        let base_token_details = undefined;
        if (base_token_id && base_token_id !== "" && base_token_id !== undefined && base_token_id !== "00".repeat(32)) {
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
            pft_token_id: constants.pft_token_id,
            base_token_id: base_token_id,
            base_token_details: base_token_details,
            block_limit: block_limit,
            is_timestamp_limit: is_timestamp_limit,
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
            current_value: current_erg_value,
            token_details: await fetch_token_details(token_id)
        };
        return project;
    } else {
        // console.warn(`Box ${e.boxId} has invalid sigma types for version ${version}, skipping.`);
        // console.log(e.additionalRegisters);
        return null;
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