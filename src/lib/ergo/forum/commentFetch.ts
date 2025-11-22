import { ErgoAddress, Network } from '@fleet-sdk/core';
import { SByte, SColl } from '@fleet-sdk/serializer';
import { type Comment } from './commentObject';
import { hexToBytes, hexToUtf8, serializedToRendered } from './utils';
import { COMMENT_TYPE_NFT_ID, DISCUSSION_TYPE_NFT_ID, PROFILE_TYPE_NFT_ID, SPAM_FLAG_NFT_ID, SPAM_LIMIT } from './envs';
import { explorer_uri } from '$lib/common/store';
import { get } from 'svelte/store';
import { ergo_tree_hash } from './contract';
import { type TypeNFT, type ReputationProof, type RPBox } from './object';
import { reputation_proof } from './store';
import { marked } from 'marked';
import DOMPurify from "dompurify";

// Global ergo wallet connector (injected by browser wallet extension)
declare const ergo: any;

// Minimal definition of the Explorer API response for a box
interface ApiBox {
  boxId: string;
  value: string | number;
  ergoTree: string;
  assets: { tokenId: string; amount: string | number; }[];
  creationHeight: number;
  blockId: string;
  additionalRegisters: {
    [key: string]: {
      serializedValue: string;
      renderedValue?: string;
    };
  };
  index: number;
  transactionId: string;
}

// Constants
const LIMIT_PER_PAGE = 100;

// Interface for search body
interface SearchBody {
  registers: { [key: string]: string };
}

/**
 * Gets the timestamp of a block given its block ID.
 * @param blockId The ID of the block.
 * @returns The block timestamp (in milliseconds).
 */
export async function getTimestampFromBlockId(blockId: string): Promise<number> {
  const url = `${get(explorer_uri)}/api/v1/blocks/${blockId}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    console.log("get Timestamp ", json);

    const timestamp = json?.block?.header?.timestamp;
    if (typeof timestamp !== "number") {
      console.warn(`No timestamp found for block ${blockId}`);
      return 0;
    }

    // Most APIs return timestamps in ms or s.
    // If it's around 1e12, it's already in ms; if around 1e9, convert to ms.
    return timestamp < 1e11 ? timestamp * 1000 : timestamp;

  } catch (error) {
    console.error(`Error fetching timestamp for block ${blockId}:`, error);
    return 0;
  }
}

/**
 * Searches the blockchain for all spam alerts targeting a comment.
 */
export async function fetchSpan(comment_id: string): Promise<number> {
  let amount: number = 0;

  const search_body = {
    registers: {
      "R4": serializedToRendered(SColl(SByte, hexToBytes(SPAM_FLAG_NFT_ID) ?? "").toHex()),
      "R5": serializedToRendered(SColl(SByte, hexToBytes(comment_id) ?? "").toHex())
    }
  }

  try {
    let offset = 0, limit = 100, moreDataAvailable = true;

    while (moreDataAvailable) {
      const url = `${get(explorer_uri)}/api/v1/boxes/unspent/search?offset=${offset}&limit=${limit}`;

      const final_body = {
        "ergoTreeTemplateHash": ergo_tree_hash,
        "registers": search_body.registers,
        "assets": []
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(final_body)
      });

      if (!response.ok) {
        console.error(`Error fetching spam reports: ${response.statusText}`);
        moreDataAvailable = false;
        continue;
      }

      const json_data = await response.json();
      if (!json_data.items || json_data.items.length === 0) {
        moreDataAvailable = false;
        continue;
      }

      for (const box of json_data.items as ApiBox[]) {
        if (!box.assets?.length) continue;
        if (box.additionalRegisters.R6.renderedValue == "false" || !box.additionalRegisters.R9.renderedValue) continue;

        try {
          const rawValue = box.additionalRegisters.R9.renderedValue;
          if (rawValue) hexToUtf8(rawValue);
        } catch (e) {
          console.warn(`Error decoding R9 for box ${box.boxId}`, e);
        }

        amount += 1;
      }
      offset += limit;
    }

    return amount;

  } catch (error) {
    console.error('Error while searching spam flags:', error);
    return 0;
  }
}

/**
 * Searches the blockchain for all top-level comments (threads)
 * for a given discussion (project).
 */
export async function fetchComments(discussion: string, reply: boolean = false): Promise<Comment[]> {
  console.log("fetchComments", { discussion }, reply)
  let comments: Comment[] = [];

  const search_body = {
    registers: {
      "R4": serializedToRendered(SColl(SByte, hexToBytes(reply ? COMMENT_TYPE_NFT_ID : DISCUSSION_TYPE_NFT_ID) ?? "").toHex()),
      "R5": serializedToRendered(SColl(SByte, hexToBytes(discussion) ?? "").toHex())
    }
  }

  try {
    let offset = 0, limit = 100, moreDataAvailable = true;

    while (moreDataAvailable) {
      const url = `${get(explorer_uri)}/api/v1/boxes/unspent/search?offset=${offset}&limit=${limit}`;

      const final_body = {
        "ergoTreeTemplateHash": ergo_tree_hash,
        "registers": search_body.registers,
        "assets": []
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(final_body)
      });

      if (!response.ok) {
        console.error(`Error fetching comments: ${response.statusText}`);
        moreDataAvailable = false;
        continue;
      }

      const json_data = await response.json();
      if (!json_data.items || json_data.items.length === 0) {
        moreDataAvailable = false;
        continue;
      }

      console.log("Comments json data ", json_data.items)

      for (const box of json_data.items as ApiBox[]) {
        if (!box.assets?.length) continue;
        if (box.additionalRegisters.R6.renderedValue == "false" || !box.additionalRegisters.R9.renderedValue) continue;

        const authorProfileTokenId = box.assets[0].tokenId;

        let textContent: string = "[Unreadable content]";
        try {
          const rawValue = box.additionalRegisters.R9.renderedValue;
          if (rawValue) {
            textContent = hexToUtf8(rawValue) ?? "[Empty content]";
          }
        } catch (e) {
          console.warn(`Error decoding R9 for box ${box.boxId}`, e);
        }

        const number_of_spans = await fetchSpan(box.boxId);
        const isSpam = number_of_spans > SPAM_LIMIT;

        textContent = await marked(textContent);
        textContent = DOMPurify.sanitize(textContent);

        const comment: Comment = {
          id: box.boxId,
          discussion: discussion,
          authorProfileTokenId: authorProfileTokenId,
          text: textContent,
          timestamp: await getTimestampFromBlockId(box.blockId),
          isSpam: isSpam,
          replies: await fetchComments(box.boxId, true),
          tx: box.transactionId,
          posting: false,
          sentiment: box.additionalRegisters.R8?.renderedValue === 'true'
        };

        comments.push(comment);
      }
      offset += limit;
    }

    comments.sort((a, b) => b.timestamp - a.timestamp);

    return comments;

  } catch (error) {
    console.error('Error while fetching comments:', error);
    return [];
  }
}

// Helper to get serialized R7
async function getSerializedR7(ergo: any): Promise<{ changeAddress: string; r7SerializedHex: string } | null> {
  if (!ergo) {
    console.error("getSerializedR7: 'ergo' object is not available.");
    return null;
  }

  try {
    const changeAddress = await ergo.get_change_address();
    if (!changeAddress) {
      console.warn("getSerializedR7: Could not obtain change address.");
      return null;
    }

    const userAddress = ErgoAddress.fromBase58(changeAddress);
    const propositionBytes = hexToBytes(userAddress.ergoTree);

    console.log("Ergotree ", userAddress.ergoTree);

    if (!propositionBytes) {
      console.error("getSerializedR7: Could not obtain propositionBytes.");
      return null;
    }

    const r7SerializedHex = SColl(SByte, userAddress.ergoTree).toHex();
    return { changeAddress, r7SerializedHex };
  } catch (e) {
    console.error("getSerializedR7: Error obtaining user address", e);
    return null;
  }
}

// Fetch all user boxes with pagination
async function fetchProfileUserBoxes(r7SerializedHex: string): Promise<ApiBox[]> {
  const allBoxes: ApiBox[] = [];
  let offset = 0;
  let moreDataAvailable = true;

  const searchBody: SearchBody = {
    registers: {
      R7: serializedToRendered(r7SerializedHex),
      R4: PROFILE_TYPE_NFT_ID
    }
  };

  while (moreDataAvailable) {
    const url = `${get(explorer_uri)}/api/v1/boxes/unspent/search?offset=${offset}&limit=${LIMIT_PER_PAGE}`;
    const finalBody = {
      ergoTreeTemplateHash: ergo_tree_hash,
      registers: searchBody.registers,
      assets: [],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalBody),
      });

      if (!response.ok) {
        console.error(`fetchAllUserBoxes: Error fetching boxes: ${response.statusText}`);
        moreDataAvailable = false;
        continue;
      }

      const jsonData = await response.json();
      if (!jsonData.items || jsonData.items.length === 0) {
        moreDataAvailable = false;
        continue;
      }

      const filteredBoxes = jsonData.items
        .filter((box: ApiBox) =>
          box.additionalRegisters.R5.renderedValue === box.assets[0].tokenId &&
          box.additionalRegisters.R6.renderedValue === 'false'
        )
        .sort((a: ApiBox, b: ApiBox) => b.creationHeight - a.creationHeight);

      allBoxes.push(...filteredBoxes as ApiBox[]);
      offset += LIMIT_PER_PAGE;
    } catch (e) {
      console.error("fetchAllUserBoxes: Error during fetch", e);
      moreDataAvailable = false;
    }
  }

  console.log(allBoxes.map(box => box.additionalRegisters.R5.renderedValue))
  console.log(allBoxes.map(box => box.boxId))

  return allBoxes;
}

// Fetch token emission amount
async function fetchTokenEmissionAmount(tokenId: string): Promise<number | null> {
  try {
    const response = await fetch(`${get(explorer_uri)}/api/v1/tokens/${tokenId}`);
    if (!response.ok) {
      console.error(`fetchTokenEmissionAmount: Error fetching token ${tokenId}: ${response.statusText}`);
      return null;
    }
    const tokenData = await response.json();
    return Number(tokenData.emissionAmount || 0);
  } catch (e) {
    console.error(`fetchTokenEmissionAmount: Error fetching token ${tokenId}`, e);
    return null;
  }
}

// Convert ApiBox to RPBox
function convertToRPBox(box: ApiBox, profileTokenId: string): RPBox | null {
  if (!box.assets?.length || box.assets[0].tokenId !== profileTokenId) {
    console.warn(`convertToRPBox: Box ${box.boxId} has different token ID. Skipping.`);
    return null;
  }

  if (!box.additionalRegisters.R4 || !box.additionalRegisters.R5 || !box.additionalRegisters.R6) {
    console.warn(`convertToRPBox: Box ${box.boxId} lacks R4, R5, or R6. Skipping.`);
    return null;
  }

  const typeNftId = box.additionalRegisters.R4.renderedValue ?? '';
  const typeNft: TypeNFT = {
    tokenId: typeNftId,
    boxId: '',
    typeName: typeNftId === PROFILE_TYPE_NFT_ID ? 'Profile' : 'Unknown Type',
    description: '...',
    schemaURI: '',
    isRepProof: false,
  };

  let boxContent: string | object | null = null;
  try {
    const rawValue = box.additionalRegisters.R9?.renderedValue;
    if (rawValue) {
      const potentialString = hexToUtf8(rawValue);
      if (potentialString) {
        try {
          boxContent = JSON.parse(potentialString);
        } catch {
          boxContent = potentialString;
        }
      }
    }
  } catch (e) {
    console.error(`convertToRPBox: Error parsing R9 for box ${box.boxId}`, e);
  }

  const objectPointer = hexToUtf8(box.additionalRegisters.R5?.renderedValue ?? '') ?? '';

  return {
    box: {
      boxId: box.boxId,
      value: typeof box.value === 'string' ? box.value : box.value.toString(),
      assets: box.assets.map(a => ({ tokenId: a.tokenId, amount: typeof a.amount === 'string' ? a.amount : a.amount.toString() })),
      ergoTree: box.ergoTree,
      creationHeight: box.creationHeight,
      additionalRegisters: Object.entries(box.additionalRegisters).reduce(
        (acc, [key, value]) => ({ ...acc, [key]: value.serializedValue }),
        {} as { [key: string]: string }
      ),
      index: box.index,
      transactionId: box.transactionId,
    },
    box_id: box.boxId,
    type: typeNft,
    token_id: profileTokenId,
    token_amount: Number(box.assets[0].amount),
    object_pointer: objectPointer,
    is_locked: box.additionalRegisters.R6.renderedValue === 'true',
    polarization: box.additionalRegisters.R8?.renderedValue === 'true',
    content: boxContent,
  };
}

/**
 * Fetches the full ReputationProof object for the connected user,
 * by searching all boxes where R7 matches their wallet address.
 * @param ergo The connected wallet object (e.g., dApp Connector)
 */
export async function fetchProfile(ergo: any): Promise<ReputationProof | null> {
  try {
    const r7Data = await getSerializedR7(ergo);
    if (!r7Data) {
      reputation_proof.set(null);
      return null;
    }
    const { changeAddress, r7SerializedHex } = r7Data;
    console.log(`Fetching profile for R7: ${r7SerializedHex}`);

    const allUserBoxes = await fetchProfileUserBoxes(r7SerializedHex);
    if (allUserBoxes.length === 0) {
      console.log('No profile boxes found for this user.');
      reputation_proof.set(null);
      return null;
    }

    const first_box = allUserBoxes[0];

    const profileTokenId = first_box.assets[0].tokenId;
    const emissionAmount = await fetchTokenEmissionAmount(profileTokenId);
    if (emissionAmount === null) {
      reputation_proof.set(null);
      console.warn("fetchTokenEmissionAmount returned null.")
      return null;
    }

    const proof: ReputationProof = {
      token_id: profileTokenId,
      type: { tokenId: '', boxId: '', typeName: 'N/A', description: '...', schemaURI: '', isRepProof: false },
      data: {},
      total_amount: emissionAmount,
      owner_address: changeAddress,
      owner_serialized: r7SerializedHex,
      can_be_spend: true,
      current_boxes: [],
      number_of_boxes: 0,
      network: 'ergo' as any,
    };

    const rpbox = convertToRPBox(first_box, profileTokenId);
    if (!rpbox) {
      reputation_proof.set(null);
      console.warn("convertToRPBox returned null.")
      return null;
    }

    proof.current_boxes.push(rpbox);
    proof.number_of_boxes += 1;

    console.log(`Profile found: ${proof.token_id}, ${proof.number_of_boxes} boxes.`, proof);
    reputation_proof.set(proof);

    console.log(proof)
    return proof;

  } catch (error) {
    console.error('Error fetching profile:', error);
    reputation_proof.set(null);
    return null;
  }
}
