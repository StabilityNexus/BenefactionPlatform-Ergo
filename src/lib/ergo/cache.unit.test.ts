/* 
Test framework note:
- This test suite is written to be compatible with either Vitest or Jest.
- If using Vitest (preferred if devDependency "vitest" or vitest.config.* exists): 
    import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
- If using Jest:
    The global functions (describe, it, expect, jest, beforeEach, afterEach) are available.
    Replace "vi" with "jest" where indicated.
*/

let isVitest = false;
try {
  // Dynamic detection: If vitest is present, we import from it; otherwise we assume Jest globals.
  // This pattern is safe at type time in TS via any-cast and runtime guarded require.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vitest = require('vitest');
  if (vitest && vitest.describe && vitest.it) {
    isVitest = true;
  }
} catch {}

let viLike: any;
let useFakeTimers: () => void;
let useRealTimers: () => void;
let spyOn: (obj: any, method: any) => any;
let advanceTimersByTime: (ms: number) => void;
let clearAllTimers: () => void;
let setSystemTime: (ms: number | Date) => void;
let clearSystemTime: () => void;

if (isVitest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { describe, it, expect, vi, beforeEach, afterEach } = require('vitest');
  // Promote vitest globals to file scope
  // @ts-ignore
  global.describe = describe;
  // @ts-ignore
  global.it = it;
  // @ts-ignore
  global.expect = expect;
  // @ts-ignore
  global.beforeEach = beforeEach;
  // @ts-ignore
  global.afterEach = afterEach;

  viLike = vi;
  useFakeTimers = () => vi.useFakeTimers();
  useRealTimers = () => vi.useRealTimers();
  spyOn = (obj: any, method: any) => vi.spyOn(obj, method);
  advanceTimersByTime = (ms: number) => vi.advanceTimersByTime(ms);
  clearAllTimers = () => vi.clearAllTimers();
  setSystemTime = (ms: number | Date) => vi.setSystemTime(ms);
  clearSystemTime = () => vi.setSystemTime(undefined);
} else {
  // Assume Jest
  viLike = (global as any).jest;
  useFakeTimers = () => (global as any).jest.useFakeTimers();
  useRealTimers = () => (global as any).jest.useRealTimers();
  spyOn = (obj: any, method: any) => (global as any).jest.spyOn(obj, method);
  advanceTimersByTime = (ms: number) => (global as any).jest.advanceTimersByTime(ms);
  clearAllTimers = () => (global as any).jest.clearAllTimers();
  setSystemTime = (ms: number | Date) => (global as any).jest.setSystemTime(ms);
  clearSystemTime = () => (global as any).jest.setSystemTime(undefined);
}

import type { CacheOptions } from './cache.test';
import {
  BlockchainCache,
  projectsCache,
  userProjectsCache,
  contributionsCache,
  walletBalanceCache,
  tokenDetailsCache,
  invalidateUserSpecificCaches,
  getCacheStats
} from './cache.test';

// Utility to create a fresh cache with controlled TTL for tests
const makeCache = <T>(opts: CacheOptions = {}) => new BlockchainCache<T>(opts);

describe('BlockchainCache - basic set/get and TTL behavior', () => {
  const TTL = 1000; // 1s TTL to keep tests fast

  beforeEach(() => {
    useFakeTimers();
    // Start time = epoch 0
    setSystemTime(0);
  });

  afterEach(() => {
    clearAllTimers();
    useRealTimers();
    clearSystemTime();
    // Restore any spies
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  it('returns fetched data when cache is empty (happy path)', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchFn ? fetchFn.mockResolvedValue('A') : async () => 'A';

    const result = await cache.get('k', fetch);
    expect(result).toBe('A');

    if (fetchFn) {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
    expect(cache.has('k')).toBe(true);
  });

  it('returns cached data when within TTL and does not refetch immediately', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchFn ? fetchFn.mockResolvedValueOnce('A').mockResolvedValueOnce('B') : async () => 'A';

    // First call populates cache
    const first = await cache.get('k', fetch);
    expect(first).toBe('A');
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance time to 50% TTL
    setSystemTime(TTL * 0.5);

    const second = await cache.get('k', fetch);
    expect(second).toBe('A'); // still cached
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1); // no new fetch yet
  });

  it('has() respects TTL window', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    const fetch = async () => 'A';

    await cache.get('k', fetch);
    expect(cache.has('k')).toBe(true);

    // Move just before expiry
    setSystemTime(TTL - 1);
    expect(cache.has('k')).toBe(true);

    // Move to expiry and beyond
    setSystemTime(TTL + 1);
    expect(cache.has('k')).toBe(false);
  });
});

describe('BlockchainCache - background refresh near expiry', () => {
  const TTL = 1000; // 1s TTL
  const REFRESH_DELAY = 100; // internal setTimeout in scheduleBackgroundRefresh

  beforeEach(() => {
    useFakeTimers();
    setSystemTime(0);
  });

  afterEach(() => {
    clearAllTimers();
    useRealTimers();
    clearSystemTime();
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  it('schedules background refresh when >80% TTL elapsed and updates cache', async () => {
    const cache = makeCache<string>({ ttl: TTL, backgroundRefresh: true });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    // First fetch returns 'A', background refresh returns 'B'
    const fetch = fetchFn ? fetchFn.mockResolvedValueOnce('A').mockResolvedValueOnce('B') : async () => 'A';

    // Seed cache
    const initial = await cache.get('item', fetch);
    expect(initial).toBe('A');
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    // Move time to just over 80% TTL to trigger background refresh on access
    setSystemTime(Math.ceil(TTL * 0.81));

    // Access cache to schedule background refresh
    const stillCached = await cache.get('item', fetch);
    expect(stillCached).toBe('A'); // returns cached immediately
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance timers so the scheduled refresh runs
    advanceTimersByTime(REFRESH_DELAY + 1);

    // After background refresh fires, data should be updated
    // Access again to get the refreshed value
    const refreshed = await cache.get('item', fetch);
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(refreshed).toBe('B');
  });

  it('does not schedule background refresh when disabled', async () => {
    const cache = makeCache<string>({ ttl: TTL, backgroundRefresh: false });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchFn ? fetchFn.mockResolvedValueOnce('A').mockResolvedValueOnce('B') : async () => 'A';

    await cache.get('k', fetch);
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    setSystemTime(Math.ceil(TTL * 0.9));
    await cache.get('k', fetch);

    // Advance timers; if background refresh had been scheduled, we'd see another fetch
    advanceTimersByTime(200);
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('BlockchainCache - fetch failures and stale data behavior', () => {
  const TTL = 500;

  beforeEach(() => {
    useFakeTimers();
    setSystemTime(0);
  });

  afterEach(() => {
    clearAllTimers();
    useRealTimers();
    clearSystemTime();
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  it('returns stale data on fetch failure if stale cache exists', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchFn ? fetchFn
      .mockResolvedValueOnce('A')   // initial population
      .mockRejectedValueOnce(new Error('network')) // retry failure
     : async () => 'A';

    const first = await cache.get('k', fetch);
    expect(first).toBe('A');
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    // Move past TTL so cache is stale
    setSystemTime(TTL + 10);

    const second = await cache.get('k', fetch);
    // Despite fetch failure, should return stale 'A'
    expect(second).toBe('A');
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws when fetch fails and no cache exists', async () => {
    const cache = makeCache<string>({ ttl: TTL });

    const fetch = async () => {
      throw new Error('boom');
    };

    await expect(cache.get('missing', fetch)).rejects.toThrow('boom');
  });
});

describe('BlockchainCache - invalidation and pattern invalidation', () => {
  const TTL = 1000;

  beforeEach(() => {
    useFakeTimers();
    setSystemTime(0);
  });

  afterEach(() => {
    clearAllTimers();
    useRealTimers();
    clearSystemTime();
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  it('invalidate removes a specific key', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    await cache.get('one', async () => '1');
    expect(cache.has('one')).toBe(true);

    cache.invalidate('one');
    expect(cache.has('one')).toBe(false);
  });

  it('invalidateAll clears all entries and prevents scheduled refresh from firing', async () => {
    const cache = makeCache<string>({ ttl: TTL, backgroundRefresh: true });
    const fetchFn = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchFn ? fetchFn.mockResolvedValue('seed') : async () => 'seed';

    // Seed a key
    await cache.get('k', fetch);
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);

    // Move past 80% of TTL to schedule background refresh on access
    setSystemTime(Math.ceil(TTL * 0.85));
    await cache.get('k', fetch);
    // Now immediately invalidate all
    cache.invalidateAll();

    // Even if timers run, background refresh should have been cleared
    advanceTimersByTime(200);
    if (fetchFn) expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cache.has('k')).toBe(false);
  });

  it('invalidatePattern removes only matching keys', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    await cache.get('user:1', async () => 'A');
    await cache.get('user:2', async () => 'B');
    await cache.get('project:1', async () => 'C');

    expect(cache.has('user:1')).toBe(true);
    expect(cache.has('user:2')).toBe(true);
    expect(cache.has('project:1')).toBe(true);

    cache.invalidatePattern('^user:');

    expect(cache.has('user:1')).toBe(false);
    expect(cache.has('user:2')).toBe(false);
    expect(cache.has('project:1')).toBe(true);
  });

  it('getStats returns size and keys', async () => {
    const cache = makeCache<string>({ ttl: TTL });
    await cache.get('a', async () => 'A');
    await cache.get('b', async () => 'B');

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.keys.sort()).toEqual(['a', 'b']);
  });
});

describe('Exported singletons and helpers', () => {
  beforeEach(() => {
    useFakeTimers();
    setSystemTime(0);
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  afterEach(() => {
    clearAllTimers();
    useRealTimers();
    clearSystemTime();
    if (viLike && viLike.restoreAllMocks) {
      viLike.restoreAllMocks();
    }
  });

  it('getCacheStats returns expected structure', () => {
    const stats = getCacheStats();
    expect(stats).toHaveProperty('projects');
    expect(stats).toHaveProperty('userProjects');
    expect(stats).toHaveProperty('contributions');
    expect(stats).toHaveProperty('walletBalance');
    expect(stats).toHaveProperty('tokenDetails');
    // keys and size fields exist
    expect(stats.projects).toHaveProperty('size');
    expect(Array.isArray(stats.projects.keys)).toBe(true);
  });

  it('invalidateUserSpecificCaches clears relevant caches and logs', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    // Seed entries into the user-specific caches
    await userProjectsCache.get('u1', async () => ({ id: 'u1' }));
    await contributionsCache.get('c1', async () => ({ id: 'c1' }));
    await walletBalanceCache.get('w1', async () => ({ id: 'w1' }));

    // Ensure they have items
    expect(userProjectsCache.getStats().size).toBe(1);
    expect(contributionsCache.getStats().size).toBe(1);
    expect(walletBalanceCache.getStats().size).toBe(1);

    invalidateUserSpecificCaches();

    // Now they should be empty
    expect(userProjectsCache.getStats().size).toBe(0);
    expect(contributionsCache.getStats().size).toBe(0);
    expect(walletBalanceCache.getStats().size).toBe(0);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy as any).mock.calls[0][0]).toMatch(/User-specific caches invalidated/);
  });

  it('singleton caches obey configured backgroundRefresh flag (walletBalance=false)', async () => {
    const fetchSpy = viLike?.fn?.() || ((..._args: any[]) => {});
    const fetch = fetchSpy ? fetchSpy.mockResolvedValueOnce(100).mockResolvedValueOnce(200) : async () => 100;

    // Seed wallet balance (backgroundRefresh: false)
    const first = await walletBalanceCache.get('balance', fetch);
    expect(first).toBe(100);
    if (fetchSpy) expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Push time significantly to attempt a near-expiry read
    setSystemTime(Date.now() + 25_000); // near 30s TTL but not expired
    const second = await walletBalanceCache.get('balance', fetch);
    expect(second).toBe(100);
    // Advance timers: no background refresh should have been scheduled
    advanceTimersByTime(500);
    if (fetchSpy) expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});