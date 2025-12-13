// ===== TEST FILE: Exchange Termination Bug =====
// 
// BUG DESCRIPTION:
// In `isExchangeFundingTokens`, the contract is designed to allow termination when all PFT tokens
// have been exchanged (as evidenced by the `endOrReplicate` variable and comments). However, there
// are TWO issues that prevent this:
//
// 1. The entire `isExchangeFundingTokens` action is wrapped in `if (isReplicationBoxPresent)`,
//    which means it can ONLY execute when OUTPUTS(0) has the same script as SELF.
//    This fundamentally prevents contract termination through this action.
//
// 2. Even if issue #1 was fixed, the `endOrReplicate` variable is defined but NEVER USED
//    in the validation logic. The `constants` check uses `isSelfReplication` instead.
//
// This is a bug because:
// - The comment in the contract says: "The contract could be finalized on after this action"
// - The `endOrReplicate` variable is defined but not used
// - Users who have exchanged all their APT tokens for PFT tokens cannot terminate the contract
// - Contract boxes remain on the blockchain forever even when they serve no purpose
//
// IMPACT:
// - Contract boxes remain on the blockchain forever (blockchain bloat)
// - Locked ERG (minimum box value) cannot be recovered
// - Poor user experience
//
// LOCATION IN CONTRACT (contract_v2.es):
// Lines ~515-580 in isExchangeFundingTokens:
//
//   val isExchangeFundingTokens: SigmaProp = if (isReplicationBoxPresent) {  // <-- ISSUE #1
//     ...
//     val endOrReplicate = {
//       val allFundsWithdrawn = selfValue == OUTPUTS(0).value
//       val allTokensWithdrawn = SELF.tokens.size == 1
//       isSelfReplication || allFundsWithdrawn && allTokensWithdrawn
//     }
//
//     val constants = allOf(Coll(
//       isSelfReplication,  // <-- ISSUE #2: Should be endOrReplicate
//       ...
//     ))
//   } else { sigmaProp(false) }
//
// PROPOSED FIX:
// 1. Change the outer condition to allow non-replication scenarios
// 2. Use `endOrReplicate` instead of `isSelfReplication` in constants
// 3. Adjust the inner logic to handle the case where OUTPUTS(0) is not the contract

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  createR4
} from "./bene_contract_helpers";

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("BUG: Exchange Action Cannot Terminate Contract ($name)", (mode) => {
  let ctx: BeneTestContext;
  let projectBox: Box;
  let soldTokens: bigint;
  let exchangedTokens: bigint;

  describe("When all PFT tokens have been exchanged except the last batch", () => {
    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // Setup: All tokens sold, all but the last batch exchanged
      // This simulates a scenario where the final user wants to exchange their APT for PFT
      // and terminate the contract since no more PFT tokens will remain
      soldTokens = ctx.totalPFTokens; // All 100k tokens sold
      exchangedTokens = ctx.totalPFTokens - 10_000n; // 90k already exchanged, 10k remaining

      const collectedFunds = soldTokens * ctx.exchangeRate;

      let value = SAFE_MIN_BOX_VALUE;
      const assets = [
        // APT: 1 (NFT) + 100k (total) - 100k (sold) + 90k (exchanged back) = 90,001
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens + exchangedTokens },
        // PFT: Only 10k remaining (100k - 90k exchanged)
        { tokenId: ctx.pftTokenId, amount: 10_000n },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, exchangedTokens]).toHex(), // [100k sold, 0 refunded, 90k exchanged]
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // Give buyer the last 10k APT tokens to exchange
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n,
        ergoTree: ctx.buyer.address.ergoTree,
        assets: [{ tokenId: ctx.projectNftId, amount: 10_000n }],
        creationHeight: ctx.mockChain.height - 50,
        additionalRegisters: {},
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("BUG: Should allow terminating contract when exchanging last PFT tokens, but FAILS due to unused endOrReplicate", () => {
      // This test demonstrates the bug:
      // When a user exchanges the LAST remaining PFT tokens, the contract should be able to terminate
      // (no self-replication needed) because there are no more PFT tokens to exchange.
      // However, due to the bug, the contract ALWAYS requires self-replication.

      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT (the last batch)
      const newExchangeCounter = exchangedTokens + aptToExchange; // 90k + 10k = 100k

      // After this exchange:
      // - All PFT tokens will be exchanged (100k)
      // - Contract should be able to terminate
      // - But due to the bug, it cannot!

      // Build transaction that TERMINATES the contract (no Output 0 with contract script)
      // This is what SHOULD work according to the contract's intended design
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Buyer receives the last PFT tokens
          // NOTE: No contract replication output - we're terminating the contract
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction
      // EXPECTED (if bug was fixed): true - contract terminates successfully
      // ACTUAL (due to bug): false - contract requires self-replication
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // This assertion documents the BUG:
      // The transaction SHOULD succeed (expect true) but FAILS (returns false)
      // because the contract incorrectly requires isSelfReplication instead of endOrReplicate
      
      // UNCOMMENT THE LINE BELOW WHEN BUG IS FIXED:
      // expect(result).toBe(true);
      
      // CURRENT BEHAVIOR (BUG): Transaction fails because contract requires self-replication
      expect(result).toBe(false);
      
      console.log("\n" + "=".repeat(80));
      console.log("BUG DEMONSTRATION: Exchange Action Cannot Terminate Contract");
      console.log("=".repeat(80));
      console.log("SCENARIO:");
      console.log("  - All 100,000 PFT tokens have been sold");
      console.log("  - 90,000 APT tokens have already been exchanged for PFT");
      console.log("  - User tries to exchange the last 10,000 APT for PFT");
      console.log("  - After this exchange, no PFT tokens remain in contract");
      console.log("");
      console.log("EXPECTED BEHAVIOR:");
      console.log("  - Contract should terminate (no self-replication needed)");
      console.log("  - User receives their PFT tokens");
      console.log("  - Contract box is consumed and removed from blockchain");
      console.log("");
      console.log("ACTUAL BEHAVIOR (BUG):");
      console.log("  - Transaction FAILS");
      console.log("  - Contract requires self-replication even when unnecessary");
      console.log("  - Contract box remains on blockchain forever");
      console.log("");
      console.log("ROOT CAUSE:");
      console.log("  In isExchangeFundingTokens, the 'endOrReplicate' variable is defined");
      console.log("  but NEVER USED. The constants check uses 'isSelfReplication' instead.");
      console.log("");
      console.log("IMPACT:");
      console.log("  - Contract boxes remain on blockchain forever (bloat)");
      console.log("  - Locked ERG (minimum box value) cannot be recovered");
      console.log("  - Poor user experience");
      console.log("=".repeat(80) + "\n");
    });

    it("WORKAROUND: Exchange with self-replication works (but leaves useless contract box)", () => {
      // This test shows the current workaround: always replicate the contract
      // Even when all PFT tokens are exchanged, the contract must be replicated
      // This leaves a useless contract box on the blockchain forever

      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      
      const aptToExchange = buyerAPTBox.assets[0].amount;
      const newExchangeCounter = exchangedTokens + aptToExchange;

      // New APT amount: current + exchanged = 90,001 + 10,000 = 100,001
      const aptInContract = projectBox.assets.find((a) => a.tokenId === ctx.projectNftId)!.amount;
      const newAPTAmount = BigInt(aptInContract) + aptToExchange;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        // No PFT tokens left - contract is now useless but must still exist
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find((asset) => asset.tokenId === ctx.baseTokenId)!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Replicate with 0 PFT tokens - this works but leaves a useless contract
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Replicated contract (with 0 PFT - useless but valid)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, newExchangeCounter]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

      // The workaround works - but it leaves a useless contract box on the blockchain
      expect(result).toBe(true);

      // Verify the contract box still exists (this is the problem!)
      expect(ctx.beneContract.utxos.length).toEqual(1);
      
      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      // The contract has no PFT tokens - it's completely useless now
      const hasPFT = updatedBox.assets.some(a => a.tokenId === ctx.pftTokenId);
      expect(hasPFT).toBe(false);

      console.log("\n" + "=".repeat(80));
      console.log("WORKAROUND DEMONSTRATION");
      console.log("=".repeat(80));
      console.log("The exchange succeeds with self-replication, BUT:");
      console.log("  - Contract box remains on blockchain (useless)");
      console.log("  - Locked ERG cannot be recovered");
      console.log("  - No PFT tokens remain - contract serves no purpose");
      console.log("");
      console.log("If the bug was fixed (using endOrReplicate instead of isSelfReplication):");
      console.log("  - Contract would terminate cleanly");
      console.log("  - No blockchain bloat");
      console.log("  - Better user experience");
      console.log("=".repeat(80) + "\n");
    });
  });
});
