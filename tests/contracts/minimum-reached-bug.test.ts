/**
 * @file minimum-reached-bug.test.ts
 * @description Demonstrates a bug in the Bene contract_v1_0.es minimumReached check.
 * 
 * BUG DESCRIPTION:
 * The `minimumReached` check in `contract_v1_0.es` (lines 250-255) uses:
 *   soldCounter >= minimumSalesThreshold
 * 
 * This uses GROSS sales (total ever sold) instead of NET sales (sold - refunded).
 * 
 * This is fixed in `contract_v2.es` (lines 229-234) which correctly uses:
 *   netSoldCounter = selfSoldCounter - selfRefundCounter
 * 
 * IMPACT:
 * - v1.0 contracts may allow withdrawals/exchanges when net sales are below minimum
 * - Users who refunded are still counted towards the minimum threshold
 * 
 * This test demonstrates the conceptual bug.
 */

import { describe, test, expect } from 'vitest';

describe('Minimum Reached Bug Demonstration (Issue #78)', () => {

    /**
     * This test demonstrates the difference between v1.0 (buggy) and v2 (fixed).
     * 
     * In contract_v1_0.es (lines 250-255):
     *   val minimumReached = {
     *     val minimumSalesThreshold = selfMinimumTokensSold
     *     val soldCounter = selfSoldCounter  // ← Uses GROSS
     *     soldCounter >= minimumSalesThreshold
     *   }
     * 
     * In contract_v2.es (lines 229-234):
     *   val minimumReached: Boolean = {
     *     val minimumSalesThreshold = selfMinimumTokensSold
     *     val netSoldCounter = selfSoldCounter - selfRefundCounter  // ← Uses NET (FIXED)
     *     netSoldCounter >= minimumSalesThreshold
     *   }
     */
    test('Bug: v1.0 minimumReached uses gross instead of net sales', () => {
        // Simulate contract state
        const selfMinimumTokensSold = 40000n; // Minimum required: 40,000 tokens
        const selfSoldCounter = 50000n;       // Gross sold: 50,000 tokens
        const selfRefundCounter = 15000n;     // Refunded: 15,000 tokens

        // v1.0 (BUGGY) LOGIC - uses gross
        const minimumReached_v1_BUGGY = selfSoldCounter >= selfMinimumTokensSold;

        // v2 (CORRECT) LOGIC - uses net
        const netSoldCounter = selfSoldCounter - selfRefundCounter; // 35,000
        const minimumReached_v2_CORRECT = netSoldCounter >= selfMinimumTokensSold;

        // v1.0 says minimum IS reached (50,000 >= 40,000) ✓
        expect(minimumReached_v1_BUGGY).toBe(true);

        // v2 correctly says minimum is NOT reached (35,000 < 40,000) ✗
        expect(minimumReached_v2_CORRECT).toBe(false);

        // This shows the discrepancy
        expect(minimumReached_v1_BUGGY).not.toBe(minimumReached_v2_CORRECT);

        console.log('='.repeat(60));
        console.log('BUG DEMONSTRATED (Issue #78):');
        console.log(`  Minimum threshold:     ${selfMinimumTokensSold}`);
        console.log(`  Gross sold:            ${selfSoldCounter}`);
        console.log(`  Refunds:               ${selfRefundCounter}`);
        console.log(`  Net sold:              ${netSoldCounter}`);
        console.log('');
        console.log(`  v1.0 check (gross):    ${minimumReached_v1_BUGGY ? 'PASSED' : 'FAILED'}`);
        console.log(`  v2 check (net):        ${minimumReached_v2_CORRECT ? 'PASSED' : 'FAILED'}`);
        console.log('');
        console.log('  v1.0 incorrectly allows withdrawals when net < minimum');
        console.log('='.repeat(60));
    });

    test('Bug location: contract_v1_0.es lines 250-255', () => {
        const bugInfo = {
            file: 'contracts/bene_contract/contract_v1_0.es',
            lines: '250-255',
            variable: 'minimumReached',
            issue: 'Uses soldCounter (gross) instead of soldCounter - refundCounter (net)',
            fixedIn: 'contract_v2.es lines 229-234'
        };

        expect(bugInfo.file).toBe('contracts/bene_contract/contract_v1_0.es');

        console.log(`\nBug Location: ${bugInfo.file}:${bugInfo.lines}`);
        console.log(`Variable: ${bugInfo.variable}`);
        console.log(`Issue: ${bugInfo.issue}`);
        console.log(`Fixed in: ${bugInfo.fixedIn}`);
    });
});
