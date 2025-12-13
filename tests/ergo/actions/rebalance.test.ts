import { vi } from 'vitest';
import { rebalance } from '$lib/ergo/actions/rebalance';
import * as utxosModule from 'wallet-svelte-component';
import * as pending from '$lib/common/pending-utxos';

const project = {
  box: { boxId: 'p1', assets: [] },
  token_details: { decimals: 0, name: 'TST' },
  project_id: 'proj1',
  current_idt_amount: 1n,
  current_pft_amount: 0,
  value: 1000000, // 0.01 ERG
  base_token_id: '',
  constants: {},
  version: 1,
  is_timestamp_limit: false,
  block_limit: 0,
  minimum_amount: 0,
  sold_counter: 0,
  refund_counter: 0,
  auxiliar_exchange_counter: 0,
  exchange_rate: 1,
  content: { raw: '{}' }
} as any;

describe('rebalance action', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null if inputs are reserved', async () => {
    vi.spyOn(utxosModule, 'getChangeAddress').mockResolvedValueOnce('address');
    vi.spyOn(utxosModule, 'getUtxos').mockResolvedValueOnce([{ boxId: 'u1' }] as any);
    vi.spyOn(pending, 'areBoxesReserved').mockReturnValue(true);

    const res = await rebalance(project, 1);
    expect(res).toBeNull();
  });
});
