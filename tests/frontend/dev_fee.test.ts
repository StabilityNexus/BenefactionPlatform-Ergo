import { describe, it, expect } from "vitest";
import { dev_fee_for } from "$lib/ergo/replica";
import { devFeeOf } from "../contracts/bene_v3_helpers";

/**
 * The fee the frontend offers has to be exactly the fee the contract of that box computes. Too
 * low and the contract rejects the transaction; too high and the owner pays more than they owe.
 * v3 rounds up (#177), everything before it truncates and cannot be changed, because those
 * contracts are already on chain.
 */

const FEE = 5;

describe("dev_fee_for on v3", () => {
    it("rounds up rather than truncating", () => {
        // 19 * 5% = 0.95. v2 gives 0, which is the evasion #177 reports.
        expect(dev_fee_for(19, FEE, "v3")).toBe(1n);
        expect(dev_fee_for(1, FEE, "v3")).toBe(1n);
        expect(dev_fee_for(21, FEE, "v3")).toBe(2n);
    });

    it("is exact when the percentage divides evenly", () => {
        expect(dev_fee_for(100, FEE, "v3")).toBe(5n);
        expect(dev_fee_for(20, FEE, "v3")).toBe(1n);
    });

    it("charges nothing when nothing is extracted", () => {
        expect(dev_fee_for(0, FEE, "v3")).toBe(0n);
    });

    it("matches the contract's own arithmetic across a range", () => {
        // contract_v3.es: (extractedBaseAmount * devFee + 99) / 100, integer division.
        for (let extracted = 0; extracted <= 500; extracted++) {
            const expected = (BigInt(extracted) * BigInt(FEE) + 99n) / 100n;
            expect(dev_fee_for(extracted, FEE, "v3")).toBe(extracted === 0 ? 0n : expected);
        }
    });
});

describe("dev_fee_for on the versions already on chain", () => {
    it("truncates on v2, because the deployed contract does", () => {
        // Not a bug being reproduced for its own sake: offering 1 here would build a transaction
        // the v2 contract rejects, since it computes 0 and requires the output to match.
        expect(dev_fee_for(19, FEE, "v2")).toBe(0n);
        expect(dev_fee_for(20, FEE, "v2")).toBe(1n);
        expect(dev_fee_for(39, FEE, "v2")).toBe(1n);
    });

    it("truncates on v1 too", () => {
        expect(dev_fee_for(19, FEE, "v1_1")).toBe(0n);
        expect(dev_fee_for(19, FEE, "v1_0")).toBe(0n);
    });

    it("matches contract_v2's arithmetic across a range", () => {
        for (let extracted = 0; extracted <= 500; extracted++) {
            expect(dev_fee_for(extracted, FEE, "v2")).toBe((BigInt(extracted) * BigInt(FEE)) / 100n);
        }
    });
});

describe("dev_fee_for arithmetic", () => {
    it("stays exact past the range a double can represent", () => {
        // A token campaign with 9 decimals raising ~10M units of base token puts the product over
        // 2^53, where floating point silently stops counting by ones.
        const extracted = 9_007_199_254_740_993n; // 2^53 + 1
        expect(dev_fee_for(extracted, FEE, "v3")).toBe((extracted * 5n + 99n) / 100n);
        expect(dev_fee_for(extracted, FEE, "v2")).toBe((extracted * 5n) / 100n);
    });

    it("treats a negative extraction as nothing to charge for", () => {
        // Not reachable from the UI, but without the guard the rounding formula turns a negative
        // extraction into a negative fee, which would be built into a transaction as an amount.
        expect(dev_fee_for(-5, FEE, "v3")).toBe(0n);
        expect(dev_fee_for(-10_000, FEE, "v3")).toBe(0n);
        expect(dev_fee_for(-10_000, FEE, "v2")).toBe(0n);
    });

    it("agrees with the figure the compiled v3 contract accepts", () => {
        // devFeeOf is what tests/contracts/v3_invariants.test.ts pays in "should allow the same
        // small withdrawal once the rounded-up fee is paid", against the compiled contract on a
        // mock chain. Tying the two together is what makes this more than a restatement of the
        // formula: if they ever diverge, one of the two suites is wrong and this says so.
        for (const extracted of [1n, 19n, 20n, 21n, 99n, 100n, 1_000_000n]) {
            expect(dev_fee_for(extracted, FEE, "v3")).toBe(devFeeOf(extracted, FEE));
        }
    });
});
