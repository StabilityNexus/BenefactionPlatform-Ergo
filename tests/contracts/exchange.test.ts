// ===== TEST FILE: Exchange APT → PFT =====
// Tests the token exchange where users convert APT back to PFT (1:1 ratio)
// This is only allowed AFTER the minimum funding threshold is reached
// Verifies exchange counter updates and token conservation

import { describe, it, expect, beforeEach } from 'vitest';
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from '@fleet-sdk/core';
import { SByte, SColl, SLong } from '@fleet-sdk/serializer';
import { stringToBytes } from '@scure/base';
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  createR4,
} from './bene_contract_helpers';

// EXECUTION FLOW:
// 1. beforeEach() → Creates blockchain + project box with MINIMUM REACHED (50k tokens sold)
// 2. Give buyer 10k APT tokens to exchange
// 3. Test builds transaction: Buyer returns APT → Contract gives PFT (1:1)
// 4. Contract validates minimum is reached and exchange ratio is correct

const baseModes = [
  { name: 'USD Token Mode', token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: 'ERG Mode', token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)('Bene Contract v1.2 - Exchange APT → PFT (%s)', (mode) => {
  let ctx: BeneTestContext; // Test environment

  describe('Still any APT exchanged', () => {
    let projectBox: Box; // Contract box
    let soldTokens: bigint;

    beforeEach(() => {
      // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 2: Create project box with MINIMUM FUNDING REACHED
      // IMPORTANT: Exchange only works when sold >= minimumTokensSold
      soldTokens = ctx.minimumTokensSold; // 50,000 tokens sold = minimum reached!
      const collectedFunds = soldTokens * ctx.exchangeRate;

      let value = RECOMMENDED_MIN_FEE_VALUE;
      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens }, // APT: 1 + 100k - 50k = 50,001 remaining
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT: 100,000 still available to be exchanged
      ];

      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds }); // 50K USD raised
      } else {
        value += collectedFunds; // 1.1M + 50K nanoERG raised
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100, // Created 100 blocks ago
        additionalRegisters: {
          R4: createR4(ctx), // Deadline
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum: 50k
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // [50k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // [price, token_len]
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 3: Give buyer APT tokens to exchange (simulating previous purchase)
      const aptToExchange = 10_000n;
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n, // 10 ERG for transaction fees
        ergoTree: ctx.buyer.address.ergoTree, // Buyer's address
        assets: [{ tokenId: ctx.projectNftId, amount: aptToExchange }], // Buyer has 10,000 APT to exchange
        creationHeight: ctx.mockChain.height - 50, // Acquired 50 blocks ago
        additionalRegisters: {},
      });

      // STEP 4: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow exchanging APT tokens for PFT tokens', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      const currentExchangeCounter = 0n; // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + aptToExchange; // Increment to 10,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange; // Contract loses: 100k - 10k = 90k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 90,000 PFT (lost 10k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, newExchangeCounter]).toHex(), // [50k, 0, 10k] - exchange counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

      // ASSERT: Verify exchange succeeded
      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1); // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      expect(updatedBox.assets[0].amount).toEqual(newAPTAmount); // Contract has 60,001 APT
      expect(updatedBox.assets[1].amount).toEqual(newPFTAmount); // Contract has 90,000 PFT

      // Verify buyer received PFT tokens
      const buyerPFTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId));
      expect(buyerPFTBox).toBeDefined(); // Buyer has PFT box
      expect(buyerPFTBox!.assets[0].amount).toEqual(aptToExchange); // Buyer got 10,000 PFT
    });

    it('should fail when exchange ratio is incorrect', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      const pftToExtract = aptToExchange * 2n; // Try to get 20,000 PFT (should be 1:1)

      const currentExchangeCounter = 0n; // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + pftToExtract; // Increment to 20,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - pftToExtract; // Contract loses: 100k - 20k = 80k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 80,000 PFT (lost 20k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, newExchangeCounter]).toHex(), // [50k, 0, 20k] - exchange counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: pftToExtract }, // Buyer gets 20,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });

    it('should fail when tries to avoid increment exchange counter', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange; // Contract loses: 100k - 10k = 90k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 90,000 PFT (lost 10k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // [50k, 0, 0n] - any counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });

    it('should fail when tries to modify refund counter', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      const currentExchangeCounter = 0n; // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + aptToExchange; // Increment to 10,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange; // Contract loses: 100k - 10k = 90k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 90,000 PFT (lost 10k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 1n, newExchangeCounter]).toHex(), // [50k, 1, 10k] - exchange counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });
  });

  describe('Minimum not raised', () => {
    let projectBox: Box; // Contract box
    let soldTokens: bigint;

    beforeEach(() => {
      // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 2: Create project box with MINIMUM FUNDING REACHED
      // IMPORTANT: Exchange only works when sold >= minimumTokensSold
      soldTokens = ctx.minimumTokensSold - 1n; // 49,000 tokens sold = minimum NOT reached!
      const collectedFunds = soldTokens * ctx.exchangeRate;

      let value = RECOMMENDED_MIN_FEE_VALUE;
      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens }, // APT: 1 + 100k - 49k = 50,000 remaining
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT: 100,000 still available to be exchanged
      ];

      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds }); // 49K USD raised
      } else {
        value += collectedFunds; // 1.1M + 49K nanoERG raised
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100, // Created 100 blocks ago
        additionalRegisters: {
          R4: createR4(ctx), // Deadline
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum: 50k
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // [49k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // [price, token_len]
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 3: Give buyer APT tokens to exchange (simulating previous purchase)
      const aptToExchange = 10_000n;
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n, // 10 ERG for transaction fees
        ergoTree: ctx.buyer.address.ergoTree, // Buyer's address
        assets: [{ tokenId: ctx.projectNftId, amount: aptToExchange }], // Buyer has 10,000 APT to exchange
        creationHeight: ctx.mockChain.height - 50, // Acquired 50 blocks ago
        additionalRegisters: {},
      });

      // STEP 4: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should not allow exchanging APT tokens for PFT tokens', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      const currentExchangeCounter = 0n; // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + aptToExchange; // Increment to 10,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange; // Contract loses: 100k - 10k = 90k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 90,000 PFT (lost 10k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, newExchangeCounter]).toHex(), // [49k, 0, 10k] - exchange counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // ASSERT: Verify exchange succeeded
      expect(result).toBe(false);
    });
  });

  describe('Minimum was raised, but actually not', () => {
    let projectBox: Box; // Contract box
    let soldTokens: bigint;
    let refundTokens: bigint;

    beforeEach(() => {
      // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 2: Create project box with MINIMUM FUNDING REACHED
      // IMPORTANT: Exchange only works when sold >= minimumTokensSold
      soldTokens = ctx.minimumTokensSold; // 50,000 tokens sold = minimum reached!
      refundTokens = 1n;
      const netSoldTokens = soldTokens - refundTokens;

      const collectedFunds = netSoldTokens * ctx.exchangeRate;

      let value = RECOMMENDED_MIN_FEE_VALUE;
      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - netSoldTokens }, // APT: 1 + 100k - 49k
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT: 100,000 still available to be exchanged
      ];

      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds }); // 50K USD raised
      } else {
        value += collectedFunds; // 1.1M + 50K nanoERG raised
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100, // Created 100 blocks ago
        additionalRegisters: {
          R4: createR4(ctx), // Deadline
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum: 50k
          R6: SColl(SLong, [soldTokens, refundTokens, 0n]).toHex(), // [50k sold, 1 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // [price, token_len]
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 3: Give buyer APT tokens to exchange (simulating previous purchase)
      const aptToExchange = 10_000n;
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n, // 10 ERG for transaction fees
        ergoTree: ctx.buyer.address.ergoTree, // Buyer's address
        assets: [{ tokenId: ctx.projectNftId, amount: aptToExchange }], // Buyer has 10,000 APT to exchange
        creationHeight: ctx.mockChain.height - 50, // Acquired 50 blocks ago
        additionalRegisters: {},
      });

      // STEP 4: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow exchanging APT tokens for PFT tokens', () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount; // 10,000 APT to exchange

      const currentExchangeCounter = 0n; // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + aptToExchange; // Increment to 10,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange; // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange; // Contract loses: 100k - 10k = 90k PFT

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount }, // 60,001 APT (gained 10k)
        { tokenId: ctx.pftTokenId, amount: newPFTAmount }, // 90,000 PFT (lost 10k)
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
        contractAssets.push({ tokenId: ctx.baseTokenId, amount: BigInt(currentBaseTokenAmount) });
      }

      // Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree) // ERG value unchanged
            .addTokens(contractAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, refundTokens, newExchangeCounter]).toHex(), // [50k, 1, 10k] - exchange counter updated
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange }, // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address) // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false); // Transaction failed
    });
  });

  describe('Some APT exchanged', () => {
    let projectBox: Box;
    let soldTokens: bigint;
    let alreadyExchanged: bigint;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      soldTokens = ctx.minimumTokensSold;
      alreadyExchanged = 5_000n;
      const collectedFunds = soldTokens * ctx.exchangeRate;

      let value = RECOMMENDED_MIN_FEE_VALUE;
      const assets = [
        {
          tokenId: ctx.projectNftId,
          amount: 1n + ctx.totalPFTokens - soldTokens + alreadyExchanged,
        },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens - alreadyExchanged },
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
          R6: SColl(SLong, [soldTokens, 0n, alreadyExchanged]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      const aptToExchange = 10_000n;
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n,
        ergoTree: ctx.buyer.address.ergoTree,
        assets: [{ tokenId: ctx.projectNftId, amount: aptToExchange }],
        creationHeight: ctx.mockChain.height - 50,
        additionalRegisters: {},
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow exchanging APT tokens for PFT tokens', () => {
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;

      const currentExchangeCounter = alreadyExchanged;
      const newExchangeCounter = currentExchangeCounter + aptToExchange;

      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: newPFTAmount },
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
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
      expect(ctx.beneContract.utxos.length).toEqual(1);

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      expect(updatedBox.assets[0].amount).toEqual(newAPTAmount);
      expect(updatedBox.assets[1].amount).toEqual(newPFTAmount);

      const buyerPFTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId));
      expect(buyerPFTBox).toBeDefined();
      expect(buyerPFTBox!.assets[0].amount).toEqual(aptToExchange);
    });

    it('should fail when exchange ratio is incorrect', () => {
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;
      const pftToExtract = aptToExchange * 2n;

      const currentExchangeCounter = alreadyExchanged;
      const newExchangeCounter = currentExchangeCounter + pftToExtract;

      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - pftToExtract;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: newPFTAmount },
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
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
            { tokenId: ctx.pftTokenId, amount: pftToExtract },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });

    it('should fail when tries to avoid increment exchange counter', () => {
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;

      const newExchangeCounter = alreadyExchanged;

      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: newPFTAmount },
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
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

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });

    it('should fail when tries to modify refund counter', () => {
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;

      const currentExchangeCounter = alreadyExchanged;
      const newExchangeCounter = currentExchangeCounter + aptToExchange;

      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange;

      const contractAssets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: newPFTAmount },
      ];

      if (!ctx.isErgMode) {
        const currentBaseTokenAmount = projectBox.assets.find(
          (asset) => asset.tokenId === ctx.baseTokenId
        )!.amount;
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
              R6: SColl(SLong, [soldTokens, 1n, newExchangeCounter]).toHex(),
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

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false);
    });
  });
});
