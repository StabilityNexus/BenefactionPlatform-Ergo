import { MockChain } from "@fleet-sdk/mock-chain";
import { compile } from "@fleet-sdk/compiler";
import { RECOMMENDED_MIN_FEE_VALUE, ErgoAddress } from "@fleet-sdk/core";
import { blake2b256 } from "@fleet-sdk/crypto";
import * as fs from "fs";
import * as path from "path";

// ===== Utility Functions ===== //

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

// ===== Contract Loading ===== //
// Read v1_2 contract template from file system
const contractsDir = path.resolve(__dirname, "../../contracts/bene_contract");
export const BENE_CONTRACT_V1_2_TEMPLATE = fs.readFileSync(
  path.join(contractsDir, "contract_v1_2.es"),
  "utf-8"
);

// ===== Test Parameters ===== //

// TOKEN CONFIGURATION: Configure ALL parameters for the token you're testing
// ⚠️ CRITICAL: exchangeRate = FUNDING_GOAL / TOTAL_PFT_TOKENS must be >= 1 (BigInt truncates!)

export const TOTAL_PFT_TOKENS = 100_000n;       // 100,000 tokens

// --- ERG ---
export const ERG_BASE_TOKEN = "";
export const ERG_BASE_TOKEN_NAME = "ERG";
export const ERG_BASE_TOKEN_DECIMALS = 9;
export const ERG_FUNDING_GOAL = 100_000_000_000n;  // 100 ERG = 100 * 10^9
// exchangeRate = 100,000,000,000 / 100,000 = 1,000,000 nanoERG per token

// --- SigmaUSD ---
export const BASE_TOKEN = "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04";
export const BASE_TOKEN_NAME = "SigmaUSD";
export const BASE_TOKEN_DECIMALS = 2;
export const FUNDING_GOAL = 10_000_000n;  // 100,000 SigUSD = 100,000 * 10^2
// exchangeRate = 10,000,000 / 100,000 = 100 = 1.00 SigUSD per token


// ===== Test Context Setup ===== //

export interface BeneTestContext {
  mockChain: MockChain;
  projectOwner: ReturnType<MockChain["newParty"]>;
  buyer: ReturnType<MockChain["newParty"]>;
  beneContract: ReturnType<MockChain["newParty"]>;
  beneErgoTree: ReturnType<typeof compile>;
  projectNftId: string;
  pftTokenId: string;
  baseTokenId: string;
  baseTokenName: string;
  baseTokenIdLen: bigint;
  baseTokenDecimals: number;
  isErgMode: boolean;
  fundingGoal: bigint;
  exchangeRate: bigint;
  totalPFTokens: bigint;
  minimumTokensSold: bigint;
  deadlineBlock: number;
  devFeePercentage: number;
}
//
// MAIN SETUP FUNCTION: Creates a complete test environment for Bene contract testing
// This function is called in beforeEach() of each test file to get a fresh mock blockchain
//
// NOTE: This creates TEST DEFAULTS for:
// - Funding parameters (goal, tokens, minimum, deadline)
// - Token IDs (APT and PFT are hardcoded test values)
//
// NOT SET HERE (individual tests should define these):
// - Project metadata: name, description, image (stored in R8/R9 registers)
// - Specific funding amounts (tests override defaults as needed)
export function setupBeneTestContext(
  baseTokenId: string,      // PAYMENT token: "" for ERG mode, or token ID for custom token mode
  baseTokenName: string     
): BeneTestContext {
  // STEP 1: Initialize mock blockchain at block height 800,000
  const mockChain = new MockChain({ height: 800_000 });

  // STEP 2: Create mock participants (wallets/addresses) on the blockchain
  const projectOwner = mockChain.newParty("ProjectOwner");  // Creator of the fundraising project
  const buyer = mockChain.newParty("Buyer");                // User who will buy tokens

  // STEP 3: Define project parameters (using values from configuration above)
  const fundingGoal = ERG_FUNDING_GOAL;                  // From config: varies by token decimals
  const totalPFTokens = TOTAL_PFT_TOKENS;            // From config: total tokens to sell
  const exchangeRate = fundingGoal / totalPFTokens;  // Calculated price per token (MUST be >= 1!)
  const minimumTokensSold = totalPFTokens / 2n;      // Minimum threshold: 50% (owner chooses - can be any value)
  const deadlineBlock = 800_200;                     // Campaign deadline: block 800,200 (owner chooses)
  const devFeePercentage = 5;                        // Platform fee: 5% of raised funds (platform constant)
  
  // Validation: Ensure exchange rate is valid
  if (exchangeRate === 0n) {
    throw new Error(
      `❌ INVALID CONFIGURATION: Exchange rate is 0!\n` +
      `   FUNDING_GOAL (${fundingGoal}) / TOTAL_PFT_TOKENS (${totalPFTokens}) = ${exchangeRate}\n` +
      `   Exchange rate must be >= 1 (smallest unit).\n` +
      `   Either increase FUNDING_GOAL or decrease TOTAL_PFT_TOKENS.`
    );
  }

  // LOGGING: Display test configuration (only once per test run)
  const decimalDivisor = 10 ** ERG_BASE_TOKEN_DECIMALS;  // Use actual decimals from config

  // Only log configuration if this is the first time setup is called
  if (!(globalThis as any).__beneTestConfigLogged) {
    console.log("\n" + "=".repeat(80));
    console.log("BENE CONTRACT TEST CONFIGURATION");
    console.log("=".repeat(80));
    console.log(`Payment Token:        ${baseTokenName} (${ERG_BASE_TOKEN_DECIMALS} decimals) ${baseTokenId === "" ? "[native ERG]" : ""}`);
    if (baseTokenId !== "") {
      console.log(`   Token ID:             ${baseTokenId.substring(0, 20)}...${baseTokenId.substring(baseTokenId.length - 10)}`);
    }

    const fundingGoalDisplay = Number(fundingGoal) / decimalDivisor;
    console.log(`Funding Goal:         ${fundingGoalDisplay} ${baseTokenName}`);
    console.log(`   (Smallest units):     ${fundingGoal.toLocaleString()}`);
    console.log(`Reward Tokens (PFT):  ${totalPFTokens.toLocaleString()} tokens`);

    const exchangeRateDisplay = Number(exchangeRate) / decimalDivisor;
    console.log(`Exchange Rate:        ${exchangeRateDisplay} ${baseTokenName} per token`);
    console.log(`   (Inverse):            ${(1 / exchangeRateDisplay).toFixed(6)} tokens per ${baseTokenName}`);
    console.log(`   (Smallest units):     ${exchangeRate.toLocaleString()} per token`);

    console.log(`Minimum to Sell:      ${minimumTokensSold.toLocaleString()} tokens (${(Number(minimumTokensSold) / Number(totalPFTokens) * 100).toFixed(0)}%)`);
    console.log(`Deadline Block:       ${deadlineBlock.toLocaleString()}`);
    console.log(`Platform Dev Fee:     ${devFeePercentage}%`);
    console.log("=".repeat(80) + "\n");

    (globalThis as any).__beneTestConfigLogged = true;
  }

  // STEP 4: Calculate payment mode flags
  const baseTokenIdLen = BigInt(baseTokenId.length / 2);  // Token ID length in bytes: 0 for ERG, 32 for custom token
  const isErgMode = baseTokenId === "";                   // true = accept ERG, false = accept custom token

  // STEP 5: Fund the buyer with ERG for transaction fees
  buyer.addBalance({ nanoergs: 50_000_000_000n });  // Give buyer 50 ERG for gas fees

  // STEP 6: If using custom token mode, also give buyer the payment tokens
  if (!isErgMode) {
    const buyerTokenAmount = fundingGoal * 10n;  // Give buyer 10x the funding goal to ensure sufficient funds
    buyer.addUTxOs({
      value: 10_000_000_000n,                      // 10 ERG for transaction fees
      ergoTree: buyer.address.ergoTree,            // Buyer's address
      assets: [{ tokenId: baseTokenId, amount: buyerTokenAmount }], // Sufficient custom tokens
      creationHeight: mockChain.height - 50,       // Created 50 blocks ago
      additionalRegisters: {},
    });
  }

  const projectNftId = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";  // APT token ID (hardcoded for testing)
  const pftTokenId = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";    // PFT/reward token ID (hardcoded for testing)

  // STEP 8: Compile the Bene smart contract with actual values replacing placeholders
  const ownerAddress = projectOwner.address.toString();
  
  // STEP 8a: Convert owner address to ErgoTree hex for P2S/P2PK support
  const ownerErgoTree = ErgoAddress.fromBase58(ownerAddress).ergoTree;
  
  // STEP 8b: Create dev fee contract (simple contract that accepts any transaction)
  const devFeeContract = compile(`{ sigmaProp(true) }`);        // Always returns true (for testing)
  const devFeeContractBytes = devFeeContract.bytes;              // Get bytes property (not method!)
  const devFeeContractHashBytes = blake2b256(devFeeContractBytes); // Hash the contract
  const devFeeContractHash = uint8ArrayToHex(devFeeContractHashBytes); // Convert to hex string

  // STEP 8b: Replace all placeholders in contract template with actual values
  const beneContractSource = BENE_CONTRACT_V1_2_TEMPLATE
    .replace(/`\+owner_ergotree\+`/g, ownerErgoTree)                     // Insert owner's ErgoTree (P2S/P2PK support)
    .replace(/`\+dev_fee_contract_bytes_hash\+`/g, devFeeContractHash)  // Insert dev fee contract hash
    .replace(/`\+dev_fee\+`/g, devFeePercentage.toString())             // Insert 5% fee
    .replace(/`\+token_id\+`/g, pftTokenId)                             // Insert PFT token ID
    .replace(/`\+base_token_id\+`/g, baseTokenId);                      // Insert base token ID ("" for ERG)

  // STEP 8c: Compile the contract source code into ErgoTree (executable bytecode)
  const beneErgoTree = compile(beneContractSource);

  // STEP 9: Register the contract as a "party" on the mock blockchain
  const beneContract = mockChain.addParty(beneErgoTree.toHex(), `BeneContract-${baseTokenName}`);

  // STEP 10: Return the complete test context object
  // This object contains everything needed for testing: blockchain, actors, and configuration
  return {
    mockChain,           // The simulated blockchain
    projectOwner,        // Project creator's wallet
    buyer,               // Token buyer's wallet
    beneContract,        // The smart contract party
    beneErgoTree,        // Compiled contract bytecode
    projectNftId,        // APT token ID
    pftTokenId,          // PFT token ID
    baseTokenId,         // Payment token ID ("" for ERG)
    baseTokenName,       // Human-readable name ("ERG", "SigUSD", etc.)
    baseTokenIdLen,      // Token ID length in bytes (0 or 32)
    baseTokenDecimals: ERG_BASE_TOKEN_DECIMALS,  // Number of decimals (9 for ERG, 2 for SigUSD, etc.)
    isErgMode,           // true if accepting ERG, false if accepting custom token
    fundingGoal,         // Total amount to raise
    exchangeRate,        // Price per APT token
    totalPFTokens,       // Total APT tokens available (100,000)
    minimumTokensSold,   // Minimum threshold (50,000)
    deadlineBlock,       // Campaign deadline (block 800,200)
    devFeePercentage,    // Platform fee (5%)
  };
}
