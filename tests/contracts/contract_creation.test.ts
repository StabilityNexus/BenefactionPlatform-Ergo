// ===== TEST FILE: Project Creation =====
// Tests the initial deployment of a Bene fundraising project
// Verifies that the project box is created with correct tokens and registers

import { describe, it, expect, beforeEach } from 'vitest';
import { RECOMMENDED_MIN_FEE_VALUE } from '@fleet-sdk/core';
import { SByte, SColl, SLong } from '@fleet-sdk/serializer';
import { stringToBytes } from '@scure/base';
import {
  setupBeneTestContext,
  ERG_BASE_TOKEN,
  ERG_BASE_TOKEN_NAME,
  type BeneTestContext,
  createR4,
} from './bene_contract_helpers';

// EXECUTION FLOW:
// 1. beforeEach() → Creates fresh mock blockchain with setupBeneTestContext()
// 2. Test creates initial project box with tokens and configuration
// 3. Assertions verify the box was created correctly

describe('Bene Contract v1.2 - Project Creation', () => {
  let ctx: BeneTestContext; // Holds the test environment (blockchain, actors, config)

  // SETUP: Runs before each test to create a fresh mock blockchain
  beforeEach(() => {
    // Initialize test context with BASE_TOKEN (see bene_contract_helpers.ts to change)
    ctx = setupBeneTestContext(ERG_BASE_TOKEN, ERG_BASE_TOKEN_NAME);
  });

  describe('Project Creation', () => {
    it('should successfully create a Bene project box', () => {
      // ARRANGE: Prepare test data for contract creation

      // Owner information stored in R8 register
      const ownerDetails = JSON.stringify({
        name: 'Project Owner',
        contact: 'owner@example.com',
      });

      // Project information stored in R9 register
      const projectMetadata = JSON.stringify({
        title: 'Test Fundraising Project',
        description: 'A test project for Bene platform',
      });

      // ACT: Create the initial project box (UTXO) on the blockchain
      // This simulates the project owner deploying the fundraising campaign
      ctx.beneContract.addUTxOs({
        value: RECOMMENDED_MIN_FEE_VALUE, // Minimum ERG value (1.1 million nanoERG)
        ergoTree: ctx.beneErgoTree.toHex(), // Contract address/script

        // TOKEN ALLOCATION:
        assets: [
          { tokenId: ctx.projectNftId, amount: 1n }, // APT NFT (project identifier)
          { tokenId: ctx.pftTokenId, amount: ctx.totalPFTokens }, // 100,000 PFT tokens to sell
        ],

        creationHeight: ctx.mockChain.height, // Created at current block height

        // CONTRACT REGISTERS (Storage slots R4-R9):
        additionalRegisters: {
          R4: createR4(ctx), // Deadline: block 800,200
          R5: SLong(ctx.minimumTokensSold).toHex(), // Minimum to sell: 50,000 tokens
          R6: SColl(SLong, [0n, 0n, 0n]).toHex(), // Counters: [sold, refunded, exchanged] = [0, 0, 0]
          R7: SLong(ctx.exchangeRate).toHex(), // [price, token_id_length] = [1M, 0]
          R8: SColl(SByte, stringToBytes('utf8', ownerDetails)).toHex(), // Owner details (JSON)
          R9: SColl(SByte, stringToBytes('utf8', projectMetadata)).toHex(), // Project metadata (JSON)
        },
      });

      // Get the created box from contract's UTXOs
      const projectBox = ctx.beneContract.utxos.toArray()[0];

      // ASSERT: Verify the project box was created correctly
      expect(projectBox).toBeDefined(); // Box exists
      expect(projectBox.value).toEqual(RECOMMENDED_MIN_FEE_VALUE); // Has minimum ERG
      expect(projectBox.assets).toHaveLength(2); // Has exactly 2 tokens
      expect(projectBox.assets[0].tokenId).toEqual(ctx.projectNftId); // First token is APT NFT
      expect(projectBox.assets[0].amount).toEqual(1n); // Has 1 NFT
      expect(projectBox.assets[1].tokenId).toEqual(ctx.pftTokenId); // Second token is PFT
      expect(projectBox.assets[1].amount).toEqual(ctx.totalPFTokens); // Has 100,000 PFT tokens
    });
  });
});
