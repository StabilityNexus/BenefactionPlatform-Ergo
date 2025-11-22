// ===== TEST FILE: Refund APT Tokens =====
// Tests the refund mechanism where buyers can get their payment back
// Refunds are ONLY allowed when: (1) Past deadline AND (2) Minimum NOT reached
// Verifies refund counter updates and payment returns

import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext, USD_BASE_TOKEN_NAME, USD_BASE_TOKEN } from "./bene_contract_helpers";

// EXECUTION FLOW:
// 1. beforeEach() → Creates blockchain + project box with MINIMUM NOT REACHED (25k sold < 50k minimum)
// 2. Give buyer 5k APT tokens to refund
// 3. Test jumps past deadline, then builds refund transaction
// 4. Contract validates: deadline passed + minimum not reached + correct refund amount

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Refund APT Tokens (%s)", (mode) => {
  let ctx: BeneTestContext;  // Test environment
  let projectBox: Box;       // Contract box

  // SETUP: Runs before each test
  beforeEach(() => {
    // STEP 1: Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(mode.token, mode.tokenName);

    // STEP 2: Create project box with MINIMUM NOT REACHED (failed campaign)
    const soldTokens = ctx.minimumTokensSold / 2n;  // Only 25,000 sold (need 50,000) - FAILED!
    const collectedPayment = soldTokens * ctx.exchangeRate;  // 25 ERG collected

    // Build contract assets (differs based on ERG vs custom token mode)
    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },  // APT: 1 + 100k - 25k = 75,001
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },                      // PFT: 100,000
    ];
    // In custom token mode, collected payment is stored as tokens
    if (!ctx.isErgMode) {
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: collectedPayment });
    }

    ctx.beneContract.addUTxOs({
      // In ERG mode: store payment as ERG value; In token mode: only minimum ERG
      value: ctx.isErgMode ? RECOMMENDED_MIN_FEE_VALUE + collectedPayment : RECOMMENDED_MIN_FEE_VALUE,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: contractAssets,
      creationHeight: ctx.mockChain.height - 100,  // Created 100 blocks ago
      additionalRegisters: {
        R4: SInt(ctx.deadlineBlock).toHex(),                               // Deadline: block 800,200
        R5: SLong(ctx.minimumTokensSold).toHex(),                          // Minimum: 50,000
        R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),                    // [25k sold, 0 refunded, 0 exchanged]
        R7: SLong(ctx.exchangeRate).toHex(),  // [price, token_len]
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    // STEP 3: Give buyer APT tokens to refund (from previous purchase)
    const tokensToRefund = 5_000n;
    ctx.buyer.addUTxOs({
      value: 10_000_000_000n,                                     // 10 ERG for transaction fees
      ergoTree: ctx.buyer.address.ergoTree,
      assets: [{ tokenId: ctx.projectNftId, amount: tokensToRefund }],  // Buyer has 5,000 APT to refund
      creationHeight: ctx.mockChain.height - 50,                  // Acquired 50 blocks ago
      additionalRegisters: {},
    });

    // STEP 4: Get reference to project box
    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  it("should allow refunding APT tokens after deadline when minimum not reached", () => {
    // ARRANGE: Jump blockchain PAST the deadline
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);  // Move to block 800,201 (past 800,200 deadline)

    // Find buyer's box with APT tokens
    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;  // 5,000 APT
    const refundAmount = tokensToRefund * ctx.exchangeRate;  // 5 ERG to refund

    const soldTokens = ctx.minimumTokensSold / 2n;                    // 25,000 (from beforeEach)
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + tokensToRefund;  // Contract gains: 75,001 + 5k = 80,001 APT

    const decimalDivisor = 10 ** ctx.baseTokenDecimals;
    console.log("\nREFUND TRANSACTION:");
    console.log(`   APT to Refund:     ${tokensToRefund.toLocaleString()}`);
    console.log(`   Refund Amount:     ${Number(refundAmount) / decimalDivisor} ${ctx.baseTokenName}`);
    console.log(`   Campaign Failed?   YES (${soldTokens.toLocaleString()} < ${ctx.minimumTokensSold.toLocaleString()})`);
    console.log(`   Past Deadline?     YES (block ${ctx.mockChain.height} > ${ctx.deadlineBlock})`);
    console.log(`   Refund Counter:    0 → ${tokensToRefund.toLocaleString()}`);

    // LOG: Show buyer state before refund
    console.log(`   BUYER STATE BEFORE:`);
    const buyerAPTBefore = buyerTokenBox.assets[0].amount;
    const buyerPFTBefore = ctx.buyer.utxos.toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId))?.assets[0]?.amount || 0n;
    console.log(`      APT Balance:     ${buyerAPTBefore.toLocaleString()}`);
    console.log(`      PFT Balance:     ${buyerPFTBefore.toLocaleString()}`);
    console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

    // Build updated contract token list
    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },        // APT: 80,001 (gained 5k back)
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },     // PFT: 100,000 (unchanged)
    ];
    if (!ctx.isErgMode) {
      // In custom token mode, contract loses payment tokens
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - refundAmount });
    }

    // Build buyer's refund output (ERG or custom tokens)
    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(refundAmount, ctx.buyer.address)  // In ERG mode: buyer gets 5 ERG back
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([  // In token mode: payment tokens
          { tokenId: ctx.baseTokenId, amount: refundAmount },
        ]);

    // ACT: Build and execute refund transaction
    const transaction = new TransactionBuilder(ctx.mockChain.height)
      // INPUTS: Contract box + buyer's APT box
      .from([projectBox, buyerTokenBox])
      
      // OUTPUTS:
      .to([
        // Output 0: Updated contract (gains APT back, loses payment)
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - refundAmount : projectBox.value,  // Loses 5 ERG
          ctx.beneErgoTree
        )
          .addTokens(contractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, tokensToRefund, 0n]).toHex(),  // [25k sold, 5k refunded, 0 exchanged]
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        // Output 1: Buyer receives payment refund
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    // Execute transaction (contract validates: deadline passed + minimum not reached)
    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer] });

    // ASSERT: Verify refund succeeded
    expect(result).toBe(true);                          // Transaction valid
    expect(ctx.beneContract.utxos.length).toEqual(1);   // Contract still has 1 box

    const updatedBox = ctx.beneContract.utxos.toArray()[0];
    expect(updatedBox.assets[0].amount).toEqual(newAPTAmount);  // Contract has 80,001 APT

    // LOG: Show buyer state after refund
    console.log(`   BUYER STATE AFTER:`);
    const buyerAPTAfter = ctx.buyer.utxos.toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))?.assets[0]?.amount || 0n;
    const buyerPFTAfter = ctx.buyer.utxos.toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.pftTokenId))?.assets[0]?.amount || 0n;
    console.log(`      APT Balance:     ${buyerAPTAfter.toLocaleString()}`);
    console.log(`      PFT Balance:     ${buyerPFTAfter.toLocaleString()}`);
    console.log(`      ERG Balance:     ${Number(ctx.buyer.balance.nanoergs) / 1_000_000_000} ERG`);

    // LOG: Show final state after refund
    console.log(`   CONTRACT STATE AFTER:`);
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
    console.log(`      Sold Counter:    ${soldTokens} tokens`);
    console.log(`      Refund Counter:  ${tokensToRefund} tokens`);
    console.log(`   Refund successful!`);
  });

  it("should allow multiple sequential refunds and update refund counter cumulatively", () => {
    // ARRANGE: Give buyer an additional APT box so we can refund in two separate txs
    const secondTokens = 3_000n;
    ctx.buyer.addUTxOs({
      value: 5_000_000_000n,
      ergoTree: ctx.buyer.address.ergoTree,
      assets: [{ tokenId: ctx.projectNftId, amount: secondTokens }],
      creationHeight: ctx.mockChain.height - 40,
      additionalRegisters: {},
    });

    // Jump past deadline
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);

    // First refund uses original box (5,000)
    const firstBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId && asset.amount === 5_000n))!;
    const firstRefundTokens = firstBox.assets[0].amount;
    const firstRefundAmount = firstRefundTokens * ctx.exchangeRate;

    // Build and execute first refund tx
    let soldTokens = ctx.minimumTokensSold / 2n;
    let contractAfterFirstAssets = [
      { tokenId: ctx.projectNftId, amount: BigInt(projectBox.assets[0].amount) + firstRefundTokens },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAfterFirstAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - firstRefundAmount });
    }

    const firstTx = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, firstBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - firstRefundAmount : projectBox.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAfterFirstAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, firstRefundTokens, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        ctx.isErgMode ? new OutputBuilder(firstRefundAmount, ctx.buyer.address) : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: firstRefundAmount },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const res1 = ctx.mockChain.execute(firstTx, { signers: [ctx.buyer] });
    expect(res1).toBe(true);

    // Prepare for second refund using the updated contract box and the second APT box
    const updatedContractAfter1 = ctx.beneContract.utxos.toArray()[0];
    const secondBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId && asset.amount === secondTokens))!;
    const secondRefundTokens = secondBox.assets[0].amount;
    const secondRefundAmount = secondRefundTokens * ctx.exchangeRate;

    // Compute expected cumulative values
    const cumulativeRefund = firstRefundTokens + secondRefundTokens;
    const expectedAPTOnContract = BigInt(projectBox.assets[0].amount) + cumulativeRefund;

    // Build and execute second refund tx
    const contractAfterSecondAssets = [
      { tokenId: ctx.projectNftId, amount: expectedAPTOnContract },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(updatedContractAfter1.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAfterSecondAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - secondRefundAmount });
    }

    const secondTx = new TransactionBuilder(ctx.mockChain.height)
      .from([updatedContractAfter1, secondBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(updatedContractAfter1.value) - secondRefundAmount : updatedContractAfter1.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAfterSecondAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, cumulativeRefund, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: updatedContractAfter1.additionalRegisters.R8,
            R9: updatedContractAfter1.additionalRegisters.R9,
          }),
        ctx.isErgMode ? new OutputBuilder(secondRefundAmount, ctx.buyer.address) : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: secondRefundAmount },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const res2 = ctx.mockChain.execute(secondTx, { signers: [ctx.buyer] });
    expect(res2).toBe(true);

    // ASSERT final contract and counters
    const finalContract = ctx.beneContract.utxos.toArray()[0];
    expect(finalContract.assets[0].amount).toEqual(expectedAPTOnContract); // APT increased by both refunds

    expect(cumulativeRefund).toBeGreaterThan(0n);
    expect(finalContract.assets[0].amount).toEqual(expectedAPTOnContract);
  });

  it("should fail to refund before deadline", () => {
    // ARRANGE: Try to refund BEFORE deadline (should fail)
    ctx.mockChain.jumpTo(ctx.deadlineBlock - 10);  // Jump to block 800,190 (deadline is 800,200)

    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;
    const refundAmount = tokensToRefund * ctx.exchangeRate;

    const soldTokens = ctx.minimumTokensSold / 2n;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + tokensToRefund;

    // Build contract output based on payment mode
    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - refundAmount });
    }

    // Build refund output based on payment mode
    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(refundAmount, ctx.buyer.address)
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: refundAmount },
        ]);

    // Act
    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerTokenBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - refundAmount : projectBox.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, tokensToRefund, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    // Execute with throw: false to capture failure
    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    // ASSERT: Transaction should FAIL (deadline not reached yet)
    expect(result).toBe(false);                          // Contract rejects refund before deadline
    expect(ctx.beneContract.utxos.length).toEqual(1);    // Box not spent
  });

  it("should fail to refund after deadline when minimum IS reached", () => {
    // ARRANGE: Create scenario where minimum WAS reached (successful campaign - no refunds!)
    ctx.beneContract.utxos.clear();  // Clear existing box
    const soldTokens = ctx.minimumTokensSold;       // 50,000 sold = minimum REACHED!
    const collectedPayment = soldTokens * ctx.exchangeRate;  // 50 ERG collected

    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: collectedPayment });
    }

    ctx.beneContract.addUTxOs({
      value: ctx.isErgMode ? RECOMMENDED_MIN_FEE_VALUE + collectedPayment : RECOMMENDED_MIN_FEE_VALUE,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: contractAssets,
      creationHeight: ctx.mockChain.height - 100,
      additionalRegisters: {
        R4: SInt(ctx.deadlineBlock).toHex(),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // Minimum reached!
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    const boxMinReached = ctx.beneContract.utxos.toArray()[0];
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);  // Jump PAST deadline

    // Find buyer's APT tokens
    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;  // 5,000 APT
    const refundAmount = tokensToRefund * ctx.exchangeRate;  // 5 ERG

    const newAPTAmount = BigInt(boxMinReached.assets[0].amount) + tokensToRefund;

    const refundContractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(boxMinReached.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      refundContractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - refundAmount });
    }

    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(refundAmount, ctx.buyer.address)
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: refundAmount },
        ]);

    // ACT: Try to refund even though minimum was reached
    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([boxMinReached, buyerTokenBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(boxMinReached.value) - refundAmount : boxMinReached.value,
          ctx.beneErgoTree
        )
          .addTokens(refundContractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, tokensToRefund, 0n]).toHex(),  // Try to record refund
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: boxMinReached.additionalRegisters.R8,
            R9: boxMinReached.additionalRegisters.R9,
          }),
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    // Execute with throw: false to capture failure
    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    // ASSERT: Transaction should FAIL (campaign was successful, no refunds allowed)
    expect(result).toBe(false);                          // Contract rejects: minimum WAS reached
    expect(ctx.beneContract.utxos.length).toEqual(1);    // Box not spent
  });

  it("should fail to refund at exact deadline (HEIGHT == R4)", () => {
    // ARRANGE: Jump to exact deadline block (equal to R4). Contract requires HEIGHT > R4.
    ctx.mockChain.jumpTo(ctx.deadlineBlock -1); // exactly R4 (Fleet SDK's MockChain.execute() validates transactions at HEIGHT + 1, not at the current height.)

    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;
    const refundAmount = tokensToRefund * ctx.exchangeRate;

    const soldTokens = ctx.minimumTokensSold / 2n;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + tokensToRefund;

    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - refundAmount });
    }

    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(refundAmount, ctx.buyer.address)
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: refundAmount },
        ]);

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerTokenBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - refundAmount : projectBox.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, tokensToRefund, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    // ASSERT: Refund at HEIGHT == R4 should fail
    expect(result).toBe(false);
    expect(ctx.beneContract.utxos.length).toEqual(1);
  });

  it("should fail to refund when refund amount is incorrect (wrong exchange value)", () => {
    // ARRANGE: Jump past deadline
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);

    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;
    const correctRefundAmount = tokensToRefund * ctx.exchangeRate;

    // Intentionally use wrong amount (e.g. one base token less)
    const wrongRefundAmount = correctRefundAmount - (1n * (10n ** BigInt(ctx.baseTokenDecimals - ctx.baseTokenDecimals + 0))); // subtract 1 base unit
    // For ERG mode above will subtract 1 nanoERG, ensure non-negative fallback
    const attemptedRefund = wrongRefundAmount > 0n ? wrongRefundAmount : 0n;

    const soldTokens = ctx.minimumTokensSold / 2n;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + tokensToRefund;

    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - attemptedRefund });
    }

    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(attemptedRefund, ctx.buyer.address)
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: attemptedRefund },
        ]);

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerTokenBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - attemptedRefund : projectBox.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            R6: SColl(SLong, [soldTokens, tokensToRefund, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    // ASSERT: Transaction should fail because the refund amount doesn't match exchange rate
    expect(result).toBe(false);
    expect(ctx.beneContract.utxos.length).toEqual(1);
  });

  it("should fail to refund when R6 refund counter does not match tokens added (counter mismatch)", () => {
    // ARRANGE: Jump past deadline
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);

    const buyerTokenBox = ctx.buyer.utxos
      .toArray()
      .find((box) => box.assets.some((asset) => asset.tokenId === ctx.projectNftId))!;
    const tokensToRefund = buyerTokenBox.assets[0].amount;
    const refundAmount = tokensToRefund * ctx.exchangeRate;

    const soldTokens = ctx.minimumTokensSold / 2n;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) + tokensToRefund;

    // Intentionally put wrong refund counter (tokensToRefund - 1) to simulate mismatch
    const wrongRefundCounter = tokensToRefund - 1n;

    const contractAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    if (!ctx.isErgMode) {
      const currentBaseTokens = BigInt(projectBox.assets.find(a => a.tokenId === ctx.baseTokenId)!.amount);
      contractAssets.push({ tokenId: ctx.baseTokenId, amount: currentBaseTokens - refundAmount });
    }

    const refundOutputBuilder = ctx.isErgMode
      ? new OutputBuilder(refundAmount, ctx.buyer.address)
      : new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.baseTokenId, amount: refundAmount },
        ]);

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, buyerTokenBox])
      .to([
        new OutputBuilder(
          ctx.isErgMode ? BigInt(projectBox.value) - refundAmount : projectBox.value,
          ctx.beneErgoTree
        )
          .addTokens(contractAssets)
          .setAdditionalRegisters({
            R4: SInt(ctx.deadlineBlock).toHex(),
            R5: SLong(ctx.minimumTokensSold).toHex(),
            // WRONG COUNTER intentionally
            R6: SColl(SLong, [soldTokens, wrongRefundCounter, 0n]).toHex(),
            R7: SLong(ctx.exchangeRate).toHex(),
            R8: projectBox.additionalRegisters.R8,
            R9: projectBox.additionalRegisters.R9,
          }),
        refundOutputBuilder,
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

    // ASSERT: Transaction should fail because R6 refund counter doesn't match tokens added
    expect(result).toBe(false);
    expect(ctx.beneContract.utxos.length).toEqual(1);
  });

});
