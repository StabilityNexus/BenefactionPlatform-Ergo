/**
 * TTL-based caching system for blockchain data
 * Reduces API calls and improves performance when switching between tabs
 */

export interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
    backgroundRefresh?: boolean; // Whether to refresh in background before expiry
}

export interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export class BlockchainCache<T> {
    private cache: Map<string, CacheItem<T>> = new Map();
    private refreshTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private defaultTTL: number;
    private backgroundRefresh: boolean;

    constructor(options: CacheOptions = {}) {
        this.defaultTTL = options.ttl || 5 * 60 * 1000; // 5 minutes default
        this.backgroundRefresh = options.backgroundRefresh !== false;
    }

    /**
     * Get cached data or fetch from source
     */
    async get(key: string, fetchFn: () => Promise<T>, ttl?: number): Promise<T> {
        const cached = this.cache.get(key);
        const now = Date.now();
        
        // Check if cache exists and is still valid
        if (cached && now - cached.timestamp < cached.ttl) {
            // Schedule background refresh if enabled and near expiry (80% of TTL)
            if (this.backgroundRefresh && 
                now - cached.timestamp > cached.ttl * 0.8 && 
                !this.refreshTimers.has(key)) {
                this.scheduleBackgroundRefresh(key, fetchFn, cached.ttl);
            }
            return cached.data;
        }

        // Fetch fresh data
        try {
            const data = await fetchFn();
            this.set(key, data, ttl);
            return data;
        } catch (error) {
            // If fetch fails and we have stale cache, return it
            if (cached) {
                console.warn(`Cache fetch failed for ${key}, returning stale data`, error);
                return cached.data;
            }
            throw error;
        }
    }

    /**
     * Set cache data
     */
    set(key: string, data: T, ttl?: number): void {
        const effectiveTTL = ttl || this.defaultTTL;
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: effectiveTTL
        });
        
        // Clear any existing refresh timer
        this.clearRefreshTimer(key);
    }

    /**
     * Invalidate specific cache entry
     */
    invalidate(key: string): void {
        this.cache.delete(key);
        this.clearRefreshTimer(key);
    }

    /**
     * Invalidate all cache entries
     */
    invalidateAll(): void {
        this.cache.clear();
        // Clear all refresh timers
        this.refreshTimers.forEach((timer) => clearTimeout(timer));
        this.refreshTimers.clear();
    }

    /**
     * Invalidate cache entries matching a pattern
     */
    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern);
        const keysToDelete: string[] = [];
        
        this.cache.forEach((_, key) => {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        });
        
        keysToDelete.forEach(key => this.invalidate(key));
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Check if cache has valid entry
     */
    has(key: string): boolean {
        const cached = this.cache.get(key);
        if (!cached) return false;
        
        const now = Date.now();
        return now - cached.timestamp < cached.ttl;
    }

    /**
     * Schedule background refresh
     */
    private scheduleBackgroundRefresh(key: string, fetchFn: () => Promise<T>, ttl: number): void {
        const timer = setTimeout(async () => {
            try {
                const data = await fetchFn();
                this.set(key, data, ttl);
                console.log(`Background refresh completed for ${key}`);
            } catch (error) {
                console.error(`Background refresh failed for ${key}`, error);
            }
            this.refreshTimers.delete(key);
        }, 100); // Small delay to batch requests

        this.refreshTimers.set(key, timer);
    }

    /**
     * Clear refresh timer for a key
     */
    private clearRefreshTimer(key: string): void {
        const timer = this.refreshTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.refreshTimers.delete(key);
        }
    }
}

// Singleton instances for different data types
export const projectsCache = new BlockchainCache<any>({
    ttl: 5 * 60 * 1000, // 5 minutes
    backgroundRefresh: true
});

export const userProjectsCache = new BlockchainCache<any>({
    ttl: 3 * 60 * 1000, // 3 minutes for user-specific data
    backgroundRefresh: true
});

export const contributionsCache = new BlockchainCache<any>({
    ttl: 3 * 60 * 1000, // 3 minutes for user-specific data
    backgroundRefresh: true
});

export const walletBalanceCache = new BlockchainCache<any>({
    ttl: 30 * 1000, // 30 seconds for wallet balance
    backgroundRefresh: false
});

export const tokenDetailsCache = new BlockchainCache<any>({
    ttl: 30 * 60 * 1000, // 30 minutes for token details (they rarely change)
    backgroundRefresh: false
});

// Global cache invalidation for wallet address changes
export function invalidateUserSpecificCaches(): void {
    userProjectsCache.invalidateAll();
    contributionsCache.invalidateAll();
    walletBalanceCache.invalidateAll();
    console.log('User-specific caches invalidated due to wallet change');
}

// Export for monitoring
export function getCacheStats(): Record<string, any> {
    return {
        projects: projectsCache.getStats(),
        userProjects: userProjectsCache.getStats(),
        contributions: contributionsCache.getStats(),
        walletBalance: walletBalanceCache.getStats(),
        tokenDetails: tokenDetailsCache.getStats()
    };
}
