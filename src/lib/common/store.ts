import { writable } from 'svelte/store';
import type { Project } from './project';

export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const balance = writable<number|null>(null);
export const temporal_token_amount = writable<number|null>(null);
export const project_token_amount = writable<string|null>(null);
export const project_detail = writable<Project|null>(null);
export const timer = writable<{countdownInterval: number, target: number}>({countdownInterval: 0, target: 0})
export const projects = writable<{data: Map<string, Project>, last_fetch: number}>({
    data: new Map(), 
    last_fetch: 0
})
export const user_tokens = writable<Map<string, number>>(new Map());
export const explorer_uri = writable<string|null>("https://api.ergoplatform.com");