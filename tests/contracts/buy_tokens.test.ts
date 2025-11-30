// ===== TEST FILE: Buy APT Tokens =====
// Tests the token purchase flow where users buy APT tokens with ERG (or custom tokens)
// Verifies payment validation, token distribution, and counter updates

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  createR4,
} from "./bene_contract_helpers";

// EXECUTION FLOW:
// 1. beforeEach() → Creates fresh blockchain + initial project box with 100k APT tokens
// 2. Test builds transaction: Buyer pays ERG → Contract gives APT tokens
// 3. mockChain.execute() validates the transaction against contract rules
// 4. Assertions verify payment received and tokens distributed

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Buy APT Tokens (%s)", (mode) => {
  describe("Initial scenario with any sold tokens", () => {
    let ctx: BeneTestContext; // Test environment (blockchain, actors, config)
    let projectBox: Box; // The contract's UTXO holding tokens and funds

    beforeEach(() => {
      // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 2: Create initial project box with all tokens available for sale
      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE, // Minimum ERG in contract
        ergoTree: ctx.beneErgoTree.toHex(), // Contract script
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens }, // APT: 1 NFT + 100k tokens = 100,001 total
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT: 100,000 tokens
          // { tokenId: ctx.baseTokenId, amount: 0n },                    // SigmaUSD (starts empty) - (All token values should be > 0)
        ],
        creationHeight: ctx.mockChain.height,
        additionalRegisters: {
          R4: createR4(ctx), // Deadline block
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum: 50k tokens
          R6: SColl(SLong, [0n, 0n, 0n]).toHex(), // Counters: [0 sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // [price: 1M, token_len: 0]
          R8: ctx.constants.toHex(), // Owner details (empty)
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(), // Metadata (empty)
        },
      });

      // STEP 3: Get reference to the created project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should allow buying APT tokens", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n; // Buyer wants 10,000 APT
      const paymentAmount = tokensToBuy * ctx.exchangeRate; // Cost: 10,000 * 1M = 10 ERG
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      let value = BigInt(projectBox.value);
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount }); // In custom token mode, contract receives payment tokens
      } else {
        value += paymentAmount; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        value,
        ctx.beneErgoTree // Same contract address
      )
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4, // Deadline (unchanged)
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum (unchanged)
          R6: SColl(SLong, [tokensToBuy, 0n, 0n]).toHex(), // Counters: [10k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // Price (unchanged)
          R8: projectBox.additionalRegisters.R8, // Owner details (unchanged)
          R9: projectBox.additionalRegisters.R9, // Metadata (unchanged)
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer gets 10,000 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address) // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

      // ASSERT: Verify transaction succeeded
      expect(result).toBe(true); // Transaction valid
    });

    it("should fail when payment is insufficient for token amount", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n; // Buyer wants 10,000 APT
      const insufficientPayment = (tokensToBuy * ctx.exchangeRate) / 2n; // Cost: 10,000 * 1M / 2 = 5 ERG (INSUFFICIENT)
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      let value = BigInt(projectBox.value);
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: insufficientPayment }); // In custom token mode, contract receives payment tokens
      } else {
        value += insufficientPayment; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        value,
        ctx.beneErgoTree // Same contract address
      )
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4, // Deadline (unchanged)
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum (unchanged)
          R6: SColl(SLong, [tokensToBuy, 0n, 0n]).toHex(), // Counters: [10k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // Price (unchanged)
          R8: projectBox.additionalRegisters.R8, // Owner details (unchanged)
          R9: projectBox.additionalRegisters.R9, // Metadata (unchanged)
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer gets 10,000 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address) // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false); // Transaction invalid
    });

    it("should fail when sold counter is not correct", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n; // Buyer wants 10,000 APT
      const paymentAmount = tokensToBuy * ctx.exchangeRate; // Cost: 10,000 * 1M / 2 =  10 ERG (CORRECT)
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      let value = BigInt(projectBox.value);
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount }); // In custom token mode, contract receives payment tokens
      } else {
        value += paymentAmount; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        value,
        ctx.beneErgoTree // Same contract address
      )
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4, // Deadline (unchanged)
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum (unchanged)
          R6: SColl(SLong, [tokensToBuy / 2n, 0n, 0n]).toHex(), // Counters: [10k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // Price (unchanged)
          R8: projectBox.additionalRegisters.R8, // Owner details (unchanged)
          R9: projectBox.additionalRegisters.R9, // Metadata (unchanged)
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer gets 10,000 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address) // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false); // Transaction invalid
    });

    it("should fail when refunded counter is not correct", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n; // Buyer wants 10,000 APT
      const paymentAmount = tokensToBuy * ctx.exchangeRate; // Cost: 10,000 * 1M / 2 =  10 ERG (CORRECT)
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      let value = BigInt(projectBox.value);
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount }); // In custom token mode, contract receives payment tokens
      } else {
        value += paymentAmount; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        value,
        ctx.beneErgoTree // Same contract address
      )
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4, // Deadline (unchanged)
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum (unchanged)
          R6: SColl(SLong, [tokensToBuy, 1n, 0n]).toHex(), // Counters: [10k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // Price (unchanged)
          R8: projectBox.additionalRegisters.R8, // Owner details (unchanged)
          R9: projectBox.additionalRegisters.R9, // Metadata (unchanged)
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer gets 10,000 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address) // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false); // Transaction invalid
    });

    it("should fail when exchanged counter is not correct", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n; // Buyer wants 10,000 APT
      const paymentAmount = tokensToBuy * ctx.exchangeRate; // Cost: 10,000 * 1M / 2 =  10 ERG (CORRECT)
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      let value = BigInt(projectBox.value);
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount }); // In custom token mode, contract receives payment tokens
      } else {
        value += paymentAmount; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        value,
        ctx.beneErgoTree // Same contract address
      )
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4, // Deadline (unchanged)
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum (unchanged)
          R6: SColl(SLong, [tokensToBuy, 0n, 1n]).toHex(), // Counters: [10k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(), // Price (unchanged)
          R8: projectBox.additionalRegisters.R8, // Owner details (unchanged)
          R9: projectBox.additionalRegisters.R9, // Metadata (unchanged)
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer gets 10,000 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address) // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE) // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      expect(result).toBe(false); // Transaction invalid
    });
  });

  describe("Scenario where no APT tokens remain unsold (Sold Out)", () => {
    let ctx: BeneTestContext; // Test environment (blockchain, actors, config)
    let projectBox: Box; // The contract's UTXO holding tokens and funds

    beforeEach(() => {
      // STEP 1: Initialize test context
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // --- SETUP FOR SOLD OUT STATE ---
      const soldAmount = ctx.totalPFTokens; // All tokens (100k) are marked as sold
      const accumulatedSalesValue = soldAmount * ctx.exchangeRate; // Calculate required funds from sales

      // Initial assets: Only the 1n identifier APT remains, PFT is still present (for accounting)
      const initialAssets = [
        { tokenId: ctx.projectNftId, amount: 1n }, // APT: Only 1n (the NFT/ID) remains
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT: 100,000 tokens (for accounting)
      ];

      let initialValue = RECOMMENDED_MIN_FEE_VALUE; // Start with minimum ERG

      // Adjust assets/value based on payment mode (simulating accumulated funds)
      if (!ctx.isErgMode) {
        // In custom token mode, the contract holds the accumulated payment tokens
        initialAssets.push({ tokenId: ctx.baseTokenId, amount: accumulatedSalesValue });
      } else {
        // In ERG mode, the contract's value is the minimum + accumulated ERG
        initialValue += accumulatedSalesValue;
      }
      // --- END SETUP ---

      // STEP 2: Create project box in 'Sold Out' state
      ctx.beneContract.addUTxOs({
        value: initialValue,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: initialAssets,
        creationHeight: ctx.mockChain.height,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          // KEY CHANGE: R6[0] (Sold Counter) equals total PFT, meaning no more tokens are available
          R6: SColl(SLong, [soldAmount, 0n, 0n]).toHex(), // Counters: [100k sold, 0 refunded, 0 exchanged]
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      // STEP 3: Get reference to the created project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should fail when attempting to buy tokens because onlyTemporaryUnsoldTokens is violated (Contract Sold Out)", () => {
      // ARRANGE: Attempt to buy 1 token
      const tokensToBuy = 1n; // Buyer tries to buy 1 token
      const paymentAmount = tokensToBuy * ctx.exchangeRate;

      // New APT amount in the contract would be 1n (current) - 1n (bought) = 0n
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy;

      let value = BigInt(projectBox.value);
      // Copy assets, excluding the base token if it's there (we handle payment next)
      const assets = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ];

      // Calculate how the payment affects the contract's value/assets
      if (!ctx.isErgMode) {
        // Find existing base token amount and add the new payment
        const currentBaseTokenAsset = projectBox.assets.find((a) => a.tokenId === ctx.baseTokenId);
        const currentBaseTokens = currentBaseTokenAsset ? BigInt(currentBaseTokenAsset.amount) : 0n;
        assets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens + paymentAmount });
      } else {
        value += paymentAmount; // In ERG mode, contract receives ERG
      }

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(value, ctx.beneErgoTree)
        .addTokens(assets)
        .setAdditionalRegisters({
          R4: projectBox.additionalRegisters.R4,
          R5: projectBox.additionalRegisters.R5,
          // Update R6[0] to reflect the attempted sale: R6[0] = 100000 + 1
          R6: SColl(SLong, [ctx.totalPFTokens + tokensToBuy, 0n, 0n]).toHex(),
          R7: projectBox.additionalRegisters.R7,
          R8: projectBox.additionalRegisters.R8,
          R9: projectBox.additionalRegisters.R9,
        });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])

        // OUTPUTS:
        .to([
          contractOutputBuilder, // Output 0: Updated contract (more funds, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy }, // Buyer attempts to get 1 APT
          ]),
        ])

        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // ASSERT: Transaction must fail.
      // The contract logic checks:
      // deltaTokenRemoved (1) <= temporaryFundingUnsoldTokens (0) => FALSE.
      expect(result).toBe(false);
    });
  });
});
