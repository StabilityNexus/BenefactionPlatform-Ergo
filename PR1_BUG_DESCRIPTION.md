# 🐛 Bug Report: Gross vs Net Sales Check in contract_v1_0.es

## Summary
The `minimumReached` check in `contract_v1_0.es` uses **gross sales** (`soldCounter`) instead of **net sales** (`soldCounter - refundCounter`).

## Bug Location
- **File**: `contracts/bene_contract/contract_v1_0.es`
- **Lines**: 250-255

## Current (Buggy) Code
```scala
val minimumReached = {
  val minimumSalesThreshold = selfMinimumTokensSold
  val soldCounter = selfSoldCounter  // ← Uses GROSS

  soldCounter >= minimumSalesThreshold
}
```

## Expected (Correct) Code
See `contract_v2.es` lines 229-234:
```scala
val minimumReached: Boolean = {
  val minimumSalesThreshold = selfMinimumTokensSold
  val netSoldCounter = selfSoldCounter - selfRefundCounter  // ← Uses NET

  netSoldCounter >= minimumSalesThreshold
}
```

## Impact
- Project owners can withdraw funds even when NET sales are below minimum
- Users who refunded their tokens are still counted towards the success threshold
- This affects `isWithdrawFunds` and `isExchangeFundingTokens` actions

## Proof
This PR adds a failing test (`tests/contracts/minimum-reached-bug.test.ts`) that demonstrates:
- With minimum=40,000, gross=50,000, refunds=15,000
- **v1.0 (buggy)**: 50,000 >= 40,000 → ✅ PASSES (wrong!)
- **v2 (correct)**: 35,000 >= 40,000 → ❌ FAILS (correct!)

## References
- Issue: #78
- Fixed version: `contract_v2.es`
