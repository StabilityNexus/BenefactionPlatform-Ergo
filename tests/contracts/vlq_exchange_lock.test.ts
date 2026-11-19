import { describe, it, expect, beforeEach } from "vitest";
import { OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import type { Box } from "@fleet-sdk/core";
import { SByte, SColl, SLong, serializeBox } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  createR4,
  type BeneTestContext,
} from "./bene_contract_helpers";

function minErgForOutputs(
  height: number,
  inputs: Box[],
  changeAddr: string,
  makeOutputs: (v: bigint) => OutputBuilder[]
): bigint {
 const tx = new TransactionBuilder(height)
  .from(inputs)
  .to(makeOutputs(SAFE_MIN_BOX_VALUE))
  .sendChangeTo(changeAddr)
  .payFee(RECOMMENDED_MIN_FEE_VALUE)
  .build();
return BigInt(serializeBox(tx.outputs[0]).length) * 360n;
}

describe("Bene Contract v2 - ZigZag VLQ box-growth PFT redemption lock (#78)", () => {
  let ctx: BeneTestContext;
  let drainedBox: Box;
  let drainedMinVal: bigint;
  const redeemAPT = 50_000n;

  beforeEach(() => {
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);
    ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });
    ctx.buyer.addUTxOs({
      value: 10_000_000_000n,
      ergoTree: ctx.buyer.address.ergoTree,
      assets: [{ tokenId: ctx.projectNftId, amount: redeemAPT }],
      creationHeight: ctx.mockChain.height - 20,
      additionalRegisters: {},
    });

    const sold = ctx.totalPFTokens;
    ctx.beneContract.addUTxOs({
      value: SAFE_MIN_BOX_VALUE + sold * ctx.exchangeRate,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [
        { tokenId: ctx.projectNftId, amount: 1n },
        { tokenId: ctx.pftTokenId, amount: sold },
      ],
      creationHeight: ctx.mockChain.height - 50,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        R6: SColl(SLong, [sold, 0n, 0n]).toHex(),
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    const fundedBox = ctx.beneContract.utxos.toArray()[0];
    const devFee = compile(`{ sigmaProp(true) }`);
    const makeWithdraw = (v: bigint) => {
      const ext = BigInt(fundedBox.value) - v;
      const fee = (ext * BigInt(ctx.devFeePercentage)) / 100n;
      return [
        new OutputBuilder(v, ctx.beneErgoTree)
          .addTokens([
            { tokenId: ctx.projectNftId, amount: 1n },
            { tokenId: ctx.pftTokenId, amount: sold },
          ])
          .setAdditionalRegisters({ ...fundedBox.additionalRegisters }),
        new OutputBuilder(ext - fee, ctx.projectOwner.address),
        new OutputBuilder(fee, devFee),
      ];
    };

    const wInputs = [fundedBox, ...ctx.projectOwner.utxos.toArray()];
    drainedMinVal = minErgForOutputs(ctx.mockChain.height, wInputs, ctx.projectOwner.address.toString(), makeWithdraw);
    const wTx = new TransactionBuilder(ctx.mockChain.height)
      .from(wInputs)
      .to(makeWithdraw(drainedMinVal))
      .sendChangeTo(ctx.projectOwner.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();
    expect(ctx.mockChain.execute(wTx, { signers: [ctx.projectOwner], throw: false })).toBe(true);
    drainedBox = ctx.beneContract.utxos.toArray()[0];
  });

  it("allows exchanging <= 62 APT when ZigZag VLQ size does not grow (positive control)", () => {
    const small = 50n;
    const tx = new TransactionBuilder(ctx.mockChain.height)
      .from([drainedBox, ...ctx.buyer.utxos.toArray()])
      .to([
        new OutputBuilder(drainedMinVal, ctx.beneErgoTree)
          .addTokens([
            { tokenId: ctx.projectNftId, amount: 1n + small },
            { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens - small },
          ])
          .setAdditionalRegisters({
            ...drainedBox.additionalRegisters,
            R6: SColl(SLong, [ctx.totalPFTokens, 0n, small]).toHex(),
          }),
        new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.buyer.address).addTokens([{ tokenId: ctx.pftTokenId, amount: small }]),
      ])
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();
    expect(ctx.mockChain.execute(tx, { signers: [ctx.buyer], throw: false })).toBe(true);
  });

  it("allows exchanging >= 64 APT in ERG Mode by topping up +1440 nanoERG VLQ byte growth", () => {
    const inputs = [drainedBox, ...ctx.buyer.utxos.toArray()];
    const makeRedeem = (v: bigint) => [
      new OutputBuilder(v, ctx.beneErgoTree)
        .addTokens([
          { tokenId: ctx.projectNftId, amount: 1n + redeemAPT },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens - redeemAPT },
        ])
        .setAdditionalRegisters({
          ...drainedBox.additionalRegisters,
          R6: SColl(SLong, [ctx.totalPFTokens, 0n, redeemAPT]).toHex(),
        }),
      new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.buyer.address).addTokens([{ tokenId: ctx.pftTokenId, amount: redeemAPT }]),
    ];

    const grownMinVal = minErgForOutputs(ctx.mockChain.height, inputs, ctx.buyer.address.toString(), makeRedeem);
    expect(grownMinVal - drainedMinVal).toBe(1_440n);

    const tx = new TransactionBuilder(ctx.mockChain.height)
      .from(inputs)
      .to(makeRedeem(grownMinVal))
      .sendChangeTo(ctx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();
    expect(ctx.mockChain.execute(tx, { signers: [ctx.buyer], throw: false })).toBe(true);
  });

  it("allows exchanging >= 64 APT in Token Mode when box starts at minimum ERG", () => {
    const tCtx = setupBeneTestContext(USD_BASE_TOKEN, USD_BASE_TOKEN_NAME);
    tCtx.buyer.addUTxOs({
      value: 10_000_000_000n,
      ergoTree: tCtx.buyer.address.ergoTree,
      assets: [{ tokenId: tCtx.projectNftId, amount: redeemAPT }],
      creationHeight: tCtx.mockChain.height - 20,
      additionalRegisters: {},
    });
    const regs = {
      R4: createR4(tCtx),
      R5: SLong(tCtx.minimumTokensSold).toHex(),
      R6: SColl(SLong, [tCtx.totalPFTokens, 0n, 0n]).toHex(),
      R7: SLong(tCtx.exchangeRate).toHex(),
      R8: tCtx.constants.toHex(),
      R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
    };
    tCtx.beneContract.addUTxOs({
      value: SAFE_MIN_BOX_VALUE,
      ergoTree: tCtx.beneErgoTree.toHex(),
      assets: [
        { tokenId: tCtx.projectNftId, amount: 1n },
        { tokenId: tCtx.pftTokenId, amount: tCtx.totalPFTokens },
      ],
      creationHeight: tCtx.mockChain.height - 30,
      additionalRegisters: regs,
    });
    const seed = tCtx.beneContract.utxos.toArray()[0];
    const baseMin = minErgForOutputs(tCtx.mockChain.height, [seed, ...tCtx.buyer.utxos.toArray()], tCtx.buyer.address.toString(), (v) => [
      new OutputBuilder(v, tCtx.beneErgoTree)
        .addTokens([
          { tokenId: tCtx.projectNftId, amount: 1n },
          { tokenId: tCtx.pftTokenId, amount: tCtx.totalPFTokens },
        ])
        .setAdditionalRegisters(regs),
    ]);

    tCtx.beneContract.utxos.clear();
    tCtx.beneContract.addUTxOs({
      value: baseMin,
      ergoTree: tCtx.beneErgoTree.toHex(),
      assets: [
        { tokenId: tCtx.projectNftId, amount: 1n },
        { tokenId: tCtx.pftTokenId, amount: tCtx.totalPFTokens },
      ],
      creationHeight: tCtx.mockChain.height - 10,
      additionalRegisters: regs,
    });
    const tBox = tCtx.beneContract.utxos.toArray()[0];
    const inputs = [tBox, ...tCtx.buyer.utxos.toArray()];
    const makeTokenRedeem = (v: bigint) => [
      new OutputBuilder(v, tCtx.beneErgoTree)
        .addTokens([
          { tokenId: tCtx.projectNftId, amount: 1n + redeemAPT },
          { tokenId: tCtx.pftTokenId, amount: tCtx.totalPFTokens - redeemAPT },
        ])
        .setAdditionalRegisters({ ...regs, R6: SColl(SLong, [tCtx.totalPFTokens, 0n, redeemAPT]).toHex() }),
      new OutputBuilder(SAFE_MIN_BOX_VALUE, tCtx.buyer.address).addTokens([{ tokenId: tCtx.pftTokenId, amount: redeemAPT }]),
    ];

    const grownMin = minErgForOutputs(tCtx.mockChain.height, inputs, tCtx.buyer.address.toString(), makeTokenRedeem);
    expect(grownMin - baseMin).toBe(1_440n);
    const tx = new TransactionBuilder(tCtx.mockChain.height)
      .from(inputs)
      .to(makeTokenRedeem(grownMin))
      .sendChangeTo(tCtx.buyer.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();
    expect(tCtx.mockChain.execute(tx, { signers: [tCtx.buyer], throw: false })).toBe(true);
  });
});
