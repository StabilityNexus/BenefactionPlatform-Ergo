import { describe, it, expect, beforeEach } from "vitest";
import {
  Box,
  OutputBuilder,
  TransactionBuilder,
  RECOMMENDED_MIN_FEE_VALUE,
  ErgoTree,
} from "@fleet-sdk/core";
import { SByte, SColl, SLong } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  USD_BASE_TOKEN,
  USD_BASE_TOKEN_NAME,
  createR4,
} from "./bene_contract_helpers";
import { compile } from "@fleet-sdk/compiler";

const baseModes = [
  { name: "USD Token Mode", token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: "ERG Mode", token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)("Bene Contract v1.2 - Add Tokens (%s)", (mode) => {
  describe("Adds more tokens", () => {
    let ctx: BeneTestContext;
    let projectBox: Box;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

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
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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
              {
                tokenId: ctx.pftTokenId,
                amount: BigInt(projectBox.assets[1].amount) + tokensToAdd,
              },
            ])
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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

  describe("Adds tokens to a contract that doesn't have any PFT", () => {
    let ctx: BeneTestContext;
    let projectBox: Box;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [{ tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens }],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should allow project owner to add more PFT tokens", () => {
      // Arrange
      const tokensToAdd = 50_000n;
      const newPFTAmount = tokensToAdd;

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
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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
              { tokenId: ctx.pftTokenId, amount: tokensToAdd },
            ])
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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

  describe("Adds more tokens with complex owner script authorization", () => {
    let ctx: BeneTestContext;
    let projectBox: Box;
    let ownerContract: ErgoTree;

    beforeEach(() => {
      ownerContract = compile(`{ sigmaProp(HEIGHT > 1) }`);

      ctx = setupBeneTestContext(mode.token, mode.tokenName, ownerContract.toAddress());

      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens },
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT
        ],
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes("utf8", "{}")).toHex(),
        },
      });

      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it("should allow project owner to add more PFT tokens", () => {
      const customOwnerContract = ctx.mockChain.addParty(
        ownerContract.toAddress().ergoTree,
        `Custom owner contract`
      );
      customOwnerContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE,
        ergoTree: ownerContract.toAddress().ergoTree,
        creationHeight: ctx.mockChain.height - 100,
        assets: [],
        additionalRegisters: {},
      });
      const ownerScriptBox = customOwnerContract.utxos.toArray()[0]; // TODO CHECK - This box is omitted by the transaction in both cases (ERG and USD)

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
        .from([projectBox, ownerTokenBox, ownerScriptBox])
        .to([
          // Output 0: Updated contract with more PFT
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens([
              { tokenId: ctx.projectNftId, amount: projectBox.assets[0].amount },
              { tokenId: ctx.pftTokenId, amount: newPFTAmount },
            ])
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
              R7: SLong(ctx.exchangeRate).toHex(),
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
  });
});
