# Bug Report: `isExchangeFundingTokens` - `endOrReplicate` Variable Not Used

## Summary

The `isExchangeFundingTokens` action in `contract_v2.es` defines an `endOrReplicate` variable to allow contract termination when all PFT tokens have been exchanged, but this variable is **never used**. The `constants` check incorrectly uses `isSelfReplication` instead.

---

## Bug Details

| Field | Value |
|-------|-------|
| **File** | `contracts/bene_contract/contract_v2.es` |
| **Action** | `isExchangeFundingTokens` |
| **Lines** | ~520-580 |
| **Severity** | Medium |
| **Type** | Logic Error / Dead Code |

---

## Root Cause

The `endOrReplicate` variable is defined but **never used** in the `constants` check:

```ergoscript
val endOrReplicate = {
    val allFundsWithdrawn = selfValue == OUTPUTS(0).value
    val allTokensWithdrawn = SELF.tokens.size == 1
    isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
}

val constants = allOf(Coll(
    isSelfReplication,  // <-- BUG: Should be endOrReplicate
    // endOrReplicate,  // <-- This is commented out!
    soldCounterRemainsConstant,
    refundCounterRemainsConstant,
    mantainValue
))
```

---

## Impact

| Impact | Description |
|--------|-------------|
| **Blockchain Bloat** | Contract boxes remain on the blockchain forever, even when they serve no purpose |
| **Locked ERG** | The minimum box value (~0.001 ERG per contract) cannot be recovered |
| **Inconsistency** | Other actions like `isWithdrawUnsoldTokens` and `isWithdrawFunds` correctly use `endOrReplicate` |

---

## Evidence: Comparison with Other Actions

### ✅ `isWithdrawUnsoldTokens` (CORRECT)
```ergoscript
val constants = allOf(Coll(
    endOrReplicate,  // ✅ Correctly uses endOrReplicate
    ...
))
```

### ✅ `isWithdrawFunds` (CORRECT)
```ergoscript
val constants = allOf(Coll(
    endOrReplicate,  // ✅ Correctly uses endOrReplicate
    ...
))
```

### ❌ `isExchangeFundingTokens` (BUG)
```ergoscript
val constants = allOf(Coll(
    isSelfReplication,  // ❌ BUG: Should be endOrReplicate
    ...
))
```

---

## Fix Applied (v1.2.2)

```diff
val constants = allOf(Coll(
-   isSelfReplication,                        
+   endOrReplicate,                           // FIXED: Changed from isSelfReplication
    soldCounterRemainsConstant,
    refundCounterRemainsConstant,
    mantainValue
))
```

---

## Test Evidence

Test file: `tests/contracts/exchange_termination_bug.test.ts`

All 6 tests pass after the fix:
- ✅ BUG DEMO: Cannot terminate contract directly when PFT tokens remain (USD Token Mode)
- ✅ Exchange with self-replication works correctly (USD Token Mode)
- ✅ BUG: Contract with 0 PFT cannot be terminated via isExchangeFundingTokens (USD Token Mode)
- ✅ BUG DEMO: Cannot terminate contract directly when PFT tokens remain (ERG Mode)
- ✅ Exchange with self-replication works correctly (ERG Mode)
- ✅ BUG: Contract with 0 PFT cannot be terminated via isExchangeFundingTokens (ERG Mode)

---

## References

- Contract file: `contracts/bene_contract/contract_v2.es`
- Test file: `tests/contracts/exchange_termination_bug.test.ts`
- Related GitHub Issue: #78 (Unstoppable Hackathon Bounty)
