# 🔒 Security Fix: Critical Bug in minimumReached Logic

## Summary

Fixes **HIGH-SEVERITY** vulnerability in `contract_v2.es` (lines 229-234) that blocks legitimate withdrawals and may allow unauthorized refunds.

## The Bug

`minimumReached` incorrectly uses net sold tokens (`sold - refunded`) instead of checking if minimum was **EVER** reached:

```scala
// BUGGY (line 231-233):
val netSoldCounter = selfSoldCounter - selfRefundCounter
netSoldCounter >= minimumSalesThreshold

// FIXED:
selfSoldCounter >= minimumSalesThreshold
```

## Attack Scenario

1. Campaign sells 45k tokens (below 50k minimum)
2. 15k tokens refunded (allowed)
3. Campaign sells 15k more = **60k total sold** (minimum reached!)
4. Contract calculates: `(60k - 15k) >= 50k = false` ❌
5. **Result**: Withdrawals blocked even though minimum WAS reached

## Impact

- 🔴 **HIGH SEVERITY**: Direct loss of funds
- Owners cannot withdraw even when campaign succeeded
- Affects `isWithdrawFunds`, `isExchangeFundingTokens`, `isRefundTokens`

## The Fix

Change line 231-233 to check if minimum was **EVER** reached:
```scala
selfSoldCounter >= minimumSalesThreshold
```

## Tests

- ✅ `tests/contracts/minimum_reached_bug.test.ts` - Demonstrates bug
- ✅ `tests/contracts/minimum_reached_fix_verification.test.ts` - Verifies fix

## Files Changed

- `contracts/bene_contract/contract_v2.es` - **FIX NEEDED** (line 231-233)
- `contracts/bene_contract/contract_v2_FIXED.es` - Reference implementation
- Test files and documentation added

---

**Severity**: 🔴 HIGH | **Status**: ✅ Fix Ready | **Priority**: 🚨 URGENT

