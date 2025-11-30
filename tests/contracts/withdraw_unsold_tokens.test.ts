import { describe, it, expect, beforeEach } from 'vitest';
import {
  Box,
  OutputBuilder,
  TransactionBuilder,
  RECOMMENDED_MIN_FEE_VALUE,
  ErgoTree,
} from '@fleet-sdk/core';
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
import { compile } from '@fleet-sdk/compiler';

// EXECUTION FLOW:
// Owner can withdraw unsold PFT tokens at any time

const baseModes = [
  { name: 'USD Token Mode', token: USD_BASE_TOKEN, tokenName: USD_BASE_TOKEN_NAME },
  { name: 'ERG Mode', token: ERG_BASE_TOKEN, tokenName: ERG_BASE_TOKEN_NAME },
];

describe.each(baseModes)('Bene Contract v1.2 - Withdraw Unsold Tokens (%s)', (mode) => {
  describe('Withdraw Unsold Tokens with any APT sold exchanged for PFTs', () => {
    let ctx: BeneTestContext;
    let projectBox: Box; // Contract box
    let soldTokens: bigint;
    let collectedFunds: bigint;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Create project box with partial token sales
      soldTokens = ctx.totalPFTokens / 2n; // Half of the total PFTs has been sold.
      collectedFunds = soldTokens * ctx.exchangeRate;

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
      ];

      let value = RECOMMENDED_MIN_FEE_VALUE;

      // Handle collected funds based on mode
      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        // ERG Mode: Add funds to the box value
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 2: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow withdrawing unsold PFT tokens', () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log('\n🏦 WITHDRAW UNSOLD TOKENS:');
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
      ];
      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      }

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens(assets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [soldTokens, 0n, 0n]).toHex(), // Counters unchanged
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(1); // Contract still has 1 box

      const updatedBox = ctx.beneContract.utxos.toArray()[0];
      const updatedPft = updatedBox.assets.find((t) => t.tokenId === ctx.pftTokenId);
      expect(updatedPft?.amount).toEqual(remainingPFT); // Contract has 50k PFT remaining
    });

    it('should fail fully withdrawing unsold PFT tokens, because there are contributors with their APTs sold that will want to exchange them for PFTs', () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = ctx.totalPFTokens - soldTokens;

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, {
        signers: [ctx.projectOwner],
        throw: false,
      });

      expect(result).toBe(false);
    });

    it('should fail trying to avoid APTs', () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log('\n🏦 WITHDRAW UNSOLD TOKENS:');
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      const assets = [
        //  { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
      ];
      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      }

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens(assets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(), // Counters unchanged
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, {
        signers: [ctx.projectOwner],
        throw: false,
      });

      // ASSERT: Verify withdrawal failed
      expect(result).toBe(false); // Transaction fails
    });

    it('should fail due to failed owner authentication', () => {
      // ARRANGE: Owner wants to withdraw 50k unsold PFT tokens
      const tokensToWithdraw = 50_000n; // Withdraw 50k
      const remainingPFT = ctx.totalPFTokens - tokensToWithdraw; // 50k will remain in contract

      console.log('\n🏦 WITHDRAW UNSOLD TOKENS:');
      console.log(`   Tokens Sold:       10,000 (from beforeEach)`);
      console.log(`   Tokens Available:  90,000 (100k - 10k sold)`);
      console.log(`   Tokens to Withdraw: ${tokensToWithdraw.toLocaleString()} PFT`);
      console.log(`   PFT Remaining:     ${remainingPFT.toLocaleString()}`);

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: remainingPFT }, // Add updated PFT amount
      ];
      if (!ctx.isErgMode) {
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      }

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Updated contract (fewer PFT tokens)
          // Value and collected funds (ERG or USD token) are unchanged
          new OutputBuilder(projectBox.value, ctx.beneErgoTree)
            .addTokens(assets)
            .setAdditionalRegisters({
              R4: projectBox.additionalRegisters.R4,
              R5: SLong(ctx.minimumTokensSold).toHex(),
              R6: SColl(SLong, [10_000n, 0n, 0n]).toHex(), // Counters unchanged
              R7: SLong(ctx.exchangeRate).toHex(),
              R8: projectBox.additionalRegisters.R8,
              R9: projectBox.additionalRegisters.R9,
            }),
          // Output 1: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw }, // Owner gets 50k PFT
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.buyer], throw: false }); // Tries to sign another key

      expect(result).toBe(false);
    });
  });

  describe('Withdraw unsold tokens with all sold APT changed per PFTs ', () => {
    let ctx: BeneTestContext;
    let projectBox: Box; // Contract box
    let soldTokens: bigint;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Create project box with partial token sales
      soldTokens = ctx.totalPFTokens / 2n; // Half of the total PFTs has been sold.
      const collectedFunds = soldTokens * ctx.exchangeRate;

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
      ];

      let value = RECOMMENDED_MIN_FEE_VALUE;

      // Handle collected funds based on mode
      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        // ERG Mode: Add funds to the box value
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 2: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow fully withdrawing unsold PFT tokens', () => {
      // ARRANGE: Owner wants to withdraw all the unsold PFT tokens
      const tokensToWithdraw = ctx.totalPFTokens - soldTokens;

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(0);
    });
  });

  describe('Withdraw unsold tokens with all sold APT changed per PFTs after minimum raised and some APT refunded before minimum raised', () => {
    let ctx: BeneTestContext;
    let projectBox: Box; // Contract box
    let soldTokens: bigint;

    beforeEach(() => {
      ctx = setupBeneTestContext(mode.token, mode.tokenName);

      // STEP 1: Create project box with partial token sales
      soldTokens = ctx.totalPFTokens / 2n; // Half of the total PFTs has been sold. (Adquired APTs)
      const refundedTokens = soldTokens / 2n; // Half of the APTs where refunded from their funds.
      const exchangedTokens = soldTokens - refundedTokens; // The rest of the APTs where exchanged per PFTs
      const collectedFunds = exchangedTokens * ctx.exchangeRate; // Exchanged funds can be retired, but not the refunded funds.

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
      ];

      let value = RECOMMENDED_MIN_FEE_VALUE;

      // Handle collected funds based on mode
      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        // ERG Mode: Add funds to the box value
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, refundedTokens, exchangedTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 2: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow fully withdrawing unsold PFT tokens', () => {
      // ARRANGE: Owner wants to withdraw all the unsold PFT tokens
      const tokensToWithdraw = ctx.totalPFTokens - soldTokens;

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(0);
    });
  });

  describe('Withdraw unsold tokens with complex owner script authorization', () => {
    let ctx: BeneTestContext;
    let projectBox: Box; // Contract box
    let soldTokens: bigint;
    let ownerContract: ErgoTree;

    beforeEach(() => {
      ownerContract = compile(`{ sigmaProp(HEIGHT > 1) }`);

      ctx = setupBeneTestContext(mode.token, mode.tokenName, ownerContract.toAddress());

      // STEP 1: Create project box with partial token sales
      soldTokens = ctx.totalPFTokens / 2n; // Half of the total PFTs has been sold.
      const collectedFunds = soldTokens * ctx.exchangeRate;

      const assets = [
        { tokenId: ctx.projectNftId, amount: 1n + ctx.totalPFTokens - soldTokens },
        { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100k PFT total
      ];

      let value = RECOMMENDED_MIN_FEE_VALUE;

      // Handle collected funds based on mode
      if (!ctx.isErgMode) {
        // USD Mode: Add funds as a token
        assets.push({ tokenId: ctx.baseTokenId, amount: collectedFunds });
      } else {
        // ERG Mode: Add funds to the box value
        value += collectedFunds;
      }

      ctx.beneContract.addUTxOs({
        value: value,
        ergoTree: ctx.beneErgoTree.toHex(),
        assets: assets,
        creationHeight: ctx.mockChain.height - 100,
        additionalRegisters: {
          R4: createR4(ctx),
          R5: SLong(ctx.minimumTokensSold).toHex(),
          R6: SColl(SLong, [soldTokens, 0n, soldTokens]).toHex(),
          R7: SLong(ctx.exchangeRate).toHex(),
          R8: ctx.constants.toHex(),
          R9: SColl(SByte, stringToBytes('utf8', '{}')).toHex(),
        },
      });

      // STEP 2: Get reference to project box
      projectBox = ctx.beneContract.utxos.toArray()[0];
    });

    it('should allow fully withdrawing unsold PFT tokens', () => {
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
      const ownerScriptBox = customOwnerContract.utxos.toArray()[0]; // TODO CHECK - This box is omitted by the transaction in ERG case.

      // ARRANGE: Owner wants to withdraw all the unsold PFT tokens
      const tokensToWithdraw = ctx.totalPFTokens - soldTokens;

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ownerScriptBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, { signers: [ctx.projectOwner] });

      expect(result).toBe(true); // Transaction valid
      expect(ctx.beneContract.utxos.length).toEqual(0);
    });

    it('should fail due to failed owner authentication', () => {
      // ARRANGE: Owner wants to withdraw all the unsold PFT tokens
      const tokensToWithdraw = ctx.totalPFTokens - soldTokens;

      // Fund project owner for transaction (contract validates INPUTS(1) is owner)
      ctx.projectOwner.addBalance({ nanoergs: 10_000_000_000n }); // 10 ERG for fees

      // ACT: Build token withdrawal transaction
      const transaction = new TransactionBuilder(ctx.mockChain.height)
        // INPUTS: Contract box + owner box (contract checks INPUTS(1) for authorization)
        .from([projectBox, ...ctx.projectOwner.utxos.toArray()]) // INPUTS(0)=contract, INPUTS(1)=owner
        // OUTPUTS:
        .to([
          // Output 0: Owner receives unsold PFT (contract checks OUTPUTS(1))
          new OutputBuilder(RECOMMENDED_MIN_FEE_VALUE, ctx.projectOwner.address).addTokens([
            { tokenId: ctx.pftTokenId, amount: tokensToWithdraw },
          ]),
        ])
        .sendChangeTo(ctx.projectOwner.address)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build();

      // Execute transaction (contract validates owner authorization)
      const result = ctx.mockChain.execute(transaction, {
        signers: [ctx.projectOwner],
        throw: false,
      });

      expect(result).toBe(false);
    });
  });
});
