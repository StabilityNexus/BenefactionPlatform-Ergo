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

  describe("Withdraw funds after minimum reached", () => {
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
      
      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds})
      }
      else {
        value += collectedFunds;
        collectedFunds = value;  // Must be divided considering SAFE_MIN_BOX_VALUE too.
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: SInt(ctx.deadlineBlock).toHex(),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
          R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
          R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should pass full withdraw", () => {

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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(true);

    });

    it("should pass partial withdraw", () => {

      const remainingAmount = collectedFunds/2n;      
      const devFeeAmount = (collectedFunds/2n * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds/2n - devFeeAmount;
      const devFeeContract = compile(`{ sigmaProp(true) }`);

      let remainingValue: bigint;
      let remainingAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;
      let projectValue: bigint;
      let projectAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;
      let devFeeValue: bigint;
      let devFeeAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;

      if (ctx.isErgMode) {
        remainingValue = remainingAmount;
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
        ];

        projectValue = projectAmount;
        projectAssets = [];

        devFeeValue = devFeeAmount;
        devFeeAssets = [];

      } else {
        remainingValue = SAFE_MIN_BOX_VALUE;
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
          { tokenId: ctx.baseTokenId, amount: remainingAmount}
        ];

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
          // Output 0: Self contract
           new OutputBuilder(remainingValue, ctx.beneErgoTree)
            .addTokens(remainingAssets)
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 2: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(true);

    });

    it("should fail if owner tries to get more funds", () => {

      const devFeeAmount = ((collectedFunds * BigInt(ctx.devFeePercentage)) / 100n) - 1n;
      const projectAmount = (collectedFunds - devFeeAmount);
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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(false);

    });

    it("should fail if dev tries to get more funds", () => {

      const devFeeAmount = ((collectedFunds * BigInt(ctx.devFeePercentage)) / 100n) + 1n;
      const projectAmount = (collectedFunds - devFeeAmount);
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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(false);

    });

    it("should fail if owner address is incorrect", () => {

      const devFeeAmount = ((collectedFunds * BigInt(ctx.devFeePercentage)) / 100n);
      const projectAmount = (collectedFunds - devFeeAmount);
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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, compile(`{ sigmaProp(HEIGHT == 1) }`)).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(false);

    });

    it("should fail if dev address is incorrect", () => {

      const devFeeAmount = ((collectedFunds * BigInt(ctx.devFeePercentage)) / 100n);
      const projectAmount = (collectedFunds - devFeeAmount);
      const devFeeContract = compile(`{ sigmaProp(HEIGHT == 1) }`);

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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should SUCCESS (minimum reached)
      expect(result).toBe(false);

    });
  });

  describe("Withdraw funds before minimum reached", () => {

    beforeEach(() => {

      // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM NOT REACHED (non-successful campaign)
      soldTokens = ctx.minimumTokensSold -1n;              // minimum not reached
      collectedFunds = soldTokens * ctx.exchangeRate; 

      let assets = [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          // { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },   There are no PFTs on contract.  All PFT were exchanged with their respectives APTs
        ];
      
      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds})
      }
      else {
        value += collectedFunds;
        collectedFunds = value;  // Must be divided considering SAFE_MIN_BOX_VALUE too.
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

    it("should fail full withdraw", () => {

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
          // Output 0: Owner tries to receive project funds
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 1: Dev fee contract
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // ASSERT: Transaction should FAIL (minimum not reached)
      expect(result).toBe(false);

    });
  });
});
