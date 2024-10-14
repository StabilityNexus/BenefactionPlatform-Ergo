import { writable } from 'svelte/store';

export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const ergBalance = writable<string|null>(null);