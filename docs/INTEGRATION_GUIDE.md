# Guide for Integrating External Apps with Bene [in development]

This guide explains how external applications and smart contracts can interact with the **Bene** fundraising platform. Specifically, it details how to set a **Contract (Script)** as the owner of a Bene campaign, allowing for programmable fund management, DAOs, and automated workflows.

## Overview

In Bene, the "Project Owner" is defined by the `ownerErgoTree` stored in the first position of Register `R8`. This can be:
1.  **P2PK (Pay-to-Public-Key):** A standard user wallet address.
2.  **P2S (Pay-to-Script):** A smart contract address.

When the owner is a smart contract, it allows for advanced use cases where funds are collected directly into another protocol (e.g., a DAO treasury or a DeFi protocol) rather than a personal wallet.

## Owner Contract Requirements

To successfully act as a Bene Campaign Owner, your external contract must meet specific criteria to interact with Bene's "Owner Mode" operations (like withdrawing unsold tokens or adding stock).

### 1. Must be Spendable as an Input
Bene validates the owner's identity using the `ownerAuthentication` rule:
```scala
val signedByInput: SigmaProp = sigmaProp(INPUTS.exists({(box: Box) => box.propositionBytes == ownerErgoTree}))
```
This means your contract **must appear as an INPUT** in the transaction whenever it performs privileged actions (Withdraw Unsold Tokens, Add Stock).

### 2. Allow Self-Spending (or Specific Spending)
Since your contract must be an input, its guarding script (ErgoTree) must evaluate to `True` for the transaction to be valid. You typically need a branch in your contract logic that allows it to be "spent" (recreated or consumed) when interacting with Bene.

### 3. Singleton Design (Recommended)
For operations like `Withdraw Funds` (which sends raised funds *to* the owner address), Bene ensures the output goes to `ownerErgoTree`.
```scala
val ownerOutputs = OUTPUTS.filter({(box: Box) => box.propositionBytes == ownerErgoTree})
```
While the `Withdraw Funds` action can be triggered by any party (since sending funds to the owner is permissionless), designing your contract as a singleton (a unique, persistent box) simplifies the tracking of these incoming payments.

## Integration Steps

### Step 1: Compile Your Owner Contract
First, write and compile your external contract (e.g., a DAO treasury). Get its **ErgoTree Hex**.

### Step 2: Configure Bene Campaign
When deploying a Bene campaign, use your contract's ErgoTree Hex as the `owner` parameter.
*   **R8[0] (Owner):** `<Your_Contract_ErgoTree_Hex>` (The first element of the collection)

### Step 3: Handle Privileged Operations
To perform owner-only actions on Bene (e.g., `Withdraw Unsold Tokens`), your off-chain bot or frontend must construct a transaction that:
1.  Includes the **Bene Box** as an Input.
2.  Includes your **Owner Contract Box** as an Input.
3.  Outputs the updated Bene Box (replicated).
4.  Outputs your Owner Contract Box (recreated/spent as defined by your logic).

## Security & Examples

### Security Considerations
*   **Hijacking:** Ensure your contract logic prevents unauthorized spending. If your contract is an input, it needs to guard its own funds/tokens.
*   **Context Extension:** You might need to check `CONTEXT.dataInputs` or specific outputs to ensure the interaction with Bene is valid according to *your* contract's rules.

### Pseudocode Example (Owner Contract)

> **Note:** The following code is illustrative only. Do not use in production without a full security audit.

Here is a minimal concept of a contract that allows itself to be used as a signer for Bene:

```scala
{
  // ... your contract main logic ...

  // Branch to allow interaction with Bene
  val isBeneInteraction = {
    // Check that Bene is present in inputs (optional, depends on need)
    // Validate that this box is recreated correctly (don't lose funds!)
    val selfRecreated = OUTPUTS(0).propositionBytes == SELF.propositionBytes && OUTPUTS(0).value == SELF.value
    
    sigmaProp(selfRecreated)
  }

  isBeneInteraction || ... (other logic)
}
```
