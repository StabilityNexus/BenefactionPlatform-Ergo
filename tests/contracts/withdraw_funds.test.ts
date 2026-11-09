import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, Amount, TokenAmount, TokensCollection, SAFE_MIN_BOX_VALUE, ErgoAddress, ErgoTree } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import * as fs from "fs";
import * as path from "path";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext, USD_BASE_TOKEN, USD_BASE_TOKEN_NAME, createR4 } from "./bene_contract_helpers";
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
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds })
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
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
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

      const remainingAmount = collectedFunds / 2n;
      const devFeeAmount = (collectedFunds / 2n * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds / 2n - devFeeAmount;
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
          { tokenId: ctx.baseTokenId, amount: remainingAmount }
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
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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

  describe("Withdraw funds after minimum reached. any PFT exchanged.", () => {
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
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
      ];

      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds })
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
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should pass partial withdraw", () => {

      const remainingAmount = collectedFunds / 2n;
      const devFeeAmount = (collectedFunds / 2n * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds / 2n - devFeeAmount;
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
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
        ];

        projectValue = projectAmount;
        projectAssets = [];

        devFeeValue = devFeeAmount;
        devFeeAssets = [];

      } else {
        remainingValue = SAFE_MIN_BOX_VALUE;
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
          { tokenId: ctx.baseTokenId, amount: remainingAmount } // In that case, base token is on index 2.
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
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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
  });

  describe("Withdraw funds after minimum reached. complex owner contract.", () => {
    let ownerContract: ErgoTree;

    beforeEach(() => {

      ownerContract = compile(`{ sigmaProp(false) }`);

      // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName, ownerContract.toAddress());

      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM REACHED (successful campaign)
      soldTokens = ctx.minimumTokensSold;              // minimum reached
      collectedFunds = soldTokens * ctx.exchangeRate;

      let assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
      ];

      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds })
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
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should pass partial withdraw", () => {

      const remainingAmount = collectedFunds / 2n;
      const devFeeAmount = (collectedFunds / 2n * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds / 2n - devFeeAmount;
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
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
        ];

        projectValue = projectAmount;
        projectAssets = [];

        devFeeValue = devFeeAmount;
        devFeeAssets = [];

      } else {
        remainingValue = SAFE_MIN_BOX_VALUE;
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },  // Any PFT exchanged
          { tokenId: ctx.baseTokenId, amount: remainingAmount } // In that case, base token is on index 2.
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
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner tries to receive project funds
          new OutputBuilder(projectValue, ownerContract).addTokens(projectAssets),
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
  });

  describe("Withdraw funds before minimum reached", () => {

    beforeEach(() => {

      // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Fund project owner with ERG for transaction fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });  // 10 ERG for fees

      // STEP 2: Create project box with MINIMUM NOT REACHED (non-successful campaign)
      soldTokens = ctx.minimumTokensSold - 1n;              // minimum not reached
      collectedFunds = soldTokens * ctx.exchangeRate;

      let assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        // { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },   There are no PFTs on contract.  All PFT were exchanged with their respectives APTs
      ];

      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds })
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
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
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

  describe("Withdraw funds security invariants", () => {
    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });

      soldTokens = ctx.minimumTokensSold;
      collectedFunds = soldTokens * ctx.exchangeRate;

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
      ];

      let value = SAFE_MIN_BOX_VALUE * 5n;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        value += collectedFunds;
        collectedFunds = value;
      }

      ctx.beneContract.addUTxOs({
        value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should fail when spending multiple contract boxes against a single owner/devFee payout", () => {
      const secondBoxAssets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
      ];
      if (!ctx.isErgMode) {
        secondBoxAssets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      }

      ctx.beneContract.addUTxOs({
        value: projectBox.value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: secondBoxAssets,
        creationHeight: ctx.mockChain.height - 90,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      const [box1, box2] = ctx.beneContract.utxos.toArray();
      const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds - devFeeAmount;
      const devFeeContract = compile(`{ sigmaProp(true) }`);

      const projectValue = ctx.isErgMode ? projectAmount : SAFE_MIN_BOX_VALUE;
      const projectAssets = ctx.isErgMode ? [] : [{ tokenId: ctx.baseTokenId, amount: projectAmount }];
      const devFeeValue = ctx.isErgMode ? devFeeAmount : SAFE_MIN_BOX_VALUE;
      const devFeeAssets = ctx.isErgMode ? [] : [{ tokenId: ctx.baseTokenId, amount: devFeeAmount }];
      const extraOutput = ctx.isErgMode
        ? new OutputBuilder(collectedFunds - SAFE_MIN_BOX_VALUE - RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address)
        : new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.baseTokenId, amount: collectedFunds },
          ]);

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([box1, box2])
        .to([
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
          extraOutput,
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { throw: false });
      expect(result).toBe(false);
    });

    it("should fail when extractedBaseAmount is zero during withdrawal", () => {
      if (ctx.isErgMode) return;
      const devFeeContract = compile(`{ sigmaProp(true) }`);
      const remainingAssets = [
        { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
        { tokenId: ctx.baseTokenId, amount: collectedFunds },
      ];

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])
        .to([
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens(remainingAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.projectOwner.address),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, devFeeContract),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
      expect(result).toBe(false);
    });

    it("should fail when ERG value of the contract box is reduced during non-ERG token partial withdrawal", () => {
      if (ctx.isErgMode) return;
      const remainingTokens = collectedFunds / 2n;
      const extractedTokens = collectedFunds - remainingTokens;
      const devFeeAmount = (extractedTokens * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = extractedTokens - devFeeAmount;
      const devFeeContract = compile(`{ sigmaProp(true) }`);

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])
        .to([
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
              { tokenId: ctx.baseTokenId, amount: remainingTokens },
            ])
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.baseTokenId, amount: projectAmount },
          ]),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, devFeeContract).addTokens([
            { tokenId: ctx.baseTokenId, amount: devFeeAmount },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
      expect(result).toBe(false);
    });

    it("should enforce dev_fee.es token/ERG distribution and reject token theft or double-satisfaction", () => {
      const devFeeSource = fs
        .readFileSync(path.resolve(__dirname, "../../contracts/dev_fee_contract/dev_fee.es"), "utf-8")
        .replace(/`\+bruno\+`/g, ctx.projectOwner.address.toString())
        .replace(/`\+lgd\+`/g, ctx.buyer.address.toString())
        .replace(/`\+jm\+`/g, ctx.projectOwner.address.toString())
        .replace(/`\+order\+`/g, ctx.buyer.address.toString());
      const realDevFeeTree = compile(devFeeSource, { version: 1 });
      const devFeeParty = ctx.mockChain.addParty(realDevFeeTree.toHex(), "DevFeeContract");

      if (!ctx.isErgMode) {
        const feeTokens = 100_000n;
        const tokenIdBytes = Uint8Array.from(Buffer.from(ctx.baseTokenId, "hex"));
        devFeeParty.addUTxOs({
          value: SAFE_MIN_BOX_VALUE * 2n,
          ergoTree: realDevFeeTree.toHex(),
          assets: [{ tokenId: ctx.baseTokenId, amount: feeTokens }],
          creationHeight: ctx.mockChain.height - 20,
          additionalRegisters: {
            R4: SColl(SByte, tokenIdBytes).toHex(),
          },
        });
        const feeBoxWithR4 = devFeeParty.utxos.toArray()[0];

        // Attack 1: Put 0 tokens in OUTPUTS(0..3) and steal 100% of devFee tokens in OUTPUTS(4)
        const stealWithR4Tx = new TransactionBuilder(ctx.mockChain.height)
          .from([feeBoxWithR4, ...ctx.buyer.utxos.toArray()])
          .to([
            new OutputBuilder(1_500_000n, ctx.projectOwner.address),
            new OutputBuilder(1_500_000n, ctx.buyer.address),
            new OutputBuilder(1_500_000n, ctx.projectOwner.address),
            new OutputBuilder(1_500_000n, ctx.buyer.address),
            new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.buyer.address).addTokens([
              { tokenId: ctx.baseTokenId, amount: feeTokens },
            ]),
          ])
          .sendChangeTo(ctx.buyer.address)
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const stealWithR4Result = ctx.mockChain.execute(stealWithR4Tx, {
          signers: [ctx.buyer],
          throw: false,
        });
        expect(stealWithR4Result).toBe(false);

        // Attack 2: Omit R4 on token devFee box and steal 100% of tokens (satisfy ERG distribution with exact 5,000,000 nanoERG box and exact miner fee input so no change output is created)
        ctx.buyer.utxos.clear();
        ctx.buyer.addUTxOs({
          value: SAFE_MIN_BOX_VALUE + RECOMMENDED_MIN_FEE_VALUE,
          ergoTree: ctx.buyer.address.ergoTree,
          assets: [],
          creationHeight: ctx.mockChain.height - 5,
          additionalRegisters: {},
        });
        const exactBuyerBox = ctx.buyer.utxos.toArray()[0];

        devFeeParty.addUTxOs({
          value: 5_000_000n,
          ergoTree: realDevFeeTree.toHex(),
          assets: [{ tokenId: ctx.baseTokenId, amount: feeTokens }],
          creationHeight: ctx.mockChain.height - 10,
          additionalRegisters: {},
        });
        const feeBoxNoR4 = devFeeParty.utxos.toArray()[1];
        const totalOutErg = 5_000_000n + SAFE_MIN_BOX_VALUE; // 6,000,000 nanoERG across OUTPUTS(0..3)
        const stealNoR4Tx = new TransactionBuilder(ctx.mockChain.height)
          .from([feeBoxNoR4, exactBuyerBox])
          .to([
            new OutputBuilder((totalOutErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((totalOutErg * 32n) / 100n, ctx.buyer.address),
            new OutputBuilder((totalOutErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((totalOutErg * 4n) / 100n, ctx.buyer.address).addTokens([
              { tokenId: ctx.baseTokenId, amount: feeTokens },
            ]),
          ])
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const stealNoR4Result = ctx.mockChain.execute(stealNoR4Tx, {
          signers: [ctx.buyer],
          throw: false,
        });
        expect(stealNoR4Result).toBe(false);

        // Attack 3: Set R4 to a mismatched tokenId on a token devFee box so getDistributionAmount(SELF) == 0
        const fakeTokenBytes = Uint8Array.from(Buffer.from(ctx.pftTokenId, "hex"));
        devFeeParty.addUTxOs({
          value: SAFE_MIN_BOX_VALUE * 2n,
          ergoTree: realDevFeeTree.toHex(),
          assets: [{ tokenId: ctx.baseTokenId, amount: feeTokens }],
          creationHeight: ctx.mockChain.height - 5,
          additionalRegisters: {
            R4: SColl(SByte, fakeTokenBytes).toHex(),
          },
        });
        const feeBoxFakeR4 = devFeeParty.utxos.toArray()[2];
        const stealFakeR4Tx = new TransactionBuilder(ctx.mockChain.height)
          .from([feeBoxFakeR4, ...ctx.buyer.utxos.toArray()])
          .to([
            new OutputBuilder(1_500_000n, ctx.projectOwner.address),
            new OutputBuilder(1_500_000n, ctx.buyer.address),
            new OutputBuilder(1_500_000n, ctx.projectOwner.address),
            new OutputBuilder(1_500_000n, ctx.buyer.address),
            new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.buyer.address).addTokens([
              { tokenId: ctx.baseTokenId, amount: feeTokens },
            ]),
          ])
          .sendChangeTo(ctx.buyer.address)
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const stealFakeR4Result = ctx.mockChain.execute(stealFakeR4Tx, {
          signers: [ctx.buyer],
          throw: false,
        });
        expect(stealFakeR4Result).toBe(false);
      } else {
        const feeErg = 10_000_000_000n;
        devFeeParty.addUTxOs({
          value: feeErg,
          ergoTree: realDevFeeTree.toHex(),
          assets: [],
          creationHeight: ctx.mockChain.height - 20,
          additionalRegisters: {},
        });
        devFeeParty.addUTxOs({
          value: feeErg,
          ergoTree: realDevFeeTree.toHex(),
          assets: [],
          creationHeight: ctx.mockChain.height - 15,
          additionalRegisters: {},
        });
        const [feeBox1, feeBox2] = devFeeParty.utxos.toArray();

        // Double-satisfaction: spend two ERG devFee boxes while paying only one box's share
        const doubleSpendFeeTx = new TransactionBuilder(ctx.mockChain.height)
          .from([feeBox1, feeBox2])
          .to([
            new OutputBuilder((feeErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((feeErg * 32n) / 100n, ctx.buyer.address),
            new OutputBuilder((feeErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((feeErg * 4n) / 100n, ctx.buyer.address),
            new OutputBuilder(feeErg - RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address),
          ])
          .sendChangeTo(ctx.buyer.address)
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const doubleSpendResult = ctx.mockChain.execute(doubleSpendFeeTx, { throw: false });
        expect(doubleSpendResult).toBe(false);

        // Legitimate ERG fee distribution (executor pays exact miner fee so no change output inflates OUTPUTS sum) must succeed
        ctx.buyer.utxos.clear();
        ctx.buyer.addUTxOs({
          value: RECOMMENDED_MIN_FEE_VALUE,
          ergoTree: ctx.buyer.address.ergoTree,
          assets: [],
          creationHeight: ctx.mockChain.height - 5,
          additionalRegisters: {},
        });
        const exactFeeInput = ctx.buyer.utxos.toArray()[0];

        const legitFeeTx = new TransactionBuilder(ctx.mockChain.height)
          .from([feeBox1, exactFeeInput])
          .to([
            new OutputBuilder((feeErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((feeErg * 32n) / 100n, ctx.buyer.address),
            new OutputBuilder((feeErg * 32n) / 100n, ctx.projectOwner.address),
            new OutputBuilder((feeErg * 4n) / 100n, ctx.buyer.address),
          ])
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const legitResult = ctx.mockChain.execute(legitFeeTx, {
          signers: [ctx.buyer],
          throw: false,
        });
        expect(legitResult).toBe(true);
      }
    });

    it("should fail when bypassing devFee via dust-chunked withdrawal (devFeeAmount == 0) or draining ERG on full token-mode withdrawal", () => {
      const devFeeContract = compile(`{ sigmaProp(true) }`);
      const dustExtract = 19n;
      const remainingBase = collectedFunds - dustExtract;

      let replicatedValue: bigint;
      let replicatedAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;
      let ownerValue: bigint;
      let ownerAssets: OneOrMore<TokenAmount<Amount>> | TokensCollection;
      let devValue: bigint;

      if (ctx.isErgMode) {
        replicatedValue = remainingBase;
        replicatedAssets = [{ tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens }];
        ownerValue = SAFE_MIN_BOX_VALUE;
        ownerAssets = [];
        devValue = SAFE_MIN_BOX_VALUE;
      } else {
        replicatedValue = BigInt(projectBox.value);
        replicatedAssets = [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
          { tokenId: ctx.baseTokenId, amount: remainingBase },
        ];
        ownerValue = SAFE_MIN_BOX_VALUE;
        ownerAssets = [{ tokenId: ctx.baseTokenId, amount: dustExtract }];
        devValue = SAFE_MIN_BOX_VALUE;
      }

      const dustWithdrawTx = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          new OutputBuilder(replicatedValue, ctx.beneErgoTree)
            .addTokens(replicatedAssets)
            .setAdditionalRegisters({ ...projectBox.additionalRegisters }),
          new OutputBuilder(ownerValue, ctx.projectOwner.address).addTokens(ownerAssets),
          new OutputBuilder(devValue, devFeeContract),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const dustResult = ctx.mockChain.execute(dustWithdrawTx, {
        signers: [ctx.projectOwner],
        throw: false,
      });
      expect(dustResult).toBe(false);

      if (!ctx.isErgMode) {
        const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;
        const projectAmount = collectedFunds - devFeeAmount;

        const drainErgFullWithdrawTx = new TransactionBuilder(ctx.mockChain.height)
          .from([projectBox, ...ctx.buyer.utxos.toArray()])
          .to([
            new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.projectOwner.address).addTokens([
              { tokenId: ctx.baseTokenId, amount: projectAmount },
            ]),
            new OutputBuilder(SAFE_MIN_BOX_VALUE, devFeeContract).addTokens([
              { tokenId: ctx.baseTokenId, amount: devFeeAmount },
            ]),
          ])
          .sendChangeTo(ctx.buyer.address)
          .payFee(RECOMMENDED_MIN_FEE_VALUE)
          .build();

        const drainResult = ctx.mockChain.execute(drainErgFullWithdrawTx, {
          signers: [ctx.buyer],
          throw: false,
        });
        expect(drainResult).toBe(false);
      }
    });

    it("should fail when poisoning devFeeOutput with foreign R4/tokens or resurrecting a terminated contract at OUTPUTS(2)", () => {
      const devFeeContract = compile(`{ sigmaProp(true) }`);
      const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = collectedFunds - devFeeAmount;
      const fakeR4Bytes = Uint8Array.from(Buffer.from(ctx.pftTokenId, "hex"));

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
        projectValue = BigInt(projectBox.value);
        projectAssets = [{ tokenId: ctx.baseTokenId, amount: projectAmount }];
        devFeeValue = SAFE_MIN_BOX_VALUE;
        devFeeAssets = [{ tokenId: ctx.baseTokenId, amount: devFeeAmount }];
      }

      // Attack 1: Poison devFeeOutput with fake R4 so dev_fee.es later misidentifies the distribution token
      const poisonedDevFeeTx = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          new OutputBuilder(devFeeValue, devFeeContract)
            .addTokens(devFeeAssets)
            .setAdditionalRegisters({
              R4: SColl(SByte, fakeR4Bytes).toHex(),
            }),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const poisonedResult = ctx.mockChain.execute(poisonedDevFeeTx, {
        signers: [ctx.projectOwner],
        throw: false,
      });
      expect(poisonedResult).toBe(false);

      // Attack 2: Full withdrawal at OUTPUTS(0..1) while resurrecting a forged contract box at OUTPUTS(2)
      const resurrectContractTx = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
            .addTokens([{ tokenId: ctx.projectNftId, amount: 1n }])
            .setAdditionalRegisters({
              ...projectBox.additionalRegisters,
              R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
            }),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const resurrectResult = ctx.mockChain.execute(resurrectContractTx, {
        signers: [ctx.projectOwner],
        throw: false,
      });
      expect(resurrectResult).toBe(false);
    });
  });
});
