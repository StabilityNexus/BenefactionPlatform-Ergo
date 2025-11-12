// ===== TEST FILE: Exchange APT → PFT =====
// Tests the token exchange where users convert APT back to PFT (1:1 ratio)
// This is only allowed AFTER the minimum funding threshold is reached
// Verifies exchange counter updates and token conservation

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext } from "./bene_contract_helpers";

// EXECUTION FLOW:
// 1. beforeEach() → Creates blockchain + project box with MINIMUM REACHED (50k tokens sold)
// 2. Give buyer 10k APT tokens to exchange
// 3. Test builds transaction: Buyer returns APT → Contract gives PFT (1:1)
// 4. Contract validates minimum is reached and exchange ratio is correct

describe("Bene Contract v1.2 - Exchange APT → PFT", () => {
  let ctx: BeneTestContext;  // Test environment
  let projectBox: Box;       // Contract box

  // SETUP: Runs before each test
  beforeEach(() => {
    // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);

    // STEP 2: Create project box with MINIMUM FUNDING REACHED
    // IMPORTANT: Exchange only works when sold >= minimumTokensSold
    const soldTokens = ctx.minimumTokensSold; // 50,000 tokens sold = minimum reached!

    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE + soldTokens * ctx.exchangeRate,  // 1.1M + 50 ERG raised
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens }, // APT: 1 + 100k - 50k = 50,001 remaining
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },                     // PFT: 100,000 still available
      ],
      creationHeight: ctx.mockChain.height - 100,  // Created 100 blocks ago
      additionalRegisters: {
        R4: SInt(ctx.deadlineBlock).toHex(),                               // Deadline
        R5: SLong(ctx.minimumTokensSold).toHex(),                          // Minimum: 50k
        R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),                    // [50k sold, 0 refunded, 0 exchanged]
        R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),  // [price, token_len]
        R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    // STEP 3: Give buyer APT tokens to exchange (simulating previous purchase)
    const aptToExchange = 10_000n;
    ctx.buyer.addUTxOs({
      value: 10_000_000_000n,                                     // 10 ERG for transaction fees
      ergoTree: ctx.buyer.address.ergoTree,                       // Buyer's address
      assets: [{ tokenId: ctx.projectNftId, amount: aptToExchange }],  // Buyer has 10,000 APT to exchange
      creationHeight: ctx.mockChain.height - 50,                  // Acquired 50 blocks ago
      additionalRegisters: {},
    });

    // STEP 4: Get reference to project box
    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  describe("Exchange Funding Tokens (APT -> PFT)", () => {
    it("should allow exchanging APT tokens for PFT tokens", () => {
      // ARRANGE: Prepare exchange transaction
      // Find buyer's box containing APT tokens
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;  // 10,000 APT to exchange

      const soldTokens = ctx.minimumTokensSold;                    // 50,000 (from beforeEach)
      const currentExchangeCounter = 0n;                           // Current exchange counter from R6[2]
      const newExchangeCounter = currentExchangeCounter + aptToExchange;  // Increment to 10,000

      // Calculate new token amounts after exchange
      const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;  // Contract gains: 50,001 + 10k = 60,001 APT
      const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange;  // Contract loses: 100k - 10k = 90k PFT

      console.log("\nEXCHANGE TRANSACTION (APT → PFT):");
      console.log(`   APT to Exchange:   ${aptToExchange.toLocaleString()}`);
      console.log(`   PFT to Receive:    ${aptToExchange.toLocaleString()} (1:1 ratio)`);
      console.log(`   Minimum Reached?   YES (${soldTokens.toLocaleString()} sold)`);
      console.log(`   Exchange Counter:  ${currentExchangeCounter} → ${newExchangeCounter}`);

      // LOG: Show buyer state before exchange
      console.log(`   BUYER STATE BEFORE:`);
      const buyerAPTBefore = buyerAPTBox.assets[0].amount;
      const buyerPFTBefore = ctx.buyer.utxos.toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId))?.assets[0]?.amount || 0n;
      console.log(`      APT Balance:     ${buyerAPTBefore.toLocaleString()}`);
      console.log(`      PFT Balance:     ${buyerPFTBefore.toLocaleString()}`);
      console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

      // ACT: Build and execute exchange transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + buyer's APT box
        .from([projectBox, buyerAPTBox])
        
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (gains APT, loses PFT)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)  // ERG value unchanged
            .addTokens([
              { tokenId: ctx.projectNftId, amount: newAPTAmount },  // 60,001 APT (gained 10k)
              { tokenId: ctx.pftTokenId, amount: newPFTAmount },    // 90,000 PFT (lost 10k)
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, newExchangeCounter]).toHex(),  // [50k, 0, 10k] - exchange counter updated
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Buyer receives PFT tokens (1:1 exchange ratio)
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: aptToExchange },  // Buyer gets 10,000 PFT
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)      // Change back to buyer
        .payFee(RECOMMENDED_MIN_FEE_VALUE)     // 0.001 ERG fee
        .build();

      // Execute transaction (contract validates minimum reached + exchange ratio)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

      // ASSERT: Verify exchange succeeded
      expect(result).toBe(true);                          // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1);   // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      expect(updatedBox.assets[0].amount).toEqual(newAPTAmount);  // Contract has 60,001 APT
      expect(updatedBox.assets[1].amount).toEqual(newPFTAmount);  // Contract has 90,000 PFT

      // Verify buyer received PFT tokens
      const buyerPFTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId));
      expect(buyerPFTBox).toBeDefined();                           // Buyer has PFT box
      expect(buyerPFTBox!.assets[0].amount).toEqual(aptToExchange);  // Buyer got 10,000 PFT

      // LOG: Show buyer state after exchange
      console.log(`   BUYER STATE AFTER:`);
      const buyerAPTAfter = ctx.buyer.utxos.toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))?.assets[0]?.amount || 0n;
      const buyerPFTAfter = buyerPFTBox!.assets[0].amount;
      console.log(`      APT Balance:     ${buyerAPTAfter.toLocaleString()}`);
      console.log(`      PFT Balance:     ${buyerPFTAfter.toLocaleString()}`);
      console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

      // LOG: Show final state after exchange
      console.log(`   CONTRACT STATE AFTER:`);
      console.log(`      APT Balance:     ${updatedBox.assets[0].amount.toLocaleString()}`);
      console.log(`      PFT Balance:     ${updatedBox.assets[1].amount.toLocaleString()}`);
      console.log(`      Sold Counter:    ${soldTokens} tokens`);
      console.log(`      Exchange Counter: ${newExchangeCounter} tokens`);
      console.log(`   Exchange successful!`);
    });

    it("should fail when exchange ratio is incorrect", () => {
      // ARRANGE: Try to exchange with WRONG ratio
      const buyerAPTBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
      const aptToExchange = buyerAPTBox.assets[0].amount;  // 10,000 APT
      const wrongPFTAmount = aptToExchange * 2n;           // Try to get 20,000 PFT (should be 1:1)

      // ACT: Build transaction with INCORRECT exchange ratio
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerAPTBox])
        .to([
          // Contract tries to give 20k PFT for 10k APT (WRONG!)
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: BigInt(projectBox.assets[0].amount) + aptToExchange },  // Gains 10k APT
              { tokenId: ctx.pftTokenId, amount: BigInt(projectBox.assets[1].amount) - wrongPFTAmount },   // Loses 20k PFT (WRONG!)
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [30_000n, 0n, aptToExchange]).toHex(),
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Buyer tries to receive 20k PFT
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: wrongPFTAmount },  // Wants 20,000 PFT (greedy!)
          ]),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute with throw: false to capture failure
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // ASSERT: Transaction should FAIL (contract validates 1:1 ratio)
      expect(result).toBe(false);  // Contract rejects incorrect exchange ratio
    });
  });
});
