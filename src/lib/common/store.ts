import { writable } from "svelte/store";
import type { Project } from "./project";
import {
  DEFAULT_WEB_EXPLORER_URI_TX,
  DEFAULT_WEB_EXPLORER_URI_TKN,
  DEFAULT_WEB_EXPLORER_URI_ADDR,
} from "$lib/ergo/envs";

export const address = writable<string | null>(null);
export const network = writable<string | null>(null);
export const connected = writable<boolean>(false);
export const wallet_address = writable<string>("");
export const balance = writable<number | null>(null);
export const temporal_token_amount = writable<number | null>(null);
export const project_token_amount = writable<string | null>(null);
export const project_detail = writable<Project | null>(null);
export const timer = writable<{ countdownInterval: number; target: number }>({
  countdownInterval: 0,
  target: 0,
});
export const projects = writable<{
  data: Map<string, Project>;
  last_fetch: number;
}>({
  data: new Map(),
  last_fetch: 0,
});
export const user_tokens = writable<Map<string, number>>(new Map());

// Shared search filter across all list views; synchronized with `?search=` in `App.svelte`
export const search_filter = writable<string>("");
export const explorer_uri = writable<string | null>(
  "https://api.ergoplatform.com"
);
export const web_explorer_uri_tx = writable<string>(
  DEFAULT_WEB_EXPLORER_URI_TX
);
export const web_explorer_uri_tkn = writable<string>(
  DEFAULT_WEB_EXPLORER_URI_TKN
);
export const web_explorer_uri_addr = writable<string>(
  DEFAULT_WEB_EXPLORER_URI_ADDR
);
