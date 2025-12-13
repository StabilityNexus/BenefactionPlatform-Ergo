import { vi } from 'vitest';
import {
  reserveBoxes,
  releaseBoxes,
  areBoxesReserved,
  registerPendingTx,
  clearAllReservations,
  getReservedCount,
} from '$lib/common/pending-utxos';

import * as fetchModule from '$lib/ergo/fetch';

describe('pending-utxos reservation manager', () => {
  const boxA = { boxId: 'a' } as any;
  const boxB = { boxId: 'b' } as any;

  beforeEach(() => {
    clearAllReservations();
    vi.restoreAllMocks();
  });

  it('reserves and releases boxes', () => {
    expect(getReservedCount()).toBe(0);
    expect(reserveBoxes([boxA, boxB])).toBe(true);
    expect(getReservedCount()).toBe(2);
    expect(areBoxesReserved([boxA])).toBe(true);
    expect(reserveBoxes([boxA])).toBe(false);

    releaseBoxes([boxA]);
    expect(getReservedCount()).toBe(1);
    expect(areBoxesReserved([boxA])).toBe(false);
    expect(areBoxesReserved([boxB])).toBe(true);
  });

  it('registerPendingTx releases boxes when confirmed', async () => {
    // Mock the wait_until_confirmation to resolve quickly
    vi.spyOn(fetchModule, 'wait_until_confirmation').mockResolvedValue({} as any);
    expect(reserveBoxes([boxA])).toBe(true);
    expect(getReservedCount()).toBe(1);
    await registerPendingTx('tx-1', [boxA]);
    expect(getReservedCount()).toBe(0);
  });

  it('registerPendingTx releases boxes even when wait fails', async () => {
    vi.spyOn(fetchModule, 'wait_until_confirmation').mockRejectedValue(new Error('network'));
    expect(reserveBoxes([boxA])).toBe(true);
    expect(getReservedCount()).toBe(1);
    await registerPendingTx('tx-2', [boxA]);
    expect(getReservedCount()).toBe(0);
  });
});
