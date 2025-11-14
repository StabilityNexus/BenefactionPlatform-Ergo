import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
} from "./bene_contract_helpers";

// EXECUTION FLOW:
// Owner can withdraw unsold PFT tokens at any time

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Withdraw Unsold Tokens (%s)", (mode) => {
  let ctx: BeneTestContext; // Test environment

  // SETUP: Initialize test context
  beforeEach(() => {
    // Initialize test context with BASE_TOKEN (ERG or USD)
    ctx = setupBeneTestContext(mode.token, mode.tokenName);
  });

  describe("Withdraw Unsold Tokens", () => {
    let projectBox: Box; // Contract box

    let soldTokens: bigint

    beforeEach(() => {
      // STEP 1: Create project box with partial token sales
      soldTokens = ctx.totalPFTokens/2n; // Half of the PFTs has been sold.
      const collectedFunds = soldTokens * ctx.exchangeRate;

      let assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
      ];

      let value = RECOMMENDED_MIN_FEE_VALUE;

      // Handle collected funds based on mode
      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        // ERG Mode: Add funds to the box value
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: SInt(ctx.deadlineBlock).toHex(),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // [10k sold, 0, 0]
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
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log("\n🏦 WITHDRAW UNSOLD TOKENS:");
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
              { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // Counters unchanged
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });


      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1); // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      const updatedPft = updatedBox.assets.find((t) => t.tokenId === ctx.pftTokenId);
      expect(updatedPft?.amount).toEqual(remainingPFT); // Contract has 50k PFT remaining
    });

    it("should fail trying to avoid APTs", () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log("\n🏦 WITHDRAW UNSOLD TOKENS:");
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              // { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
              { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(), // Counters unchanged
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Verify withdrawal failed
      expect(result).toBe(false); // Transaction fails
    });

    it("should fail due to failed owner authentication", () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log("\n🏦 WITHDRAW UNSOLD TOKENS:");
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
              { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(), // Counters unchanged
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });  // Tries to sign another key


      expect(result).toBe(false);
    });
  });

  // describe("End contract considering that there are no base tokens and all PFTs are withdrawn", () => {});
});