# Security Audit Report: Bene Contract v2

## Executive Summary

A **HIGH-SEVERITY** vulnerability has been identified in `contracts/bene_contract/contract_v2.es`. The bug affects the `minimumReached` logic, which can lead to:
- **Loss of funds**: Legitimate withdrawals blocked after minimum was reached
- **Unauthorized refunds**: Refunds allowed after minimum was reached (in edge cases)
- **State inconsistency**: Contract state becomes inconsistent when refunds occur before minimum is reached

## Vulnerability Details

### Bug Location
**File**: `contracts/bene_contract/contract_v2.es`  
**Lines**: 229-234  
**Function**: `minimumReached`

### Technical Description

The `minimumReached` check uses the current net sold tokens (sold - refunded) instead of checking if the minimum was EVER reached:

```scala
// BUGGY CODE (Line 231-233):
val minimumReached: Boolean = {
  val minimumSalesThreshold = selfMinimumTokensSold
  val netSoldCounter = selfSoldCounter - selfRefundCounter  // BUG: Uses net, not total sold
  netSoldCounter >= minimumSalesThreshold
}
```

### Attack Scenario

1. Campaign sells 45k tokens (below 50k minimum)
2. Deadline passes, 15k tokens are refunded (allowed: minimum not reached)
3. Campaign continues, sells 15k more tokens = 60k total sold (minimum reached!)
4. State: `selfSoldCounter = 60k`, `selfRefundCounter = 15k`
5. Contract calculates: `minimumReached = (60k - 15k) >= 50k = false` ❌
6. **Impact**: 
   - Withdrawals are BLOCKED even though minimum WAS reached (60k >= 50k)
   - Refunds may be ALLOWED even though minimum WAS reached (if deadline passed)

### Impact Assessment

**Severity**: HIGH  
**Financial Impact**: Direct loss of funds - owners cannot withdraw even when campaign succeeded  
**Exploitability**: Medium - requires specific sequence of events  
**Affected Functions**:
- `isWithdrawFunds` (Line 452): Blocks legitimate withdrawals
- `isExchangeFundingTokens` (Line 570): Blocks legitimate exchanges
- `isRefundTokens` (Line 301): May allow unauthorized refunds

## Proposed Fix

### Fix Location
**File**: `contracts/bene_contract/contract_v2.es`  
**Lines**: 229-234

### Fix Code

Change the `minimumReached` calculation to check if minimum was EVER reached:

```scala
// FIXED CODE:
val minimumReached: Boolean = {
  val minimumSalesThreshold = selfMinimumTokensSold
  // FIX: Check if minimum was EVER reached, not current net after refunds
  selfSoldCounter >= minimumSalesThreshold
}
```

### Rationale

Once the minimum threshold is reached (`selfSoldCounter >= minimumSalesThreshold`), it should remain true regardless of subsequent refunds. This ensures:
1. Withdrawals are allowed once minimum is reached
2. Refunds are permanently blocked once minimum is reached
3. State remains consistent

## Test Cases

### Failing Test (Demonstrates Bug)
**File**: `tests/contracts/minimum_reached_bug.test.ts`

The test `"CRITICAL BUG: minimumReached blocks legitimate withdrawals after refunds"` demonstrates:
- Campaign reaches minimum (60k sold >= 50k minimum)
- Refunds occur (15k refunded)
- Withdrawal is incorrectly blocked

### Verification Test (Shows Fix Works)
**File**: `tests/contracts/minimum_reached_fix_verification.test.ts`

The test verifies that with the fix:
- Withdrawals are allowed when minimum was reached
- Refunds are blocked when minimum was reached

## Fixed Contract

A fixed version of the contract is provided at:
**File**: `contracts/bene_contract/contract_v2_FIXED.es`

## Recommendations

1. **Immediate Action**: Apply the fix to `contract_v2.es`
2. **Testing**: Run comprehensive tests with the fixed contract
3. **Review**: Audit other contracts for similar logic flaws
4. **Documentation**: Update contract documentation to clarify minimum threshold behavior

## Additional Notes

- The bug affects both ERG and custom token modes
- The vulnerability is present in all scenarios where refunds can occur before minimum is reached
- The fix is minimal and surgically precise (single line change)
- No breaking changes to other contract functionality

## Conclusion

This vulnerability represents a critical flaw that can lead to direct financial loss. The proposed fix is simple, effective, and maintains backward compatibility for all other contract functions. Immediate remediation is recommended.

