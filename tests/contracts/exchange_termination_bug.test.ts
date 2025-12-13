// ===== TEST FILE: Bug Reproduction - Exchange Final APT and Terminate Contract =====
// This test demonstrates the bug where endOrReplicate is defined but never used
// in the isExchangeFundingTokens action, preventing contract termination

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext, createR4 } from "./bene_contract_helpers";

// BUG REPRODUCTION SCENARIO:
// 1. Create contract with 100,000 PFT tokens
// 2. Sell all 100,000 tokens (users get APT)
// 3. Exchange 90,000 APT back to PFT  
// 4. Try to exchange FINAL 10,000 APT and TERMINATE contract
// Expected: Should succeed and remove contract box
// Actual: FAILS because contract requires replication (bug on line 558)

describe("BUG REPRODUCTION: Exchange Final APT and Terminate Contract", () => {
  let ctx: BeneTestContext;
  let projectBox: Box;

  beforeEach(() => {
    // Initialize test context
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);

    // Scenario setup:
    // - Total PFT: 100,000 tokens
    // - Sold: 100,000 tokens (all sold)
    // - Already exchanged: 90,000 APT → PFT
    // - Remaining to exchange: 10,000 APT
    const soldTokens = 100_000n;  // All tokens sold
    const alreadyExchanged = 90_000n;  // 90k already exchanged
    const remainingPFT = 10_000n;  // Only 10k PFT left in contract
    const collectedFunds = soldTokens * ctx.exchangeRate;

    // Contract box state:
    // - APT: 1 (NFT) + 100k (initial) - 100k (sold) + 90k (exchanged back) = 90,001
    // - PFT: 100k (initial) - 90k (exchanged out) = 10,000
    const currentAPT = 1n + ctx.totalPFTokens - soldTokens + alreadyExchanged;  // 90,001
    
    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE + collectedFunds,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [
        { tokenId: ctx.projectNftId, amount: currentAPT },  // 90,001 APT
        { tokenId: ctx.pftTokenId, amount: remainingPFT },  // 10,000 PFT (only this much left!)
      ],
      creationHeight: ctx.mockChain.height - 100,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(ctx.minimumTokensSold).toHex(),  // Minimum: 50k (already met)
        R6: SColl(SLong, [soldTokens, 0n, alreadyExchanged]).toHex(),  // [100k sold, 0 refunded, 90k exchanged]
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    // Give buyer the FINAL 10,000 APT to exchange
    ctx.buyer.addUTxOs({
      value: 10_000_000_000n,  // 10 ERG for fees
      ergoTree: ctx.buyer.address.ergoTree,
      assets: [{ tokenId: ctx.projectNftId, amount: 10_000n }],  // Last 10k APT
      creationHeight: ctx.mockChain.height - 50,
      additionalRegisters: {},
    });

    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  it("should FAIL to exchange final APT and terminate contract (demonstrates bug)", () => {
    // Find buyer's box with the final 10k APT
    const buyerAPTBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const aptToExchange = buyerAPTBox.assets[0].amount;  // 10,000 APT

    console.log("\n🔍 BUG REPRODUCTION SCENARIO:");
    console.log("═══════════════════════════════════════════════");
    console.log(`Contract state BEFORE final exchange:`);
    console.log(`  APT in contract: ${projectBox.assets[0].amount}`);
    console.log(`  PFT in contract: ${projectBox.assets[1].amount}`);
    console.log(`  Buyer APT to exchange: ${aptToExchange}`);
    console.log(`  Total sold: 100,000 | Already exchanged: 90,000`);
    console.log(`\n🎯 Goal: Exchange final 10k APT and TERMINATE contract`);
    console.log(`📝 Expected: Transaction succeeds, contract box removed`);
    console.log(`❌ Actual: Will FAIL due to bug on line 558\n`);

    // Calculate final exchange counter
    const currentExchangeCounter = 90_000n;
    const newExchangeCounter = currentExchangeCounter + aptToExchange;  // 100,000

    // Build transaction that TERMINATES the contract (no OUTPUTS[0] replication)
    // This should be VALID because:
    // - endOrReplicate allows: isSelfReplication || (allFundsWithdrawn && allTokensWithdrawn)
    // - allFundsWithdrawn: ERG value unchanged (all funds still in contract)
    // - allTokensWithdrawn: OUTPUTS[0].tokens.size == 1 (only APT, no PFT left)
    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerAPTBox])
      .to([
        // Output 0: Buyer receives the FINAL 10k PFT
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.pftTokenId, amount: aptToExchange },  // Buyer gets last 10k PFT  
        ]),
        // NO Output 1: Contract is TERMINATED (no replication box)
        // This is the desired behavior to clean up the blockchain
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    console.log("🔨 Attempting to execute transaction...\n");

    // Execute transaction - THIS WILL FAIL!
    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    console.log("═══════════════════════════════════════════════");
    console.log("📊 RESULT:");
    console.log(`  Transaction succeeded: ${result}`);
    console.log(`  Contract boxes remaining: ${ctx.beneContract.utxos.length}`);
    
    if (!result) {
      console.log("\n❌ BUG CONFIRMED!");
      console.log("═══════════════════════════════════════════════");
      console.log("Root Cause Analysis:");
      console.log("  1. Line 550-555: endOrReplicate IS defined correctly");
      console.log("  2. Line 558: constants uses 'isSelfReplication' instead of 'endOrReplicate'");
      console.log("  3. This forces the contract to ALWAYS replicate");
      console.log("  4. Contract cannot be terminated even when empty");
      console.log("\nImpact:");
      console.log("  - Blockchain bloat (dead contract boxes)");
      console.log("  - Locked ERG (~0.001 per contract)");
      console.log("  - Poor user experience");
      console.log("═══════════════════════════════════════════════\n");
    }

    // Assert: Transaction SHOULD succeed but will FAIL due to bug
    expect(result).toBe(false);  // BUG: This fails when it should succeed!
    expect(ctx.beneContract.utxos.length).toEqual(1);  // Contract still exists (shouldn't)
  });

  it("workaround: can exchange final APT but MUST replicate contract (leaves dead box)", () => {
    // Find buyer's box with the final 10k APT
    const buyerAPTBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const aptToExchange = buyerAPTBox.assets[0].amount;  // 10,000 APT

    const currentExchangeCounter = 90_000n;
    const newExchangeCounter = currentExchangeCounter + aptToExchange;  // 100,000

    // Calculate new token amounts after exchange
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + aptToExchange;  // 100,001 APT
    const newPFTAmount = BigInt(projectBox.assets[1].amount) - aptToExchange;  // 0 PFT (ALL GONE!)

    console.log("\n🔄 WORKAROUND:");
    console.log("═══════════════════════════════════════════════");
    console.log("Must replicate contract even though it's useless");
    console.log(`  Contract after exchange will have:`);
    console.log(`    - APT: ${newAPTAmount} (can't be exchanged for anything)`);
    console.log(`    - PFT: ${newPFTAmount} (ZERO - nothing left to exchange!)`);
    console.log(`    - Locked ERG: ~0.001`);
    console.log(`    - Purpose: NONE\n`);

    // Build transaction WITH replication (workaround to satisfy bug)
    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerAPTBox])
      .to([
        // Output 0: REPLICATED contract box (dead weight on blockchain)
        new OutputBuilder(projectBox.value, ctx.beneErgoTree)
          .addTokens([
            { tokenId: ctx.projectNftId, amount: newAPTAmount },  // 100,001 APT (useless)
            // NO PFT! Nothing left!
          ])
          .setAdditionalRegisters({
            R4: projectBox.additionalRegisters.R4,
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [100_000n, 0n, newExchangeCounter]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        // Output 1: Buyer receives final PFT
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.pftTokenId, amount: aptToExchange },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

    console.log("📊 WORKAROUND RESULT:");
    console.log(`  Transaction succeeded: ${result}`);
    console.log(`  Contract boxes remaining: ${ctx.beneContract.utxos.length}`);
    
    const updatedBox = ctx.beneContract.utxos.toArray()[0];
    console.log(`  Contract APT: ${updatedBox.assets[0].amount}`);
    console.log(`  Contract PFT: ${updatedBox.assets.length > 1 ? updatedBox.assets[1].amount : 0}`);
    console.log("\n⚠️  Dead contract box left on blockchain!");
    console.log("═══════════════════════════════════════════════\n");

    // Assert: Workaround succeeds but leaves useless box
    expect(result).toBe(true);
    expect(ctx.beneContract.utxos.length).toEqual(1);  // Box still exists (BAD!)
    expect(updatedBox.assets[0].amount).toEqual(newAPTAmount);
    expect(updatedBox.assets.length).toEqual(1);  // Only APT, no PFT (useless contract)
  });
});
