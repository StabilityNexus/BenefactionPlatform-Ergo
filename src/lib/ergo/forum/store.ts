import { writable } from 'svelte/store';
import { type ReputationProof, type TypeNFT } from './object';

export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const balance = writable<number|null>(null);

// App logic stores
export const compute_deep_level = writable<number>(5);
export const searchStore = writable<string|null>(null);
export const data_store = writable<any | null>(null);
export const types = writable<Map<string, TypeNFT>>(new Map());

// Main store for holding fetched reputation proofs, keyed by token ID.
export const proofs = writable<Map<string, ReputationProof>>(new Map());
export const reputation_proof = writable<ReputationProof | null>(null);

export const viewMode = writable<'nested' | 'forum'>('forum');