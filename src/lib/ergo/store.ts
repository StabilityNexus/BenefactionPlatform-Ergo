import { writable } from 'svelte/store';
import type { Project } from './project';

export const address = writable<string|null>(null);
export const network = writable<string|null>(null);
export const connected = writable<boolean>(false);
export const ergBalance = writable<string|null>(null);
export const project_detail = writable<Project|null>(null);