// ===== TEST FILE: Buy APT Tokens =====
// Tests the token purchase flow where users buy APT tokens with ERG (or custom tokens)
// Verifies payment validation, token distribution, and counter updates

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { setupBeneTestContext, BASE_TOKEN, BASE_TOKEN_NAME, type BeneTestContext } from "./bene_contract_helpers";

// EXECUTION FLOW:
// 1. beforeEach() → Creates fresh blockchain + initial project box with 100k APT tokens
// 2. Test builds transaction: Buyer pays ERG → Contract gives APT tokens
// 3. mockChain.execute() validates the transaction against contract rules
// 4. Assertions verify payment received and tokens distributed

describe("Bene Contract v1.2 - Buy APT Tokens", () => {
  let ctx: BeneTestContext;  // Test environment (blockchain, actors, config)
  let projectBox: Box;       // The contract's UTXO holding tokens and funds

  // SETUP: Runs before each test
  beforeEach(() => {
    // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(BASE_TOKEN, BASE_TOKEN_NAME);

    // STEP 2: Create initial project box with all tokens available for sale
    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE,               // Minimum ERG in contract
      ergoTree: ctx.beneErgoTree.toHex(),             // Contract script
      assets: [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens }, // APT: 1 NFT + 100k tokens = 100,001 total
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },        // PFT: 100,000 tokens
      ],
      creationHeight: ctx.mockChain.height,
      additionalRegisters: {
        R4: SInt(ctx.deadlineBlock).toHex(),                               // Deadline block
        R5: SLong(ctx.minimumTokensSold).toHex(),                          // Minimum: 50k tokens
        R6: SColl(SLong, [0n, 0n, 0n]).toHex(),                            // Counters: [0 sold, 0 refunded, 0 exchanged]
        R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),  // [price: 1M, token_len: 0]
        R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),            // Owner details (empty)
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),            // Metadata (empty)
      },
    });

    // STEP 3: Get reference to the created project box
    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  describe("Buy APT Tokens", () => {
    it("should allow buying APT tokens with ERG payment", () => {
      // ARRANGE: Calculate transaction amounts
      const tokensToBuy = 10_000n;                                      // Buyer wants 10,000 APT
      const paymentAmount = tokensToBuy * ctx.exchangeRate;            // Cost: 10,000 * 1M = 10 ERG
      const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy; // Contract loses 10k APT

      // LOG: Show buyer state before purchase
      console.log(`   BUYER STATE BEFORE:`);
      const buyerAPTBefore = ctx.buyer.utxos.toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))?.assets[0]?.amount || 0n;
      const buyerPFTBefore = ctx.buyer.utxos.toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId))?.assets[0]?.amount || 0n;
      console.log(`      APT Balance:     ${buyerAPTBefore.toLocaleString()}`);
      console.log(`      PFT Balance:     ${buyerPFTBefore.toLocaleString()}`);
      console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

      // Build the updated contract box (receives payment, loses tokens)
      const contractOutputBuilder = new OutputBuilder(
        ctx.isErgMode ? BigInt(projectBox.value) + paymentAmount : projectBox.value,  // Add 10 ERG to contract
        ctx.beneErgoTree                                                               // Same contract address
      );

      // Build token list for updated contract box
      const contractTokens = [
        { tokenId: ctx.projectNftId, amount: newAPTAmount },        // APT: 100,001 - 10,000 = 90,001 remaining
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },     // PFT: 100,000 (unchanged)
      ];
      // In custom token mode, add the received payment tokens to contract
      if (!ctx.isErgMode) {
        contractTokens.push({ tokenId: ctx.baseTokenId, amount: paymentAmount });
      }

      // Add tokens and update registers
      contractOutputBuilder.addTokens(contractTokens).setAdditionalRegisters({
        R4: SInt(ctx.deadlineBlock).toHex(),                               // Deadline (unchanged)
        R5: SLong(ctx.minimumTokensSold).toHex(),                          // Minimum (unchanged)
        R6: SColl(SLong, [tokensToBuy, 0n, 0n]).toHex(),                   // Counters: [10k sold, 0 refunded, 0 exchanged]
        R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),  // Price (unchanged)
        R8: projectBox.additionalRegisters.R8,                             // Owner details (unchanged)
        R9: projectBox.additionalRegisters.R9,                             // Metadata (unchanged)
      });

      // ACT: Build and execute the purchase transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Spend contract box + buyer's UTXOs (for payment)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])
        
        // OUTPUTS:
        .to([
          contractOutputBuilder,  // Output 0: Updated contract (more ERG, fewer APT)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([  // Output 1: Buyer receives tokens
            { tokenId: ctx.projectNftId, amount: tokensToBuy },  // Buyer gets 10,000 APT
          ]),
        ])
        
        .sendChangeTo(ctx.buyer.address)         // Remaining ERG goes back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE)        // Transaction fee: 0.001 ERG
        .build();

      // Execute transaction on mock blockchain (validates contract logic)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

      // ASSERT: Verify transaction succeeded
      expect(result).toBe(true);                          // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1);   // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      
      // Verify contract received payment correctly
      if (ctx.isErgMode) {
        // In ERG mode: Check ERG value increased
        expect(updatedBox.value).toEqual(BigInt(projectBox.value) + paymentAmount);  // 1.1M + 10 ERG
      } else {
        // In custom token mode: Check payment token was added
        const baseTokenAsset = updatedBox.assets.find((a) => a.tokenId === ctx.baseTokenId);
        expect(baseTokenAsset).toBeDefined();
        expect(baseTokenAsset!.amount).toEqual(paymentAmount);
      }

      // Verify buyer received APT tokens
      const buyerBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId));  // Find box with APT
      expect(buyerBox).toBeDefined();                              // Buyer has a box with APT
      expect(buyerBox!.assets[0].amount).toEqual(tokensToBuy);    // Buyer received exactly 10,000 APT

      // LOG: Show buyer state after purchase
      console.log(`   BUYER STATE AFTER:`);
      const buyerAPTAfter = buyerBox!.assets[0].amount;
      const buyerPFTAfter = ctx.buyer.utxos.toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId))?.assets[0]?.amount || 0n;
      console.log(`      APT Balance:     ${buyerAPTAfter.toLocaleString()}`);
      console.log(`      PFT Balance:     ${buyerPFTAfter.toLocaleString()}`);
      console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

      // LOG: Show final state
      const decimalDivisor = 10 ** ctx.baseTokenDecimals;
      console.log(`   CONTRACT STATE:`);
      console.log(`      APT Balance:     ${updatedBox.assets[0].amount.toLocaleString()}`);
      console.log(`      PFT Balance:     ${updatedBox.assets[1].amount.toLocaleString()}`);
      if (ctx.isErgMode) {
        console.log(`      ERG Balance:     ${Number(updatedBox.value) / 1_000_000_000} ERG`);
      } else {
        const baseTokenAsset = updatedBox.assets.find((a) => a.tokenId === ctx.baseTokenId);
        if (baseTokenAsset) {
          console.log(`      ${ctx.baseTokenName} Balance: ${Number(baseTokenAsset.amount) / decimalDivisor} ${ctx.baseTokenName}`);
        }
      }
      console.log(`      Sold Counter:    ${updatedBox.additionalRegisters.R6 ? updatedBox.additionalRegisters.R6[0] : 0} tokens`);
      console.log(`   Transaction successful!`);
    });

    it("should fail when ERG payment is insufficient for token amount", () => {
      // ARRANGE: Try to buy tokens with insufficient payment
      const tokensToBuy = 10_000n;                                     // Want 10,000 APT
      const insufficientPayment = (tokensToBuy * ctx.exchangeRate) / 2n; // Pay only 5 ERG (need 10 ERG)

      const newAPTAmount = projectBox.assets[0].amount - tokensToBuy;    // Contract loses 10k tokens
      const newContractValue = projectBox.value + insufficientPayment;   // Contract gets only 5 ERG

      // ACT: Build transaction with incorrect payment
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.buyer.utxos.toArray()])  // Same inputs
        .to([
          // Contract output with INSUFFICIENT payment
          new OutputBuilder(newContractValue, ctx.beneErgoTree)  // Only 5 ERG added instead of 10
            .addTokens([
              { tokenId: ctx.projectNftId, amount: newAPTAmount },    // Still loses 10k tokens
              { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [tokensToBuy, 0n, 0n]).toHex(),       // Claims 10k sold
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Buyer still tries to receive 10k tokens
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.projectNftId, amount: tokensToBuy },
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute with throw: false to capture failure
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // ASSERT: Transaction should FAIL (contract validates payment)
      expect(result).toBe(false);                          // Transaction rejected by contract
      expect(ctx.beneContract.utxos.length).toEqual(1);    // Contract box unchanged (not spent)
    });
  });
});
