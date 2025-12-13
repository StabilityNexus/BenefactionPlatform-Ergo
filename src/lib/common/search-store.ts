import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Search Query Store with URL Synchronization
 * 
 * This store manages the search query state and automatically syncs it with the URL.
 * When the search query changes, the URL is updated with ?search= parameter.
 * When the URL changes (e.g., browser back/forward), the search query is updated.
 * 
 * Uses debouncing to prevent creating a history entry for every keystroke.
 */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function createSearchStore() {
    const { subscribe, set, update } = writable<string>('');

    return {
        subscribe,

        /**
         * Set the search query and update the URL (debounced)
         */
        set: (value: string) => {
            set(value);
            if (browser) {
                // Clear existing timer
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                // Use replaceState immediately for smooth UX (no history entry)
                updateURL(value, true);

                // After debounce, use pushState to create a single history entry
                debounceTimer = setTimeout(() => {
                    updateURL(value, false);
                }, 500); // 500ms debounce
            }
        },

        /**
         * Initialize the search query without updating the URL
         * Used when reading from URL on page load
         */
        init: (initialValue: string) => {
            set(initialValue);
        },

        update
    };
}

/**
 * Update the URL with the current search term
 * @param searchTerm - The search term to add to URL
 * @param replace - If true, use replaceState (no history entry), otherwise pushState
 */
function updateURL(searchTerm: string, replace: boolean = false) {
    if (!browser) return;

    const url = new URL(window.location.href);

    if (searchTerm && searchTerm.trim()) {
        url.searchParams.set('search', searchTerm.trim());
    } else {
        url.searchParams.delete('search');
    }

    if (replace) {
        // Replace current history entry (no new entry)
        window.history.replaceState({}, '', url);
    } else {
        // Create new history entry
        window.history.pushState({}, '', url);
    }
}

export const searchQuery = createSearchStore();
