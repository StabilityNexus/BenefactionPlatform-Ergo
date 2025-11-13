import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, Amount, TokenAmount, TokensCollection, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext, USD_BASE_TOKEN, USD_BASE_TOKEN_NAME } from "./bene_contract_helpers";
import { OneOrMore } from "@fleet-sdk/common";

// EXECUTION FLOW:
// Owner can withdraw raised funds if minimum reached (split: project + dev fee)

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Withdraw funds (%s)", (mode) => {
  let ctx: BeneTestContext;  // Test environment
  let projectBox: Box;  // Contract box
  let soldTokens: bigint;
  let collectedFunds: bigint;


  describe("Full withdraw funds after minimum reached", () => {

    beforeEach(() => {

      // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM REACHED (successful campaign)
      soldTokens = ctx.minimumTokensSold;              // minimum reached
      collectedFunds = soldTokens * ctx.exchangeRate; 

      let assets = [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          // { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },   There are no PFTs on contract.  All PFT were exchanged with their respectives APTs
        ];
      
      let value = RECOMMENDED_MIN_FEE_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds})
      }
      else {
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
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
          R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should pass", () => {

      const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds - devFeeAmount;
      const devFeeContract = compile(`{ sigmaProp(true) }`);

      let projectValue: bigint;
      let projectAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;
      let devFeeValue: bigint;
      let devFeeAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;

      if (ctx.isErgMode) {
        projectValue = projectAmount;
        projectAssets = [];

        devFeeValue = devFeeAmount;
        devFeeAssets = [];

      } else {
        projectValue = SAFE_MIN_BOX_VALUE;
        projectAssets = [
          { tokenId: ctx.baseTokenId, amount: projectAmount }
        ];

        devFeeValue = SAFE_MIN_BOX_VALUE;
        devFeeAssets = [
          { tokenId: ctx.baseTokenId, amount: devFeeAmount }
        ];
      }

      // ACT: Try to withdraw funds even though minimum not reached
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          // Output 1: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 2: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute with throw: false to capture failure
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(true);

    });
  });

  /*
  describe("Full withdraw before minimum reached", () => {

    beforeEach(() => {
      // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM REACHED (successful campaign)
      const soldTokens = ctx.minimumTokensSold - 1n;          // Minimum not reached
      const collectedFunds = soldTokens * ctx.exchangeRate; 

      let assets = [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
        ];
      
      let value = RECOMMENDED_MIN_FEE_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds})
      }
      else {
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
          // TODO DEBERÍAMOS AGREGAR SIGUSD SI ERGMODE IS FALSE
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
  */

});
