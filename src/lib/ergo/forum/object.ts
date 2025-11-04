import { type Amount, type Box } from "@fleet-sdk/core";
import { get } from 'svelte/store';
import { proofs, compute_deep_level } from "./store";
import { stringToRendered } from "./utils";

// --- CORE TYPES ---

export interface TypeNFT {
    tokenId: string;
    boxId: string;
    typeName: string;
    description: string;
    schemaURI: string;
    isRepProof: boolean;
}

export interface ReputationProof {
    token_id: string;
    type: TypeNFT;  // SELF identification of the proof type (by Type NFT)
    total_amount: number;
    owner_address: string;
    owner_serialized: string;
    can_be_spend: boolean;
    current_boxes: RPBox[];
    number_of_boxes: number;
    network: Network;
    data: object;
}

export interface RPBox {
    box: Box<Amount>;
    box_id: string;
    type: TypeNFT; 
    token_id: string;
    token_amount: number;
    object_pointer: string;
    is_locked: boolean;
    polarization: boolean;
    content: object|string|null;
}

// --- ENUMS & UTILITIES ---

export function token_rendered(proof: ReputationProof): string {
    return stringToRendered(proof.token_id);
};

export enum Network {
    ErgoTestnet = "ergo-testnet",
    ErgoMainnet = "ergo",
    BitcoinTestnet = "btc-testnet",
    BitcoinMainnet = "btc"
}

// --- REPUTATION COMPUTATION LOGIC ---

export function compute(proof: ReputationProof, target_object_pointer: string): number {
    const all_proofs = get(proofs);
    return internal_compute(
        all_proofs,
        proof,
        target_object_pointer,
        get(compute_deep_level)
    );
}

function internal_compute(
    all_proofs: Map<string, ReputationProof>,
    proof: ReputationProof,
    target_object_pointer: string,
    deep_level: number
): number {
    console.log(`Compute (deep_level: ${deep_level}) on proof: ${proof.type.typeName} (${proof.token_id})`);
    
    return proof.current_boxes.reduce((total, box) => {
        if (proof.total_amount === 0) return total; // Avoid division by zero
        const proportion = box.token_amount / proof.total_amount;
        const boxReputation = computeBoxReputation(all_proofs, proof, box, target_object_pointer, deep_level);
        const signedReputation = (box.polarization ? 1 : -1) * boxReputation;
        return total + (proportion * signedReputation);
    }, 0);
}

function computeBoxReputation(
    all_proofs: Map<string, ReputationProof>,
    parent_proof: ReputationProof,
    box: RPBox,
    target_object_pointer: string,
    deep_level: number
): number {
    if (parent_proof.type.typeName.includes("Proof-by-Token")) {
        const pointed_token_id = box.object_pointer;
        if (pointed_token_id === parent_proof.token_id) return 0.00;

        const pointed_proof = all_proofs.get(pointed_token_id);
        if (pointed_proof) {
            if (deep_level <= 0) return 0.00;
            return internal_compute(all_proofs, pointed_proof, target_object_pointer, deep_level - 1);
        } else {
            return 0.00;
        }
    } else {
        return box.object_pointer === target_object_pointer ? 1.00 : 0.00;
    }
}