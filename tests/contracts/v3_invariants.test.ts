import { describe, it, expect, beforeEach } from "vitest";
import type { Box } from "@fleet-sdk/core";
import { OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { createR8Structure } from "$lib/common/project";
import {
  setupBeneV3TestContext,
  createR4,
  devFeeOf,
  uint8ArrayToHex,
  TERMINAL_CONTRACT,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  type BeneV3TestContext,
} from "./bene_v3_helpers";
import { blake2b256 } from "@fleet-sdk/crypto";

const METADATA = SColl(SByte, stringToBytes("utf8", "{}")).toHex();

// The two invariants v3 adds, and the three ways v2 let them be broken:
//
//   #174  a copy of the contract at any index other than 0 escaped every replication guard;
//   #176  identity was the APT, which circulates, so anybody holding one could impersonate a project;
//   #177  isWithdrawUnsoldTokens could terminate, which made mantainValue vacuous and let the owner
//         take the balance without paying the fee; and the fee itself truncated to zero on small
//         enough withdrawals of a token campaign.
describe("Bene Contract v3 - replication and identity invariants", () => {
  let ctx: BeneV3TestContext;
  let projectBox: Box;
  let soldTokens: bigint;
  let collectedFunds: bigint;
  let remainingAPT: bigint;
  let unsoldPFT: bigint;

  /** A campaign past its minimum, with PFT still in the box. */
  function fundedProject(withPFT: bigint) {
    soldTokens = ctx.minimumTokensSold;
    remainingAPT = 1n + ctx.totalPFTokens - soldTokens;
    collectedFunds = SAFE_MIN_BOX_VALUE + soldTokens * ctx.exchangeRate;
    unsoldPFT = withPFT;

    const assets: { tokenId: string; amount: bigint }[] = [
      { tokenId: ctx.projectNftId, amount: 1n },
      { tokenId: ctx.aptTokenId, amount: remainingAPT },
    ];
    if (withPFT > 0n) assets.push({ tokenId: ctx.pftTokenId, amount: withPFT });

    ctx.beneContract.addUTxOs({
      value: collectedFunds,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets,
      creationHeight: ctx.mockChain.height - 100,
      additionalRegisters: {
        R4: createR4(ctx),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        // sold, refunded, exchanged. Everything sold has been exchanged for PFT already,
        // which is the ordinary end state of a successful campaign.
        R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
        R7: SLong(ctx.exchangeRate).toHex(),
        R8: ctx.constants.toHex(),
        R9: METADATA,
      },
    });

    projectBox = ctx.beneContract.utxos.toArray()[0];
  }

  /** The box the NFT has to end up in when the campaign closes. */
  function terminalBox(ctx: BeneV3TestContext) {
    return new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT)
      .addTokens([{ tokenId: ctx.projectNftId, amount: 1n }]);
  }

  describe("ERG campaign", () => {
    beforeEach(() => {
      ctx = setupBeneV3TestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });
    });

    // ===== #174: a clone anywhere in the outputs kills the transaction =====

    it("should allow a legitimate full withdrawal that retires the NFT", () => {
      fundedProject(0n);
      const spender = ctx.buyer;
      const devFeeAmount = devFeeOf(collectedFunds, ctx.devFeePercentage);
      const projectAmount = collectedFunds - devFeeAmount;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(projectAmount, ctx.projectOwner.address),
          new OutputBuilder(devFeeAmount, ctx.devFeeContract),
          terminalBox(ctx),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(true);
    });

    it("should not allow a withdrawal to recreate the contract outside OUTPUTS(0)", () => {
      // The transaction #174 walks through, rebuilt against v3. The owner and the dev fee are
      // paid exactly what the contract asks; the theft is in what is left behind.
      fundedProject(0n);
      const spender = ctx.buyer;
      const devFeeAmount = devFeeOf(collectedFunds, ctx.devFeePercentage);
      const projectAmount = collectedFunds - devFeeAmount;

      const rogueConstants = createR8Structure({
        owner: spender.address.ergoTree,
        dev_hash: uint8ArrayToHex(blake2b256(ctx.devFeeContract.bytes)),
        dev_fee: ctx.devFeePercentage,
        pft_token_id: ctx.pftTokenId,
        base_token_id: ctx.baseTokenId,
      });

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(projectAmount, ctx.projectOwner.address),
          new OutputBuilder(devFeeAmount, ctx.devFeeContract),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n },
              { tokenId: ctx.aptTokenId, amount: remainingAPT },
            ])
            .setAdditionalRegisters({
              R4: createR4(ctx),
              R5: SLong(0n).toHex(),
              R6: SColl(SLong, [0n, 0n, ctx.totalPFTokens]).toHex(),
              R7: SLong(1n).toHex(),
              R8: rogueConstants.toHex(),
              R9: METADATA,
            }),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(false);
    });

    it("should not allow a second copy of the contract alongside a valid replica", () => {
      // The general form: even when OUTPUTS(0) is a perfectly valid replica, a second box with
      // the same script may not ride along. In v2 this made isReplicationBoxPresent false and
      // emptied every guard; here replicas.size <= 1 rejects it outright.
      fundedProject(0n);
      const spender = ctx.buyer;
      const partial = 1_000_000_000n;
      const devFeeAmount = devFeeOf(partial, ctx.devFeePercentage);
      const projectAmount = partial - devFeeAmount;

      const replica = new OutputBuilder(collectedFunds - partial, ctx.beneErgoTree)
        .addTokens([
          { tokenId: ctx.projectNftId, amount: 1n },
          { tokenId: ctx.aptTokenId, amount: remainingAPT },
        ])
        .setAdditionalRegisters({
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: METADATA,
        });

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          replica,
          new OutputBuilder(projectAmount, ctx.projectOwner.address),
          new OutputBuilder(devFeeAmount, ctx.devFeeContract),
          // A second box with the contract script, carrying nothing of consequence.
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree).setAdditionalRegisters({
            R4: createR4(ctx),
            R5: SLong(0n).toHex(),
            R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
            R7: SLong(1n).toHex(),
            R8: ctx.constants.toHex(),
            R9: METADATA,
          }),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(false);
    });

    // ===== #176: the identity cannot leave, be duplicated or be dropped =====

    it("should not allow terminating without retiring the NFT", () => {
      // Everything paid correctly, but the NFT goes to the spender's change instead of a box
      // nobody can spend. That is what lets a closed campaign be resurrected later.
      fundedProject(0n);
      const spender = ctx.buyer;
      const devFeeAmount = devFeeOf(collectedFunds, ctx.devFeePercentage);
      const projectAmount = collectedFunds - devFeeAmount;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(projectAmount, ctx.projectOwner.address),
          new OutputBuilder(devFeeAmount, ctx.devFeeContract),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(false);
    });

    it("should not allow a replica that drops the NFT", () => {
      fundedProject(0n);
      const spender = ctx.buyer;
      const partial = 1_000_000_000n;
      const devFeeAmount = devFeeOf(partial, ctx.devFeePercentage);
      const projectAmount = partial - devFeeAmount;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(collectedFunds - partial, ctx.beneErgoTree)
            // NFT missing: only the APT is carried over.
            .addTokens([{ tokenId: ctx.aptTokenId, amount: remainingAPT }])
            .setAdditionalRegisters({
              R4: createR4(ctx),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: ctx.constants.toHex(),
              R9: METADATA,
            }),
          new OutputBuilder(projectAmount, ctx.projectOwner.address),
          new OutputBuilder(devFeeAmount, ctx.devFeeContract),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(false);
    });

    // ===== #177 path 1: isWithdrawUnsoldTokens can no longer terminate =====

    it("should not let the owner terminate through isWithdrawUnsoldTokens and keep the funds", () => {
      // The exact scenario of #177: a campaign that did not sell its whole emission, whose APT
      // have all been exchanged. In v2 the owner signs, takes the unsold PFT and the whole ERG
      // balance in one transaction, and the platform is paid nothing.
      fundedProject(20_000n);
      const owner = ctx.projectOwner;

      // The NFT is retired properly, so the identity invariant is satisfied and the only thing
      // standing between the owner and the money is isWithdrawUnsoldTokens having to replicate.
      // Without that, mantainValue is vacuous and nothing constrains the balance.
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...owner.utxos.toArray()])
        .to([
          // Everything the box held, straight to the owner. No replica, no dev fee.
          new OutputBuilder(collectedFunds, owner.address)
            .addTokens([
              { tokenId: ctx.aptTokenId, amount: remainingAPT },
              { tokenId: ctx.pftTokenId, amount: unsoldPFT },
            ]),
          terminalBox(ctx),
        ])
        .sendChangeTo(owner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [owner], throw: false })).toBe(false);
    });

    it("should still allow the owner to withdraw unsold tokens while replicating", () => {
      // The positive control for the change above: the same withdrawal, replicating as it must.
      fundedProject(20_000n);
      const owner = ctx.projectOwner;
      const withdrawn = 5_000n;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...owner.utxos.toArray()])
        .to([
          new OutputBuilder(collectedFunds, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n },
              { tokenId: ctx.aptTokenId, amount: remainingAPT },
              { tokenId: ctx.pftTokenId, amount: unsoldPFT - withdrawn },
            ])
            .setAdditionalRegisters({
              R4: createR4(ctx),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: ctx.constants.toHex(),
              R9: METADATA,
            }),
        ])
        .sendChangeTo(owner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [owner], throw: false })).toBe(true);
    });
  });

  // ===== #177 path 2: the fee cannot be truncated away =====

  describe("token campaign", () => {
    beforeEach(() => {
      ctx = setupBeneV3TestContext(USD_BASE_TOKEN, USD_BASE_TOKEN_NAME);
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });
    });

    function fundedTokenProject() {
      soldTokens = ctx.minimumTokensSold;
      remainingAPT = 1n + ctx.totalPFTokens - soldTokens;
      collectedFunds = soldTokens * ctx.exchangeRate;

      ctx.beneContract.addUTxOs({
        value: SAFE_MIN_BOX_VALUE,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n },
          { tokenId: ctx.aptTokenId, amount: remainingAPT },
          { tokenId: ctx.baseTokenId, amount: collectedFunds },
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: METADATA,
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    }

    it("should not allow a withdrawal small enough to round the dev fee to zero", () => {
      // 19 units at 5%: v2 computed 19 * 5 / 100 = 0 and the dev fee box was accepted with no
      // tokens at all, so the whole balance could be taken out 19 units at a time for free.
      fundedTokenProject();
      const spender = ctx.buyer;
      const extracted = 19n;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n },
              { tokenId: ctx.aptTokenId, amount: remainingAPT },
              { tokenId: ctx.baseTokenId, amount: collectedFunds - extracted },
            ])
            .setAdditionalRegisters({
              R4: createR4(ctx),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: ctx.constants.toHex(),
              R9: METADATA,
            }),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.projectOwner.address)
            .addTokens([{ tokenId: ctx.baseTokenId, amount: extracted }]),
          // The dev fee box v2 accepted: no base tokens whatsoever, because 0 == 0.
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.devFeeContract),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(false);
    });

    it("should allow the same small withdrawal once the rounded-up fee is paid", () => {
      // The positive control: 19 units extracted, 1 unit of fee - which is what rounding up asks
      // for - and the transaction goes through.
      fundedTokenProject();
      const spender = ctx.buyer;
      const extracted = 19n;
      const devFeeAmount = devFeeOf(extracted, ctx.devFeePercentage);
      const projectAmount = extracted - devFeeAmount;

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...spender.utxos.toArray()])
        .to([
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: 1n },
              { tokenId: ctx.aptTokenId, amount: remainingAPT },
              { tokenId: ctx.baseTokenId, amount: collectedFunds - extracted },
            ])
            .setAdditionalRegisters({
              R4: createR4(ctx),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: ctx.constants.toHex(),
              R9: METADATA,
            }),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.projectOwner.address)
            .addTokens([{ tokenId: ctx.baseTokenId, amount: projectAmount }]),
          new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.devFeeContract)
            .addTokens([{ tokenId: ctx.baseTokenId, amount: devFeeAmount }]),
        ])
        .sendChangeTo(spender.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      expect(ctx.mockChain.execute(transaction, { signers: [spender], throw: false })).toBe(true);
    });
  });
});
