import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import { blake2b256 } from "@fleet-sdk/crypto";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  uint8ArrayToHex,
  createR4,
  type BeneTestContext,
} from "./bene_contract_helpers";
import { createR8Structure } from "$lib/common/project";

// The contract decides whether it is being replicated by looking at OUTPUTS(0) only:
//
//   val isReplicationBoxPresent = OUTPUTS.size > 0 && OUTPUTS(0).propositionBytes == selfScript
//
// Every "remains constant" guard is written as `!isReplicationBoxPresent || (...)`, so when the
// recreated contract box sits at any index other than 0 they are all vacuously true.
//
// isWithdrawUnsoldTokens defends against that: its endOrReplicate asks
// `OUTPUTS.exists(_.propositionBytes == SELF.propositionBytes) == false`, which sees a clone at
// any index. isWithdrawFunds does not - it only asks whether the funds and tokens are gone:
//
//   val endOrReplicate = { ... isSelfReplication || allFundsWithdrawn && allTokensWithdrawn }
//
// so a withdrawal that pays the owner and the dev fee correctly can, in the same transaction,
// mint a fresh box with the same script and the project NFT, carrying registers of the spender's
// choosing: their own owner ErgoTree in R8, their own exchange rate in R7, and an exchange
// counter in R6 large enough to make every remaining APT look sellable.
describe("Bene Contract v2 - self-replication guard", () => {
  let ctx: BeneTestContext;
  let projectBox: Box;
  let soldTokens: bigint;
  let collectedFunds: bigint;
  let remainingAPT: bigint;

  beforeEach(() => {
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);
    ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });

    // A campaign that succeeded and whose PFT have all been exchanged for their APT.
    // This is the same starting state as the "full withdraw" case in withdraw_funds.test.ts:
    // the contract holds the project NFT plus unsold APT, the raised ERG, and no PFT.
    soldTokens = ctx.minimumTokensSold;
    remainingAPT = 1n + ctx.totalPFTokens - soldTokens;
    collectedFunds = SAFE_MIN_BOX_VALUE + soldTokens * ctx.exchangeRate;

    ctx.beneContract.addUTxOs({
      value: collectedFunds,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [{ tokenId: ctx.projectNftId, amount: remainingAPT }],
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

  it("should not allow a withdrawal to recreate the contract outside OUTPUTS(0)", () => {
    // Anyone can trigger isWithdrawFunds - it carries no owner authentication by design,
    // since the funds are forced to the owner's ErgoTree. Here the spender is not the owner.
    const spender = ctx.buyer;
    const devFeeContract = compile(`{ sigmaProp(true) }`);

    const devFeeAmount = (collectedFunds * BigInt(ctx.devFeePercentage)) / 100n;
    const projectAmount = collectedFunds - devFeeAmount;

    // The clone's constants: the spender puts their own address in as the project owner.
    const rogueConstants = createR8Structure({
      owner: spender.address.ergoTree,
      dev_hash: uint8ArrayToHex(blake2b256(devFeeContract.bytes)),
      dev_fee: ctx.devFeePercentage,
      pft_token_id: ctx.pftTokenId,
      base_token_id: ctx.baseTokenId,
    });

    const transaction = new TransactionBuilder(ctx.mockChain.height)
      .from([projectBox, ...spender.utxos.toArray()])
      .to([
        // Output 0: the owner is paid exactly what the contract requires
        new OutputBuilder(projectAmount, ctx.projectOwner.address),
        // Output 1: the dev fee contract is paid exactly what the contract requires
        new OutputBuilder(devFeeAmount, devFeeContract),
        // Output 2: a clone of the contract, holding the project NFT and the unsold APT.
        // Because it is not at index 0, isReplicationBoxPresent is false and not one of
        // sameId / sameConstants / sameExchangeRate / the counter guards is evaluated.
        new OutputBuilder(SAFE_MIN_BOX_VALUE, ctx.beneErgoTree)
          .addTokens([{ tokenId: ctx.projectNftId, amount: remainingAPT }])
          .setAdditionalRegisters({
            R4: createR4(ctx),
            R5: SLong(0n).toHex(),                                      // no minimum to reach
            R6: SColl(SLong, [0n, 0n, ctx.totalPFTokens]).toHex(),      // counters reset
            R7: SLong(1n).toHex(),                                      // spender's own rate
            R8: rogueConstants.toHex(),                                 // spender's own owner address
            R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
          }),
      ])
      .sendChangeTo(spender.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    const result = ctx.mockChain.execute(transaction, { signers: [spender], throw: false });

    // The contract should refuse: it is being recreated, so the replication rules have to hold.
    // Today it accepts, and the project NFT ends up in a box whose owner, rate and counters were
    // chosen by whoever spent it - while the legitimate owner is paid in full and sees nothing wrong.
    expect(result).toBe(false);
  });
});
