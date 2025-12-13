import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { pushState, replaceState } from '$app/navigation';

/**
 * Search Query Store with URL Synchronization
 * 
 * This store manages the search query state and automatically syncs it with the URL.
 * When the search query changes, the URL is updated with ?search= parameter.
 * When the URL changes (e.g., browser back/forward), the search query is updated.
 * 
 * Uses SvelteKit's navigation API to properly manage history state.
 * Uses a "push once per typing burst" strategy to prevent history pollution:
 * - First update in a burst: pushState (creates history entry)
 * - Subsequent updates: replaceState (updates URL without new history)
 * - After 500ms idle: reset for next burst
 */

function createSearchStore() {
    const { subscribe, set, update } = writable<string>('');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasPushedForBurst = false;

    const clearDebounce = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
    };

    return {
        subscribe,

        /**
         * Set the search query and update the URL (debounced)
         */
        set: (value: string) => {
            set(value);
            if (browser) {
                clearDebounce();

                // Push once (so Back works), then replace while the user keeps typing
                updateURL(value, hasPushedForBurst ? 'replace' : 'push');
                hasPushedForBurst = true;

                // Reset the burst after idle
                debounceTimer = setTimeout(() => {
                    hasPushedForBurst = false;
                    debounceTimer = null;
                }, 500);
            }
        },

        /**
         * Initialize the search query without updating the URL
         * Used when reading from URL on page load or browser navigation
         */
        init: (initialValue: string) => {
            if (browser) clearDebounce();
            hasPushedForBurst = false;
            set(initialValue);
        },

        update
    };
}

/**
 * Update the URL with the current search term using SvelteKit's navigation API
 * @param searchTerm - The search term to add to URL
 * @param mode - 'push' creates new history entry, 'replace' updates current entry
 */
function updateURL(searchTerm: string, mode: 'push' | 'replace') {
    if (!browser) return;

    const url = new URL(window.location.href);

    if (searchTerm && searchTerm.trim()) {
        url.searchParams.set('search', searchTerm.trim());
    } else {
        url.searchParams.delete('search');
    }

    // Skip if URL unchanged to avoid duplicate entries and unnecessary work
    if (url.toString() === window.location.href) return;

    // Use SvelteKit's navigation API to preserve router state
    if (mode === 'replace') {
        replaceState(url.toString(), {});
    } else {
        pushState(url.toString(), {});
    }
}

export const searchQuery = createSearchStore();
