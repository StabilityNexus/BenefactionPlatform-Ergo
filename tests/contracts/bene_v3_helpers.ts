import { MockChain, type KeyedMockChainParty, type NonKeyedMockChainParty } from "@fleet-sdk/mock-chain";
import { compile } from "@fleet-sdk/compiler";
import { ErgoAddress } from "@fleet-sdk/core";
import { blake2b256 } from "@fleet-sdk/crypto";
import * as fs from "fs";
import * as path from "path";
import { createR8Structure } from "$lib/common/project";
import { SBool, SLong, SPair } from "@fleet-sdk/serializer";

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

const contractsDir = path.resolve(__dirname, "../../contracts/bene_contract");
export const BENE_CONTRACT_V3 = fs.readFileSync(
  path.join(contractsDir, "contract_v3.es"),
  "utf-8"
);

/**
 * `{ sigmaProp(false) }` - the script the project NFT is retired into when a campaign ends.
 * The contract carries its proposition bytes as a literal; if this ever stops matching, the
 * terminal-box tests fail loudly rather than silently accepting any box.
 */
export const TERMINAL_CONTRACT = compile(`{ sigmaProp(false) }`);

export const TOTAL_PFT_TOKENS = 100_000n;
export const ERG_BASE_TOKEN = "";
export const ERG_BASE_TOKEN_NAME = "ERG";
export const ERG_FUNDING_GOAL = 100_000_000_000n;

/** A token-denominated campaign, which is where the fee truncation of #177 is reachable. */
export const USD_BASE_TOKEN = "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04";
export const USD_BASE_TOKEN_NAME = "SigmaUSD";
export const USD_FUNDING_GOAL = 10_000_000n;

export interface BeneV3TestContext {
  mockChain: MockChain;
  constants: any;
  projectOwner: KeyedMockChainParty;
  buyer: KeyedMockChainParty;
  beneContract: NonKeyedMockChainParty;
  beneErgoTree: ReturnType<typeof compile>;
  devFeeContract: ReturnType<typeof compile>;
  /** Singleton NFT, tokens(0), amount 1. This is the project identity in v3. */
  projectNftId: string;
  /** APT, tokens(1). Circulates to buyers; no longer identifies anything. */
  aptTokenId: string;
  pftTokenId: string;
  baseTokenId: string;
  isErgMode: boolean;
  fundingGoal: bigint;
  exchangeRate: bigint;
  totalPFTokens: bigint;
  minimumTokensSold: bigint;
  deadlineBlock: number;
  deadlineTimestamp: bigint;
  devFeePercentage: number;
}

/**
 * Mirrors setupBeneTestContext for v3. The one structural difference is the token layout: the
 * project box carries a singleton NFT at tokens(0) and the APT at tokens(1), where v2 had the
 * APT at tokens(0) doing both jobs.
 */
export function setupBeneV3TestContext(
  baseTokenId: string,
  baseTokenName: string,
  ownerAddress: ErgoAddress | null = null
): BeneV3TestContext {
  const mockChain = new MockChain({ height: 800_000 });

  const projectOwner = mockChain.newParty("ProjectOwner");
  const buyer = mockChain.newParty("Buyer");

  const isErgMode = baseTokenId === "";
  const fundingGoal = isErgMode ? ERG_FUNDING_GOAL : USD_FUNDING_GOAL;
  const totalPFTokens = TOTAL_PFT_TOKENS;
  const exchangeRate = fundingGoal / totalPFTokens;
  const minimumTokensSold = totalPFTokens / 2n;
  const deadlineBlock = 800_200;
  const deadlineTimestamp = BigInt(mockChain.timestamp) + (BigInt(deadlineBlock - 800_000) * 120_000n);
  const devFeePercentage = 5;

  buyer.addBalance({ nanoergs: 50_000_000_000n });

  if (!isErgMode) {
    buyer.addUTxOs({
      value: 10_000_000_000n,
      ergoTree: buyer.address.ergoTree,
      assets: [{ tokenId: baseTokenId, amount: fundingGoal * 10n }],
      creationHeight: mockChain.height - 50,
      additionalRegisters: {},
    });
  }

  // Three distinct ids now: the NFT identifies, the APT circulates, the PFT is the reward.
  const projectNftId = "00ff00ff1234567890abcdef1234567890abcdef1234567890abcdef00ff00ff";
  const aptTokenId = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const pftTokenId = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  if (ownerAddress === null) {
    ownerAddress = ErgoAddress.fromBase58(projectOwner.address.toString());
  }

  const devFeeContract = compile(`{ sigmaProp(true) }`);
  const devFeeContractHash = uint8ArrayToHex(blake2b256(devFeeContract.bytes));

  const constants = createR8Structure({
    owner: ownerAddress.ergoTree,
    dev_hash: devFeeContractHash,
    dev_fee: devFeePercentage,
    pft_token_id: pftTokenId,
    base_token_id: baseTokenId,
  });

  const beneErgoTree = compile(BENE_CONTRACT_V3);
  const beneContract = mockChain.addParty(beneErgoTree.toHex(), `BeneContractV3-${baseTokenName}`);

  return {
    mockChain,
    constants,
    projectOwner,
    buyer,
    beneContract,
    beneErgoTree,
    devFeeContract,
    projectNftId,
    aptTokenId,
    pftTokenId,
    baseTokenId,
    isErgMode,
    fundingGoal,
    exchangeRate,
    totalPFTokens,
    minimumTokensSold,
    deadlineBlock,
    deadlineTimestamp,
    devFeePercentage,
  };
}

export function createR4(ctx: BeneV3TestContext, useTimestamp: boolean = false) {
  return useTimestamp
    ? SPair(SBool(true), SLong(ctx.deadlineTimestamp)).toHex()
    : SPair(SBool(false), SLong(BigInt(ctx.deadlineBlock))).toHex();
}

/** The dev fee v3 charges: rounded up, so it can no longer be truncated to nothing (#177). */
export function devFeeOf(extracted: bigint, percentage: number): bigint {
  return (extracted * BigInt(percentage) + 99n) / 100n;
}
