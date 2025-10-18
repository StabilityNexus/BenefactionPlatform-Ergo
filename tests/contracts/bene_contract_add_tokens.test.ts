import { describe, it, expect, beforeEach } from "vitest";
import { Box, OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { SByte, SColl, SInt, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import { setupBeneTestContext, BASE_TOKEN, BASE_TOKEN_NAME, type BeneTestContext } from "./bene_contract_helpers";

describe("Bene Contract v1.2 - Add Tokens", () => {
  let ctx: BeneTestContext;
  let projectBox: Box;

  beforeEach(() => {
    // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(BASE_TOKEN, BASE_TOKEN_NAME);

    // Create project box with some tokens sold
    const soldTokens = 10_000n;

    ctx.beneContract.addUTxOs({
      value: RECOMMENDED_MIN_FEE_VALUE + soldTokens * ctx.exchangeRate,
      ergoTree: ctx.beneErgoTree.toHex(),
      assets: [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT
      ],
      creationHeight: ctx.mockChain.height - 100,
      additionalRegisters: {
        R4: SInt(ctx.deadlineBlock).toHex(),
        R5: SLong(ctx.minimumTokensSold).toHex(),
        R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
        R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
        R8: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
      },
    });

    projectBox = ctx.beneContract.utxos.toArray()[0];
  });

  describe("Add PFT Tokens", () => {
    it("should allow project owner to add more PFT tokens", () => {
      // Arrange
      const tokensToAdd = 50_000n;
      const newPFTAmount = BigInt(projectBox.assets[1].amount) + tokensToAdd;

      // Owner has PFT tokens to add
      ctx.projectOwner.addUTxOs({
        value: 10_000_000_000n, // ERG for fees
        ergoTree: ctx.projectOwner.address.ergoTree,
        assets: [{ tokenId: ctx.pftTokenId, amount: tokensToAdd }],
        creationHeight: ctx.mockChain.height - 50,
        additionalRegisters: {},
      });

      const ownerTokenBox = ctx.projectOwner.utxos
        .toArray()
        .find((box) => box.assets.some((a) => a.tokenId === ctx.pftTokenId))!;

      // Act
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, ownerTokenBox])
        .to([
          // Output 0: Updated contract with more PFT
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
              { tokenId: ctx.pftTokenId, amount: newPFTAmount },
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      // Assert
      expect(result).toBe(true);
      expect(ctx.beneContract.utxos.length).toEqual(1);

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      expect(updatedBox.assets[1].amount).toEqual(newPFTAmount);
    });

    it("should fail when non-owner tries to add tokens", () => {
      // Arrange
      const tokensToAdd = 50_000n;

      // Buyer (non-owner) tries to add tokens
      ctx.buyer.addUTxOs({
        value: 10_000_000_000n,
        ergoTree: ctx.buyer.address.ergoTree,
        assets: [{ tokenId: ctx.pftTokenId, amount: tokensToAdd }],
        creationHeight: ctx.mockChain.height - 50,
        additionalRegisters: {},
      });

      const buyerTokenBox = ctx.buyer.utxos
        .toArray()
        .find((box) => box.assets.some((a) => a.tokenId === ctx.pftTokenId))!;

      // Act
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        .from([projectBox, buyerTokenBox])
        .to([
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
              { tokenId: ctx.pftTokenId, amount: BigInt(projectBox.assets[1].amount) + tokensToAdd },
            ])
            .setAdditionalRegisters({
              R4: SInt(ctx.deadlineBlock).toHex(),
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),
              R7: SColl(SLong, [ctx.exchangeRate, ctx.baseTokenIdLen]).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
        ])
        .sendChangeTo(ctx.buyer.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false });

      // Assert
      expect(result).toBe(false); // Should fail - not owner
    });
  });
});
