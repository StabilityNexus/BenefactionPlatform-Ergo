import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import { setupBeneTestContext, ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME, type BeneTestContext, USD_BASE_TOKEN, USD_BASE_TOKEN_NAME, createR4 } from "./bene_contract_helpers";

// This test demonstrates a bug in contract_v2.es: during withdrawFunds, the contract allows moving arbitrary extra tokens
// that were previously injected into the SELF box, as long as APT and PFT remain constant and the base-token amounts are correct.
// Expected behavior: Only the base token (ERG or configured token) should be extracted; any unrelated tokens on the contract
// must remain on the replicated SELF box.
// Current behavior: The contract does not restrict removal of unrelated tokens in withdrawFunds, enabling owner to sweep them.
// This test is intentionally written to expect failure (result === false). It currently passes under the buggy contract,
// therefore the test will FAIL, proving the issue.

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Withdraw funds should NOT move unrelated tokens (%s)", (mode) => {
  let ctx: BeneTestContext;  // Test environment
  let projectBox: Box;  // Contract box
  let soldTokens: bigint;
  let collectedFunds: bigint;

  describe("Withdraw funds while attempting to sweep an unrelated token", () => {
    beforeEach(() => {
      // Initialize context
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // Owner funded for tx fees
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n });

      // Prepare a project box with MINIMUM REACHED
      soldTokens = ctx.minimumTokensSold;
      collectedFunds = soldTokens * ctx.exchangeRate;

      // Inject a foreign token into the contract box (not baseTokenId, not pftTokenId)
      const foreignTokenId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 64-hex fake token id

      let assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: foreignTokenId, amount: 100n }, // unrelated token present on the contract
      ];

      let value = SAFE_MIN_BOX_VALUE;

      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        value += collectedFunds;
        collectedFunds = value; // include SAFE_MIN_BOX_VALUE
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
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

    it("should fail when withdraw attempts to move a foreign token from the contract", () => {
      // Compute expected split
      const withdrawAmount = ctx.isErgMode ? (collectedFunds - SAFE_MIN_BOX_VALUE) / 2n : collectedFunds / 2n;
      const devFeeAmount = (withdrawAmount * BigInt(ctx.devFeePercentage)) / 100n;
      const projectAmount = withdrawAmount - devFeeAmount;
      const devFeeContract = compile(`{ sigmaProp(true) }`);

      // Build outputs with partial withdraw (replicate SELF) and sweep the foreign token to owner
      let remainingValue: bigint;
      let remainingAssets: { tokenId: string; amount: bigint }[];
      let projectValue: bigint;
      let projectAssets: { tokenId: string; amount: bigint }[];
      let devFeeValue: bigint;
      let devFeeAssets: { tokenId: string; amount: bigint }[];

      const foreignTokenIdOnSelf = projectBox.assets.find(t => t.tokenId !== ctx.projectNftId && t.tokenId !== ctx.pftTokenId && t.tokenId !== ctx.baseTokenId)?.tokenId!;
      const foreignTokenAmountOnSelf = projectBox.assets.find(t => t.tokenId === foreignTokenIdOnSelf)?.amount ?? 0n;

      if (ctx.isErgMode) {
        // ERG mode: decrease ERG on SELF, move ERG to project/dev, and also move foreign token to project
        remainingValue = collectedFunds - withdrawAmount; // keep remainder on self
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount }, // keep APT
          // NOTE: we DO NOT keep the foreign token on SELF; we will try to move it out
        ];

        projectValue = projectAmount;
        projectAssets = [];

        devFeeValue = devFeeAmount;
        devFeeAssets = [];
      } else {
        // Token mode: keep half base tokens on SELF, move half to project/dev, and also move foreign token to project
        remainingValue = SAFE_MIN_BOX_VALUE;
        remainingAssets = [
          { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
          { tokenId: ctx.baseTokenId, amount: collectedFunds - withdrawAmount },
          // NOTE: we DO NOT keep the foreign token on SELF; we will try to move it out
        ];

        projectValue = SAFE_MIN_BOX_VALUE;
        projectAssets = [
          { tokenId: ctx.baseTokenId, amount: projectAmount },
          // BUG: Also extracting unrelated token to owner
          { tokenId: foreignTokenIdOnSelf, amount: foreignTokenAmountOnSelf },
        ];

        devFeeValue = SAFE_MIN_BOX_VALUE;
        devFeeAssets = [
          { tokenId: ctx.baseTokenId, amount: devFeeAmount },
        ];
      }

      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()])
        .to([
          // Output 0: Replicated SELF with updated funds (but foreign token removed)
          new OutputBuilder(remainingValue, ctx.beneErgoTree)
            .addTokens(remainingAssets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, ctx.totalPFTokens]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Project
          new OutputBuilder(projectValue, ctx.projectOwner.address).addTokens(projectAssets),
          // Output 2: Dev fee
          new OutputBuilder(devFeeValue, devFeeContract).addTokens(devFeeAssets),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner], throw: false });

      // EXPECTED: The contract should reject removing unrelated tokens from SELF during withdraw
      // ACTUAL: The contract currently allows it (APT and PFT remain constant; base token amounts are correct)
      expect(result).toBe(false);
    });
  });
});