import { describe, it, expect, beforeEach } from "vitest";
import { MockChain, type KeyedMockChainParty, type NonKeyedMockChainParty } from "@fleet-sdk/mock-chain";
import {
  OutputBuilder,
  TransactionBuilder,
  RECOMMENDED_MIN_FEE_VALUE,
  SAFE_MIN_BOX_VALUE,
} from "@fleet-sdk/core";
import { compile } from "@fleet-sdk/compiler";
import { blake2b256 } from "@fleet-sdk/crypto";
import { SBool, SByte, SColl, SLong, SPair } from "@fleet-sdk/serializer";
import { stringToBytes } from "@scure/base";
import * as fs from "fs";
import * as path from "path";
import { BENE_CONTRACT_V3, uint8ArrayToHex } from "./bene_v3_helpers";
import { buildProjectOutput } from "$lib/ergo/replica";

/**
 * Creating a v3 campaign, against the compiled mint contract.
 *
 * The frontend builds this as two chained transactions: Tx A mints the APT into a box locked by
 * mint_idt_v3.es, and Tx B spends that box into the project box. What is new in v3 is that Tx B
 * also mints the project NFT - at no extra cost, because a token minted on Ergo takes the id of
 * INPUTS(0), and INPUTS(0) of Tx B is the mint box, which has just been spent and can never be
 * reproduced.
 *
 * The reason this is a contract test and not a unit test is that the whole thing turns on the
 * order of tokens in the output box, and on which input is first. Neither can be established by
 * reading the builder: they are decided when the transaction is built, and the only authority on
 * whether the result is acceptable is the compiled contract.
 */

const MINT_CONTRACT_V3 = fs.readFileSync(
  path.resolve(__dirname, "../../contracts/mint_contract/mint_idt_v3.es"),
  "utf-8"
);

const TOTAL_PFT = 100_000n;
const APT_AMOUNT = TOTAL_PFT + 1n;
const DEADLINE_BLOCK = 900_000n;

describe("Bene v3 - campaign creation", () => {
  let chain: MockChain;
  let owner: KeyedMockChainParty;
  let mintParty: NonKeyedMockChainParty;
  let beneErgoTree: ReturnType<typeof compile>;
  let pftTokenId: string;

  beforeEach(() => {
    chain = new MockChain({ height: 800_000 });
    owner = chain.newParty("Owner");

    beneErgoTree = compile(BENE_CONTRACT_V3);
    const contractBytesHash = uint8ArrayToHex(blake2b256(beneErgoTree.bytes));
    const mintTree = compile(MINT_CONTRACT_V3.replace(/`\+contract_bytes_hash\+`/g, contractBytesHash));
    mintParty = chain.addParty(mintTree.toHex(), "MintV3");

    // The PFT is minted by the owner before any of this; here it just has to exist.
    pftTokenId = "f".repeat(64);
    owner.addBalance({ nanoergs: 100_000_000_000n });
    owner.addUTxOs({
      value: 10_000_000_000n,
      ergoTree: owner.address.ergoTree,
      assets: [{ tokenId: pftTokenId, amount: TOTAL_PFT }],
      creationHeight: chain.height - 50,
      additionalRegisters: {},
    });
  });

  /** Tx A: mint the APT into the mint box. Returns the APT id and the mint box. */
  function mintApt() {
    const issuanceBox = owner.utxos.toArray()[0];
    const txA = new TransactionBuilder(chain.height)
      .from([issuanceBox, ...owner.utxos.toArray().filter((b) => b.boxId !== issuanceBox.boxId)])
      .to(
        new OutputBuilder(SAFE_MIN_BOX_VALUE, mintParty.address).mintToken({
          amount: APT_AMOUNT,
          name: "Test APT",
          decimals: 0,
          description: "Temporal-funding token",
        })
      )
      .sendChangeTo(owner.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();

    expect(chain.execute(txA, { signers: [owner], throw: false })).toBe(true);

    const mintBox = mintParty.utxos.toArray()[0];
    // On Ergo the minted id is the id of INPUTS(0) of the issuing transaction.
    return { aptTokenId: issuanceBox.boxId, mintBox };
  }

  function registers() {
    return {
      R4: SPair(SBool(false), SLong(DEADLINE_BLOCK)).toHex(),
      R5: SLong(TOTAL_PFT / 2n).toHex(),
      R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
      R7: SLong(1_000_000n).toHex(),
      R8: SColl(SColl(SByte), [
        owner.address.ergoTree,
        uint8ArrayToHex(blake2b256(compile(`{ sigmaProp(true) }`).bytes)),
        "05",
        pftTokenId,
        "",
      ]).toHex(),
      R9: SColl(SByte, stringToBytes("utf8", JSON.stringify({ title: "T", description: "D" }))).toHex(),
    };
  }

  /**
   * Tx B, as the frontend builds it: the mint box first, the project box at OUTPUTS(0), the NFT
   * minted here so that its id is the mint box's.
   */
  function buildCreation(opts: {
    nftAmount?: bigint;
    mintNft?: boolean;
    aptTokenId: string;
    mintBox: any;
  }) {
    const { aptTokenId, mintBox } = opts;
    const inputs = [mintBox, ...owner.utxos.toArray()];

    // The production builder, so that this checks what submit.ts actually sends.
    const tokens = [
      { tokenId: aptTokenId, amount: APT_AMOUNT },
      { tokenId: pftTokenId, amount: TOTAL_PFT },
    ];
    let projectOutput;
    if (opts.mintNft === false) {
      // What the v2 flow builds - the same call with a version that mints nothing.
      projectOutput = buildProjectOutput({
        version: "v2",
        value: SAFE_MIN_BOX_VALUE * 2n,
        ergoTree: beneErgoTree.toHex(),
        title: "T",
        tokens,
        registers: registers(),
      });
    } else if (opts.nftAmount !== undefined) {
      // Not reachable through buildProjectOutput, which always mints exactly one - which is the
      // point. Built by hand so the contract's own check is exercised.
      projectOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE * 2n, beneErgoTree)
        .mintToken({ amount: opts.nftAmount, name: "T", decimals: 0, description: "d" })
        .addTokens(tokens)
        .setAdditionalRegisters(registers() as any);
    } else {
      projectOutput = buildProjectOutput({
        version: "v3",
        value: SAFE_MIN_BOX_VALUE * 2n,
        ergoTree: beneErgoTree.toHex(),
        title: "T",
        tokens,
        registers: registers(),
      });
    }

    return new TransactionBuilder(chain.height)
      .from(inputs)
      .to(projectOutput)
      .sendChangeTo(owner.address)
      .payFee(RECOMMENDED_MIN_FEE_VALUE)
      .build();
  }

  it("creates the project box, with the NFT minted in the same transaction", () => {
    const { aptTokenId, mintBox } = mintApt();

    const txB = buildCreation({ aptTokenId, mintBox });

    expect(chain.execute(txB, { signers: [owner], throw: false })).toBe(true);

    const projectBox = txB.outputs[0];

    // What the contract reads by index, in the order it reads it.
    expect(projectBox.assets).toHaveLength(3);
    expect(projectBox.assets[0].amount).toBe(1n);
    expect(projectBox.assets[0].tokenId).toBe(mintBox.boxId);
    expect(projectBox.assets[1].tokenId).toBe(aptTokenId);
    expect(projectBox.assets[1].amount).toBe(APT_AMOUNT);
    expect(projectBox.assets[2].tokenId).toBe(pftTokenId);
  });

  it("refuses a project box with no NFT at tokens(0)", () => {
    // This is exactly what the v2 flow builds: APT first, PFT second, nothing minted here.
    const { aptTokenId, mintBox } = mintApt();

    const txB = buildCreation({ aptTokenId, mintBox, mintNft: false });

    expect(chain.execute(txB, { signers: [owner], throw: false })).toBe(false);
  });

  it("refuses an identity token that is not a singleton", () => {
    const { aptTokenId, mintBox } = mintApt();

    const txB = buildCreation({ aptTokenId, mintBox, nftAmount: 2n });

    expect(chain.execute(txB, { signers: [owner], throw: false })).toBe(false);
  });

  it("refuses a transaction that does not spend the mint box first", () => {
    // The minted id is the id of INPUTS(0). If the mint box were anywhere else, the id would come
    // from one of the owner's own boxes - which the owner chooses, and could arrange to reproduce.
    //
    // Fleet will not build this: asked for the funding box first, its selector still puts the
    // token-bearing box at index 0, which is a useful property of the library but leaves the
    // contract's own guard untested. So the order is swapped after the fact.
    const { aptTokenId, mintBox } = mintApt();

    const txB = buildCreation({ aptTokenId, mintBox });
    expect(txB.inputs[0].boxId).toBe(mintBox.boxId);
    expect(txB.inputs.length).toBeGreaterThan(1);
    [txB.inputs[0], txB.inputs[1]] = [txB.inputs[1], txB.inputs[0]];

    expect(chain.execute(txB, { signers: [owner], throw: false })).toBe(false);
  });
});
