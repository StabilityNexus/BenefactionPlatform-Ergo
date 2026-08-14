import { writable } from 'svelte/store';
import type { Project } from './project';
import { DEFAULT_WEB_EXPLORER_URI_TX, DEFAULT_WEB_EXPLORER_URI_TKN, DEFAULT_WEB_EXPLORER_URI_ADDR } from "$lib/ergo/envs";

export const address = writable<string | null>(null);
export const network = writable<string | null>(null);
export const connected = writable<boolean>(false);
export const wallet_address = writable<string>("");
export const balance = writable<number | null>(null);
export const temporal_token_amount = writable<number | null>(null);
export const project_token_amount = writable<string | null>(null);
export const project_detail = writable<Project | null>(null);
export const timer = writable<{ countdownInterval: number, target: number }>({ countdownInterval: 0, target: 0 })
export const projects = writable<{ data: Map<string, Project>, last_fetch: number }>({
    data: new Map(),
    last_fetch: 0
})
// Project ids for which more than one unspent box claims to be the campaign, mapped to the
// competing box ids. While an id is listed here the UI must refuse to display it: there is no way
// to tell the real box from an imitation, so picking one would mean picking the attacker's.
export const project_id_conflicts = writable<Map<string, string[]>>(new Map());

// Reason why the campaign requested through the URL could not be displayed, if any.
export const project_load_error = writable<string | null>(null);

export const user_tokens = writable<Map<string, number>>(new Map());
export const explorer_uri = writable<string | null>("https://api.ergoplatform.com");
export const web_explorer_uri_tx = writable<string>(DEFAULT_WEB_EXPLORER_URI_TX);
export const web_explorer_uri_tkn = writable<string>(DEFAULT_WEB_EXPLORER_URI_TKN);
export const web_explorer_uri_addr = writable<string>(DEFAULT_WEB_EXPLORER_URI_ADDR);