// ===== TEST FILE: Withdraw Funds & Tokens =====
// Tests two types of withdrawals:
// 1. Withdraw Funds: Owner withdraws raised funds (only when minimum reached)
// 2. Withdraw Unsold Tokens: Owner withdraws unsold PFT tokens
// Verifies authorization, minimum threshold checks, and amount calculations

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext } from "./bene_contract_helpers";

// EXECUTION FLOW:
// Withdraw Funds: Owner can withdraw raised funds if minimum reached (split: project + dev fee)
// Withdraw Tokens: Owner can withdraw unsold PFT tokens at any time

describe("Bene Contract v1.2 - Withdraw", () => {
  let ctx: BeneTestContext;  // Test environment

  // SETUP: Initialize test context
  beforeEach(() => {
    // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);
  });

  describe("Withdraw Funds", () => {
    let projectBox: Box;  // Contract box

    // NESTED SETUP: Prepare for fund withdrawal tests
    beforeEach(() => {
      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM REACHED (successful campaign)
      const soldTokens = ctx.minimumTokensSold;              // 50,000 tokens sold
      const collectedFunds = soldTokens * ctx.exchangeRate;  // 50 ERG collected

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE + collectedFunds,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: SInt(ctx.deadlineBlock).toHex(),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
          R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });



    it("should fail to withdraw funds before minimum is reached", () => {
      // ARRANGE: Create scenario where minimum NOT reached (failed campaign)
      ctx.beneContract.utxos.clear();  // Clear existing box
      const soldTokens = ctx.minimumTokensSold / 2n;       // Only 25,000 sold (need 50,000)
      const collectedFunds = soldTokens * ctx.exchangeRate;  // Only 25 ERG collected

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE + collectedFunds,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: SInt(ctx.deadlineBlock).toHex(),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
          R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      const boxBelowMin = ctx.beneContract.utxos.toArray()[0];
      const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;  // 5% of 25 ERG = 1.25 ERG
      const projectAmount = collectedFunds - devFeeAmount;                          // 25 - 1.25 = 23.75 ERG
      const devFeeContract = compile(`{ sigmaProp(true) }`);  // Simple dev fee contract

      // ACT: Try to withdraw funds even though minimum not reached
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([boxBelowMin, ...ctx.projectOwner.utxos.toArray()])
        .to([
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: boxBelowMin.assets[0].amount },
              { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: boxBelowMin.additionalRegisters.R8,
              R9: boxBelowMin.additionalRegisters.R9,
            }),
          // Output 1: Owner tries to receive project funds
          new OutputBuilder(projectAmount, ctx.projectOwner.address),  // 23.75 ERG
          // Output 2: Dev fee contract
          new OutputBuilder(devFeeAmount, devFeeContract),  // 1.25 ERG
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute with throw: false to capture failure
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should FAIL (minimum not reached)
      expect(result).toBe(false);  // Contract rejects withdrawal when minimum not reached
    });
  });

  describe("Withdraw Unsold Tokens", () => {
    let projectBox: Box;  // Contract box


    beforeEach(() => {
      // STEP 1: Create project box with partial token sales
      const soldTokens = 10_000n;  // 10,000 tokens sold (90k unsold)

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE + soldTokens * ctx.exchangeRate,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: SInt(ctx.deadlineBlock).toHex(),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),                    // [10k sold, 0, 0]
          R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
          R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 2: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should allow withdrawing unsold PFT tokens", () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n;                           // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw;  // 50k will remain in contract

      console.log("\n🏦 WITHDRAW UNSOLD TOKENS:");
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])  // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)  // ERG value unchanged
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },  // APT unchanged
              { tokenId: ctx.pftTokenId, amount: remainingPFT },                   // PFT: 100k - 50k = 50k
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),                   // Counters unchanged
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },  // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      // ASSERT: Verify withdrawal succeeded
      expect(result).toBe(true);                          // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1);   // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      expect(updatedBox.assets[1].amount).toEqual(remainingPFT);  // Contract has 50k PFT remaining
    });

    it("should fail when trying to withdraw more than unsold tokens", () => {
      // ARRANGE: Try to withdraw MORE tokens than available 
      const tokensToWithdraw = 95_000n;  // Try to withdraw 95k (only 90k unsold!)

      // Fund owner for transaction
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });

      // ACT: Try to withdraw excessive tokens
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          // Contract tries to keep only 5k PFT (wrong!)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
              { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens - tokensToWithdraw },  // Only 5k left (WRONG!)
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),                    // 10k sold, so max 90k can be withdrawn
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Owner tries to receive 95k PFT (too much!)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },  // Wants 95k (greedy!)
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute with throw: false to capture failure
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should FAIL (trying to withdraw more than unsold)
      expect(result).toBe(false);  // Contract validates: can't withdraw more than (total - sold)
    });
  });
});
