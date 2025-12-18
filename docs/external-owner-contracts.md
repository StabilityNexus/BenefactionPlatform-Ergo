# Bene: Integrating External Contracts (Custom ErgoTrees)

**Purpose:**
Provides a concrete, implementable integration guide for configuring the Bene (Benefaction Platform) so external apps/contracts collect funds directly into custom ErgoTrees.

---
## Must Ensure For Implementation

1. **Don't assume token order**: a script must *search* the token collection for the singleton NFT id. The earlier docs reference `tokens(0)` which is unreliable.

2. **Don't assume OUTPUTS(0) is your recreated owner box**: transaction construction may place outputs in any order. The correct approach is to locate the output(s) whose `propositionBytes` equal the owner script and then assert properties (token presence, value >= SELF.value, etc.).

3. **Self-spend path visibility**: the “self‑spend” path must allow *anyone* to create the transaction that deposits funds/tokens to your box (permissionless deposit). But that path should be carefully constrained so it cannot be used to siphon funds.

4. **Minimum box value (storage rent)** must be accounted for. When Bene deposits tokens, your box must still meet the blockchain minimum value. Ensure your logic checks `OUTPUT.value >= minBoxValue` or that test flows always deposit enough ERG.

5. **Singleton enforcement**: instead of relying only on a token at index zero, enforce uniqueness by verifying the presence of a specific NFT id and, optionally, that only one box with that NFT exists in a given context (off-chain index or on-chain enforcement depending on your model).

---

## Owner Contract requirements

1. **Spendable**: the script must allow the owner (admin) to withdraw via a secure admin branch (P2PK signature, multisig, or admin NFT proof).

2. **Self‑replication (permissionless deposit branch)**: the script must include a branch that evaluates to `true` for deposit transactions if and only if:

   * An output exists whose `propositionBytes == SELF.propositionBytes` (script preserved); AND
   * That output contains the **singleton NFT** (the same token id is present); AND
   * The recreated output's value is **>=** the original `SELF.value` (prevents draining during the deposit path); AND
   * (Optional but recommended) The recreated output keeps important registers unchanged (or follows a well-defined update rule), e.g., `R4` holds metadata and must not be reset by deposit transactions.

   This branch **must not** require the owner's private key to execute: it must be accessible to anyone (so Bene can deposit). However, it should still prevent draining by checking the conditions above.

3. **Singleton enforcement**: ensure one canonical box is used for fundraising. Practically, implement this by:

   * Requiring the presence of a unique NFT (singleton token) in the box.
   * Optionally tracking a unique campaign id in a register.

4. **Admin withdrawal branch**: a secure path for the admin to withdraw or reconfigure the box. This might require `sigmaProp(blsVerify(...) )` or `PK` signature or presence of an Admin NFT in the signing input.

5. **Dust & storage rent handling**: the contract should expect incoming donations to cover the minimum storage rent; include a guard to reject recreations that fall below a safe minimum.

---

## Sample Template (Pseudocode)

> Replace placeholders (e.g., `SINGLETON_ID_HEX`, `ADMIN_PUBKEY_BASE58`) before compiling.

```scala
// === Constants (replace with real values before compile) ===
val ADMIN_PK_HEX = "<ADMIN_PUBKEY_HEX>"            // Owner's public key (hex or other accepted literal)
val SINGLETON_TOKEN_ID_HEX = "<SINGLETON_TOKEN_ID_HEX>" // The NFT token id (hex)
val MIN_BOX_VALUE = 1000000L  // Minimum nanoergs for the box (adjust to safe threshold)

// === Helpers ===
// findToken(box, tokenIdHex) -> Boolean: returns true if `tokenIdHex` exists in box.tokens
def findToken(box: Box, tokenIdHex: Coll[Byte]): Boolean = {
  box.tokens.exists({(t: (Coll[Byte], Long)) => t._1 == tokenIdHex})
}

// locate outputs having the same script as SELF and return the first match
def findSelfLikeOutput(): Option[Box] = {
  // scan outputs and find a box with propositionBytes equal to SELF.propositionBytes
  OUTPUTS.find({(b: Box) => b.propositionBytes == SELF.propositionBytes})
}

// === Branch 1: Admin withdrawal (secure) ===
val isAdmin = {
  // simple P2PK check
  val adminPk = decodeHex(ADMIN_PK_HEX) // placeholder to show how admin key gets used
  sigmaProp(HEIGHT >= 0) && sigmaProp(blsVerify(...)) // <-- illustrative; replace with your actual admin check
}

// === Branch 2: Bene deposit / self‑replication (permissionless, constrained) ===
val isBeneDeposit = {
  val optSelfOut = findSelfLikeOutput()
  // must exist and preserve singleton token
  optSelfOut.isDefined && {
    val out = optSelfOut.get
    val singletonPresentInSelf = findToken(SELF, decodeHex(SINGLETON_TOKEN_ID_HEX))
    val singletonPresentInOut = findToken(out, decodeHex(SINGLETON_TOKEN_ID_HEX))
    val valueOk = out.value >= SELF.value
    val minValueOk = out.value >= MIN_BOX_VALUE

    // Optionally ensure some registers/metadata not lost; for example R4 must be preserved
    val r4Preserved = (out.getRegister(4) == SELF.getRegister(4)) || ((out.getRegister(4)).isDefined == false && (SELF.getRegister(4)).isDefined == false)

    singletonPresentInSelf && singletonPresentInOut && valueOk && minValueOk && r4Preserved
  }
}

// === Final script ===
sigmaProp(isAdmin || isBeneDeposit)
```

**Notes on the template:**

* `decodeHex(...)` is a placeholder function to express the idea of converting hex constants into the required `Coll[Byte]` form (actual compiler functions may vary). Replace with legal expressions for your chosen compiler or SDK.
* The admin branch should be implemented using a secure method compatible with your deployment (e.g., `proveDlog` via a given `PK`, or an Admin NFT in a multisig pattern).
* The deposit branch uses *existence checks* (presence of singleton NFT and preserved script) instead of relying on fixed token indices.

---

## Integration steps: proven workflow

1. **Write and unit test your ErgoScript locally.**

   * Use local unit tests and the ErgoScript test harness (or your preferred framework) to validate both the admin path and the deposit path.

2. **Compile to ErgoTree hex** using an official compiler (Fleet or the ErgoScript compiler). Keep the resulting hex string safe.

3. **Deploy the owner box on Testnet.**

   * Mint or transfer the singleton NFT to the created box so it becomes the canonical box for the campaign.

4. **Configure Bene campaign:**

   * When creating a Bene campaign (testnet), set `R8[0]` or the Owner/Recipient field to your compiled ErgoTree hex.

5. **Test flows:**

   * Create a test donation and verify that:

     * Funds arrive in the owner box.
     * Contribution Tokens (if used) appear inside the owner box.
     * The owner/admin can withdraw via the admin branch.
   * Run negative tests (malformed outputs, outputs that remove the singleton, outputs that reduce value) and ensure the deposit path rejects them.

6. **Audit & review:**

   * Get a code review or audit before mainnet deployment.

7. **Deploy to Mainnet** only after successful tests & audit.

---

## Off‑chain transaction patterns (what your bot/frontend will do)

When performing privileged operations on Bene (e.g., adding stock, withdrawing unsold tokens) you must build a transaction that includes both the Bene box and your owner box as inputs and outputs: the general flow:

1. **Inputs:**

   * Bene campaign box (the box representing the campaign state)
   * Owner box (your singleton box)
   * Any other necessary UTXOs or fee inputs

2. **Outputs:**

   * Updated Bene box (replicated or updated per Bene logic)
   * Recreated owner box (must match the self‑replication constraints when that branch is used)
   * Any beneficiaries/final withdrawal outputs when performing admin withdrawal

3. **Signatures:**

   * If executing admin branch: sign with admin keys.
   * If executing deposit/bene branch: no admin signature required for the owner box recreation (it must validate under the deposit branch conditions only).

4. **Submission & verification:**

   * Submit the tx and verify on-chain that the owner box now contains the expected funds/tokens.

---

## Test checklist & Sample test cases (Testnet)

* **Basic donation:** send 1 ERG → verify owner box value increases and contribution token appears.
* **Contribution token minting:** if Bene mints tokens into owner box, verify token id present.
* **Admin withdrawal:** call admin withdrawal path with correct signature → verify funds move to admin wallet.
* **Rejection test (drain attempt):** craft a tx where recreated owner output has `value < SELF.value` → should be rejected.
* **Token loss attempt:** craft a tx where singleton NFT is missing from the recreated output → should be rejected.
* **Output ordering robustness:** ensure deposit works when recreated owner box appears in `OUTPUTS` at any index (not just `OUTPUTS(0)`).

---

## Security & Audit checklist

* Verify token presence checks don't rely on fixed index positions.
* Confirm your deposit branch cannot transfer ERG out while preserving script (i.e., check `out.value >= SELF.value`).
* Ensure register preservation for critical registers (campaign metadata, counters, etc.).
* Ensure admin branch is minimal-privilege and protected (rotate keys if necessary; prefer multisig/custody solutions for high-value campaigns).
* Verify gas/storage minimums are enforced and tested.
* Perform a time-windowed test where multiple concurrent donations happen to confirm deterministic handling of race conditions.

---

## Appendix: Frequently encountered pitfalls

1. **Relying on output index**: always scan `OUTPUTS` to find your owner-like box.
2. **Assuming tokens are ordered**: search by token id.
3. **Not accounting for storage rent**: low-value outputs can be left unspendable.
4. **Not auditing admin keys**: single-key admin is risky for high-value boxes.

---
