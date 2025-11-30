// ===== TEST FILE: Counters =====
// This suite attempts to exploit the accounting logic of the contract
// by creating invalid states between Physical Tokens and Register Counters.
// Tries to create a malicious scenario for temporaryFundingTokenAmountOnContract function.

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

const baseModes = [
  { name: 'USD Token Mode', token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: 'ERG Mode', token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)('Bene Contract v1.2 - Counter Hacker Scenarios (%s)', (mode) => {
  let ctx: BeneTestContext;
  let projectBox: Box;

  // Helper to inject legitimate funds to the buyer (so they can attempt the attack)
  const giveTokensToBuyer = (tokens: { tokenId: string; amount: bigint }[]) => {
    ctx.buyer.addUTxOs({
      value: 10_000_000_000n, // 10 ERG for fees and change
      ergoTree: ctx.buyer.address.ergoTree,
      assets: tokens,
      creationHeight: ctx.mockChain.height,
      additionalRegisters: {},
    });
  };

  beforeEach(() => {
    ctx = setupBeneTestContext(mode.token, mode.tokenName);

    // Setup: Initial Project Box (Standard state: 100k PFTs, 0 Sold)
    const initialAssets = [
      { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens }, // APT
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // PFT
    ];

    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: initialAssets,
      creationHeight: ctx.mockChain.height,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
      },
    });

    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  /**
   * HACK 1: The Trojan Injection
   * Attacker buys tokens but tries to inject their own PFTs into the contract
   * to inflate the "physical" inventory.
   */
  it("should REJECT a 'Trojan Injection' (Adding PFTs during a Buy action)", () => {
    const tokensToBuy = 100n;
    const paymentAmount = tokensToBuy * ctx.exchangeRate;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy;

    const injectedPFT = 500n;
    // The contract should have (TotalPFT), the attacker tries to make it have (TotalPFT + 500)
    const maliciousPFTAmount = ctx.totalPFTokens + injectedPFT;

    // PREPARATION: Give the attacker the PFTs necessary for the injection
    // (Fleet needs to see them in the inputs to build the tx)
    giveTokensToBuyer([{ tokenId: ctx.pftTokenId, amount: injectedPFT }]);

    let value = BigInt(projectBox.value);
    const assets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: maliciousPFTAmount }, // maliciously increased
    ];

    if (!ctx.isErgMode) {
      assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount });
    } else {
      value += paymentAmount;
    }

    const contractOutputBuilder = new OutputBuilder(value, ctx.beneErgoTree)
      .addTokens(assets)
      .setAdditionalRegisters({
        ...projectBox.additionalRegisters,
        R6: SColl(SLong, [tokensToBuy, 0n, 0n]).toHex(),
      });

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([...ctx.beneContract.utxos.toArray(), ...ctx.buyer.utxos.toArray()])
      .to([
        contractOutputBuilder,
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.projectNftId, amount: tokensToBuy },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
    expect(result).toBe(false); // Fails due to ProofFundingTokenRemainsConstant
  });

  /**
   * HACK 2: The Ghost Sale
   * Attacker buys, removes APTs, but DOES NOT increment the Sold counter (R6[0]).
   */
  it("should REJECT a 'Ghost Sale' (Buying without incrementing Sold counter)", () => {
    const tokensToBuy = 100n;
    const paymentAmount = tokensToBuy * ctx.exchangeRate;
    const newAPTAmount = BigInt(projectBox.assets[0].amount) - tokensToBuy;

    let value = BigInt(projectBox.value);
    const assets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];

    if (!ctx.isErgMode) {
      assets.push({ tokenId: ctx.baseTokenId, amount: paymentAmount });
    } else {
      value += paymentAmount;
    }

    const contractOutputBuilder = new OutputBuilder(value, ctx.beneErgoTree)
      .addTokens(assets)
      .setAdditionalRegisters({
        ...projectBox.additionalRegisters,
        R6: SColl(SLong, [0n, 0n, 0n]).toHex(), // ATTACK: Sold counter remains 0
      });

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([...ctx.beneContract.utxos.toArray(), ...ctx.buyer.utxos.toArray()])
      .to([
        contractOutputBuilder,
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.projectNftId, amount: tokensToBuy },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
    expect(result).toBe(false); // Fails due to incrementSoldCounterCorrectly
  });

  /**
   * HACK 3: The Desync Exchange
   * Attacker exchanges APT->PFT but exaggerates the 'Exchanged' counter
   * to desynchronize the formula (PFT - Sold + Exchanged).
   */
  it("should REJECT a 'Desync Exchange' (Incrementing counter more than tokens)", () => {
    const aptAmountToExchange = 50n;

    // PREPARATION: Give the attacker the APTs needed to exchange
    giveTokensToBuyer([{ tokenId: ctx.projectNftId, amount: aptAmountToExchange }]);

    // For this test, we assume the contract box is ready for exchange (simplified)
    // Actually, isExchangeFundingTokens requires (MinimumReached). We simulate this by manipulating R5/R6 in the output if necessary,
    // or simply assume that the current contract allows exchange if the conditions were met.
    // NOTE: For exchange to be valid, 'MinimumReached' must be true.
    // We modify the Setup for this specific test by recreating the box with MinimumReached
    ctx.beneContract.utxos.clear();
    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - 50000n }, // Simulate 50k already sold
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
      ],
      creationHeight: ctx.mockChain.height,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(50000n).toHex(), // Min Sold 50k
        R6: SColl(SLong, [50000n, 0n, 0n]).toHex(), // Sold 50k (Minimum Reached)
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
      },
    });
    projectBox = ctx.beneContract.utxos.toArray()[0];

    const inputAPT = BigInt(projectBox.assets[0].amount);
    const inputPFT = BigInt(projectBox.assets[1].amount);

    const newAPTAmount = inputAPT + aptAmountToExchange;
    const newPFTAmount = inputPFT - aptAmountToExchange;

    const contractOutputBuilder = new OutputBuilder(BigInt(projectBox.value), ctx.beneErgoTree)
      .addTokens([
        { tokenId: ctx.projectNftId, amount: newAPTAmount },
        { tokenId: ctx.pftTokenId, amount: newPFTAmount },
        ...(ctx.isErgMode ? [] : [{ tokenId: ctx.baseTokenId, amount: 0n }]),
      ])
      .setAdditionalRegisters({
        ...projectBox.additionalRegisters,
        // ATTACK: Counter increments by 100, but we only moved 50 tokens
        R6: SColl(SLong, [50000n, 0n, 100n]).toHex(), // Exchanged goes 0 -> 100
      });

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([...ctx.beneContract.utxos.toArray(), ...ctx.buyer.utxos.toArray()])
      .to([
        contractOutputBuilder,
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          { tokenId: ctx.pftTokenId, amount: aptAmountToExchange },
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
    expect(result).toBe(false); // Fails due to incrementExchangeCounterCorrectly
  });

  /**
   * HACK 4: The Super Refund
   * Attacker returns tokens but inflates the 'Refunded' counter (R6[1])
   * to create "phantom" inventory.
   */
  it("should REJECT a 'Super Refund' (Incrementing Refund counter more than tokens returned)", () => {
    const tokensToRefund = 100n;
    const refundValue = tokensToRefund * ctx.exchangeRate;

    // PREPARATION 1: Attacker's funds
    giveTokensToBuyer([{ tokenId: ctx.projectNftId, amount: tokensToRefund }]);

    // PREPARATION 2: Contract State (Failed Campaign)
    // Clear initial box and create a "Failed Campaign" with funds to be refunded
    ctx.beneContract.utxos.clear();

    const soldAmount = 10000n; // Less than the minimum (50k)
    const collectedValue = soldAmount * ctx.exchangeRate;

    const refundReadyAssets = [
      { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];
    let refundReadyValue = RECOMMENDED_MIN_FEE_VALUE;

    if (!ctx.isErgMode) {
      refundReadyAssets.push({ tokenId: ctx.baseTokenId, amount: collectedValue });
    } else {
      refundReadyValue += collectedValue;
    }

    ctx.beneContract.addUTxOs({
      value: refundReadyValue,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: refundReadyAssets,
      creationHeight: ctx.mockChain.height,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        R6: SColl(SLong, [soldAmount, 0n, 0n]).toHex(), // Sold 10k (Min NOT Reached)
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
      },
    });
    const refundReadyBox = ctx.beneContract.utxos.toArray()[0];

    // PREPARATION 3: Advance time (Deadline passed)
    ctx.mockChain.jumpTo(ctx.deadlineBlock + 1);

    // ATTACK CONSTRUCTION
    const newAPTAmount = BigInt(refundReadyBox.assets[0].amount) + tokensToRefund;

    let newValue = BigInt(refundReadyBox.value);
    const newAssets = [
      { tokenId: ctx.projectNftId, amount: newAPTAmount },
      { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens },
    ];

    if (!ctx.isErgMode) {
      const currentBase = BigInt(
        refundReadyBox.assets.find((a) => a.tokenId === ctx.baseTokenId)?.amount || 0n
      );
      newAssets.push({ tokenId: ctx.baseTokenId, amount: currentBase - refundValue });
    } else {
      newValue -= refundValue;
    }

    const contractOutputBuilder = new OutputBuilder(newValue, ctx.beneErgoTree)
      .addTokens(newAssets)
      .setAdditionalRegisters({
        ...refundReadyBox.additionalRegisters,
        // ATTACK: Refund Counter (R6[1]) inflated to 1,000,000
        // It should be: Sold - Refunded
        // If Refunded is huge, (Sold - Refunded) becomes negative and the formula adds up.
        R6: SColl(SLong, [soldAmount, 1_000_000n, 0n]).toHex(),
      });

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([refundReadyBox, ...ctx.buyer.utxos.toArray()])
      .to([
        contractOutputBuilder,
        new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.buyer.address).addTokens([
          ...(ctx.isErgMode ? [] : [{ tokenId: ctx.baseTokenId, amount: refundValue }]),
        ]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });
    expect(result).toBe(false); // Fails due to incrementRefundCounterCorrectly
  });
});
