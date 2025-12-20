# 🔧 Fix: Use Net Sales in minimumReached and minimumNotReached Checks (Issue #78)

## Summary
This PR fixes the `minimumReached` and `minimumNotReached` bugs in `contract_v1_0.es` by changing both checks to use **net sales** instead of gross.

## Changes Made
### `contracts/bene_contract/contract_v1_0.es`

#### 1. minimumReached (lines 250-256)
```diff
  val minimumReached = {
    val minimumSalesThreshold = selfMinimumTokensSold
-   val soldCounter = selfSoldCounter
-
-   soldCounter >= minimumSalesThreshold
+   // FIX: Use NET sales (sold - refunded) instead of just gross
+   val netSoldCounter = selfSoldCounter - selfRefundCounter
+
+   netSoldCounter >= minimumSalesThreshold
  }
```

#### 2. minimumNotReached in isRefundTokens (lines 329-335)
```diff
      val minimumNotReached = {
          val minimumSalesThreshold = selfMinimumTokensSold
-         val soldCounter = selfSoldCounter
-
-         soldCounter < minimumSalesThreshold
+         // FIX: Use NET sales (sold - refunded) for consistency with minimumReached
+         val netSoldCounter = selfSoldCounter - selfRefundCounter
+
+         netSoldCounter < minimumSalesThreshold
      }
```

## Why This Fix Is Correct
Both checks must use the same definition of "sales" to maintain logical consistency:
- `minimumReached`: Uses net sales to determine if withdrawals/exchanges are allowed
- `minimumNotReached`: Uses net sales to determine if refunds are allowed

Using the same `netSoldCounter = selfSoldCounter - selfRefundCounter` ensures:
- When net >= minimum: `minimumReached = true`, `minimumNotReached = false`
- When net < minimum: `minimumReached = false`, `minimumNotReached = true`

This fix aligns `contract_v1_0.es` with the behavior already implemented in `contract_v2.es`.

## Testing
The failing test from PR #1 demonstrates the conceptual bug.

## References
- Bug PR: See PR #1
- Issue: #78
- Already fixed in: `contract_v2.es`
