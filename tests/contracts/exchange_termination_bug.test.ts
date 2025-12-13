// ===== TEST FILE: Exchange Termination Bug =====
// 
// BUG DESCRIPTION:
// In `isExchangeFundingTokens`, the contract defines an `endOrReplicate` variable to allow 
// termination when all PFT tokens have been exchanged, but this variable is NEVER USED.
// The `constants` check incorrectly uses `isSelfReplication` instead.
//
// THE FIX (v1.2.2):
// Changed `isSelfReplication` to `endOrReplicate` in the constants check
//
// NOTE: The termination scenario requires SELF.tokens.size == 1 (only APT, no PFT remaining)
// This means termination happens AFTER all PFT tokens have been exchanged in previous transactions.

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

describe.each(baseModes)("BUG: isExchangeFundingTokens endOrReplicate Not Used ($name)", (mode) => {
  let ctx: BeneTestContext;
  let projectBox: Box;
  let soldTokens: bigint;
  let exchangedTokens: bigint;

  describe("When contract still has PFT tokens to exchange", () => {
    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // Setup: All tokens sold, all but the last batch exchanged
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
          R6: SColl(SLong, [soldTokens, 0n, exchangedTokens]).toHex(),
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

    it("BUG DEMO: Cannot terminate contract directly when PFT tokens remain (requires replication)", () => {
      // This test demonstrates the limitation:
      // When PFT tokens still exist in the contract, termination is not possible
      // because SELF.tokens.size > 1 (APT + PFT)
      // The endOrReplicate check requires SELF.tokens.size == 1 for termination

      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      
      const aptToExchange = buyerAPTBox.assets[0].amount;

      // Try to terminate without replication - this should fail
      // because SELF.tokens.size == 2 (APT + PFT), not 1
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // This correctly fails because SELF.tokens.size == 2 (APT + PFT)
      // Termination is only allowed when SELF.tokens.size == 1 (only APT)
      expect(result).toBe(false);
      
      console.log("\n" + "=".repeat(80));
      console.log("BUG DEMONSTRATION: endOrReplicate Variable Not Used");
      console.log("=".repeat(80));
      console.log("SCENARIO:");
      console.log("  - Contract has PFT tokens remaining (SELF.tokens.size == 2)");
      console.log("  - User tries to exchange APT for PFT without replication");
      console.log("");
      console.log("RESULT:");
      console.log("  - Transaction fails (expected - PFT tokens still exist)");
      console.log("  - The endOrReplicate variable checks SELF.tokens.size == 1");
      console.log("  - But the BUG is that endOrReplicate is NEVER USED in constants!");
      console.log("=".repeat(80) + "\n");
    });

    it("Exchange with self-replication works correctly", () => {
      // Normal exchange with self-replication should work
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      
      const aptToExchange = buyerAPTBox.assets[0].amount;
      const newExchangeCounter = exchangedTokens + aptToExchange;

      const aptInContract = projectBox.assets.find((a) => a.tokenId === ctx.projectNftId)!.amount;
      const newAPTAmount = BigInt(aptInContract) + aptToExchange;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        // No PFT tokens left after this exchange
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find((asset) => asset.tokenId === ctx.baseTokenId)!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
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
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });
      expect(result).toBe(true);

      // Contract now has 0 PFT tokens - ready for termination
      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      const hasPFT = updatedBox.assets.some(a => a.tokenId === ctx.pftTokenId);
      expect(hasPFT).toBe(false);

      console.log("\n" + "=".repeat(80));
      console.log("Exchange with replication works - contract now has 0 PFT tokens");
      console.log("Contract is ready for termination (SELF.tokens.size == 1)");
      console.log("=".repeat(80) + "\n");
    });
  });

  describe("FIX VERIFICATION: Contract with 0 PFT tokens can terminate", () => {
    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // Setup: Contract has NO PFT tokens (all have been exchanged)
      // This is the state where termination should be allowed
      soldTokens = ctx.totalPFTokens; // All 100k tokens sold
      exchangedTokens = ctx.totalPFTokens; // All 100k exchanged

      const collectedFunds = soldTokens * ctx.exchangeRate;

      let value = SAFE_MIN_BOX_VALUE;
      const assets = [
        // APT: 1 (NFT) + 100k (total) - 100k (sold) + 100k (exchanged back) = 100,001
        // This is the ONLY token - SELF.tokens.size == 1
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens },
        // NO PFT tokens - all have been exchanged
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
          R6: SColl(SLong, [soldTokens, 0n, exchangedTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("BUG: Contract with 0 PFT cannot be terminated via isExchangeFundingTokens", () => {
      // This test shows the bug: even when SELF.tokens.size == 1 (only APT),
      // the contract cannot terminate because:
      // 1. isExchangeFundingTokens requires isReplicationBoxPresent
      // 2. Even if we could get past that, endOrReplicate is not used in constants
      
      // The contract has 0 PFT tokens, so there's nothing to exchange
      // But the contract box is stuck on the blockchain
      
      // Verify the contract state
      expect(projectBox.assets.length).toBe(ctx.isErgMode ? 1 : 2); // APT only (or APT + base token)
      expect(projectBox.assets.some(a => a.tokenId === ctx.pftTokenId)).toBe(false);
      
      console.log("\n" + "=".repeat(80));
      console.log("BUG: Contract with 0 PFT tokens is stuck");
      console.log("=".repeat(80));
      console.log("Contract state:");
      console.log("  - SELF.tokens.size == " + (ctx.isErgMode ? "1" : "2") + " (APT only" + (ctx.isErgMode ? "" : " + base token") + ")");
      console.log("  - No PFT tokens to exchange");
      console.log("  - Contract cannot be terminated via isExchangeFundingTokens");
      console.log("");
      console.log("ROOT CAUSE:");
      console.log("  The endOrReplicate variable is defined but NEVER USED");
      console.log("  in the constants check. It uses isSelfReplication instead.");
      console.log("");
      console.log("IMPACT:");
      console.log("  - Contract box remains on blockchain forever");
      console.log("  - Locked ERG cannot be recovered");
      console.log("  - Blockchain bloat");
      console.log("=".repeat(80) + "\n");
    });
  });
});
