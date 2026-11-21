import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
    OutputBuilder,
    TransactionBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    SAFE_MIN_BOX_VALUE,
    ErgoAddress,
} from "@fleet-sdk/core";
import { SBool, SByte, SColl, SLong, SPair, serializeBox } from "@fleet-sdk/serializer";
import { blake2b256 } from "@fleet-sdk/crypto";
import { utf8 } from "@scure/base";
import { compile } from "@fleet-sdk/compiler";
import { MockChain } from "@fleet-sdk/mock-chain";
import { ERG_BASE_TOKEN, USD_BASE_TOKEN, uint8ArrayToHex } from "./bene_contract_helpers";

const contractsRoot = path.resolve(__dirname, "../../contracts");
const BENE_CONTRACT_V3 = fs.readFileSync(path.join(contractsRoot, "bene_contract/contract_v3.es"), "utf-8");
const MINT_IDT_V3 = fs.readFileSync(path.join(contractsRoot, "mint_contract/mint_idt_v3.es"), "utf-8");

const TERMINAL_CONTRACT = compile("{ sigmaProp(false) }", { version: 1 });
const DEV_FEE_MOCK_CONTRACT = compile("{ sigmaProp(true) }", { version: 1 });

function bigIntToSignedBytes(num: bigint): Uint8Array {
    if (num === 0n) return new Uint8Array([0]);
    let hex = num.toString(16);
    if (hex.length % 2 !== 0) hex = "0" + hex;
    const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
    if (bytes[0] & 0x80) {
        const padded = new Uint8Array(bytes.length + 1);
        padded[0] = 0;
        padded.set(bytes, 1);
        return padded;
    }
    return bytes;
}

function buildR8(
    ownerErgoTreeHex: string,
    devFeeHashHex: string,
    devFeePct: bigint,
    pftTokenId: string,
    baseTokenId: string,
    aptTokenId: string
) {
    return SColl(SColl(SByte), [
        Uint8Array.from(Buffer.from(ownerErgoTreeHex, "hex")),
        Uint8Array.from(Buffer.from(devFeeHashHex, "hex")),
        bigIntToSignedBytes(devFeePct),
        Uint8Array.from(Buffer.from(pftTokenId, "hex")),
        baseTokenId ? Uint8Array.from(Buffer.from(baseTokenId, "hex")) : new Uint8Array([]),
        Uint8Array.from(Buffer.from(aptTokenId, "hex")),
    ]);
}

function createV3Setup(opts?: { baseTokenId?: string; devFeePct?: bigint }) {
    const baseTokenId = opts?.baseTokenId ?? ERG_BASE_TOKEN;
    const devFeePct = opts?.devFeePct ?? 5n;
    const mockChain = new MockChain({ height: 800_000 });
    const owner = mockChain.newParty("ProjectOwner");
    const buyer = mockChain.newParty("Buyer");
    const attacker = mockChain.newParty("Attacker");
    owner.addBalance({ nanoergs: 50_000_000_000n });
    buyer.addBalance({ nanoergs: 50_000_000_000n });
    attacker.addBalance({ nanoergs: 50_000_000_000n });

    const beneTree = compile(BENE_CONTRACT_V3, { version: 1 });
    const beneParty = mockChain.addParty(beneTree.toHex(), "BeneV3");
    const devFeeHashHex = uint8ArrayToHex(blake2b256(DEV_FEE_MOCK_CONTRACT.bytes));
    const projectNftId = "11".repeat(32);
    const aptTokenId = "22".repeat(32);
    const pftTokenId = "33".repeat(32);
    const ownerTreeHex = ErgoAddress.fromBase58(owner.address.toString()).ergoTree;
    const r8 = buildR8(ownerTreeHex, devFeeHashHex, devFeePct, pftTokenId, baseTokenId, aptTokenId);
    const r4 = SPair(SBool(false), SLong(810_000n)).toHex();
    const r9 = SColl(SByte, utf8.decode('{"title":"Bene v3"}')).toHex();

    return {
        mockChain, owner, buyer, attacker, beneTree, beneParty,
        devFeeTree: DEV_FEE_MOCK_CONTRACT, devFeeHashHex,
        projectNftId, aptTokenId, pftTokenId, baseTokenId, devFeePct, r4, r8, r9,
    };
}

describe("Bene Contract v3 — Issue #177 Dev-Fee Invariants, #176 Zero-+1-APT & #179/#182 Review Fixes", () => {
    it("verifies canonical terminal script hex matches `{ sigmaProp(false) }`", () => {
        expect(TERMINAL_CONTRACT.toHex()).toBe("1906010100d17300");
    });

    it("blocks Path 1: owner cannot terminate via isWithdrawUnsoldTokens to steal raised ERG without dev fee", () => {
        const s = createV3Setup({ baseTokenId: ERG_BASE_TOKEN, devFeePct: 5n });
        const raisedErg = 100_000_000_000n;
        s.beneParty.addUTxOs({
            value: raisedErg, ergoTree: s.beneTree.toHex(),
            assets: [
                { tokenId: s.projectNftId, amount: 1n },
                { tokenId: s.aptTokenId, amount: 100_000n },
                { tokenId: s.pftTokenId, amount: 40_000n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [60_000n, 0n, 60_000n]).toHex(),
                R7: SLong(1_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        const contractBox = s.beneParty.utxos.toArray()[0];

        const exploitTx = new TransactionBuilder(s.mockChain.height)
            .from([contractBox, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT).addTokens({ tokenId: s.projectNftId, amount: 1n }),
                new OutputBuilder(raisedErg, s.owner.address).addTokens({ tokenId: s.pftTokenId, amount: 40_000n }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(exploitTx, { signers: [s.owner], throw: false })).toBe(false);

        const withdrawUnsoldTx = new TransactionBuilder(s.mockChain.height)
            .from([contractBox, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(raisedErg, s.beneTree)
                    .addTokens([{ tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 100_000n }])
                    .setAdditionalRegisters({ ...contractBox.additionalRegisters }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.owner.address).addTokens({ tokenId: s.pftTokenId, amount: 40_000n }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(withdrawUnsoldTx, { signers: [s.owner], throw: false })).toBe(true);

        const boxNoPft = s.beneParty.utxos.toArray()[0];
        const devFee = (raisedErg * 5n + 99n) / 100n;
        const finalWithdrawTx = new TransactionBuilder(s.mockChain.height)
            .from([boxNoPft, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(raisedErg - devFee, s.owner.address),
                new OutputBuilder(devFee, s.devFeeTree),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT).addTokens({ tokenId: s.projectNftId, amount: 1n }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(finalWithdrawTx, { signers: [s.owner], throw: false })).toBe(true);
    });

    it("blocks Path 2: fractioned 19-unit token withdrawals cannot evade dev fee via truncation", () => {
        const s = createV3Setup({ baseTokenId: USD_BASE_TOKEN, devFeePct: 5n });
        s.beneParty.addUTxOs({
            value: SAFE_MIN_BOX_VALUE, ergoTree: s.beneTree.toHex(),
            assets: [
                { tokenId: s.projectNftId, amount: 1n },
                { tokenId: s.aptTokenId, amount: 50_000n },
                { tokenId: s.pftTokenId, amount: 100_000n },
                { tokenId: USD_BASE_TOKEN, amount: 1_000n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [50_000n, 0n, 0n]).toHex(),
                R7: SLong(1n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        const box = s.beneParty.utxos.toArray()[0];

        const zeroFeeSliceTx = new TransactionBuilder(s.mockChain.height)
            .from([box, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_000n },
                        { tokenId: s.pftTokenId, amount: 100_000n }, { tokenId: USD_BASE_TOKEN, amount: 981n },
                    ])
                    .setAdditionalRegisters({ ...box.additionalRegisters }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.owner.address).addTokens({ tokenId: USD_BASE_TOKEN, amount: 19n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.devFeeTree),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(zeroFeeSliceTx, { signers: [s.owner], throw: false })).toBe(false);

        const validCeilingSliceTx = new TransactionBuilder(s.mockChain.height)
            .from([box, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_000n },
                        { tokenId: s.pftTokenId, amount: 100_000n }, { tokenId: USD_BASE_TOKEN, amount: 981n },
                    ])
                    .setAdditionalRegisters({ ...box.additionalRegisters }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.owner.address).addTokens({ tokenId: USD_BASE_TOKEN, amount: 18n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.devFeeTree).addTokens({ tokenId: USD_BASE_TOKEN, amount: 1n }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(validCeilingSliceTx, { signers: [s.owner], throw: false })).toBe(true);
    });

    it("resolves #179 review bug 1: mint_idt_v3.es rejects minting extra copies of the singleton NFT", () => {
        const s = createV3Setup({ baseTokenId: ERG_BASE_TOKEN, devFeePct: 5n });
        const beneHashHex = uint8ArrayToHex(blake2b256(s.beneTree.bytes));
        const mintTree = compile(MINT_IDT_V3.replace(/`\+contract_bytes_hash\+`/g, beneHashHex), { version: 1 });
        const mintParty = s.mockChain.addParty(mintTree.toHex(), "MintIdtV3");
        mintParty.addUTxOs({
            value: 10_000_000n, ergoTree: mintTree.toHex(),
            assets: [{ tokenId: s.aptTokenId, amount: 100_000n }],
            creationHeight: s.mockChain.height - 5, additionalRegisters: {},
        });
        const mintInputBox = mintParty.utxos.toArray()[0];

        const twinSplitEip12 = new TransactionBuilder(s.mockChain.height)
            .from([mintInputBox, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .mintToken({ amount: 2n })
                    .addTokens([{ tokenId: s.aptTokenId, amount: 100_000n }])
                    .setAdditionalRegisters({
                        R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
                        R7: SLong(1_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
                    }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.owner.address),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build().toEIP12Object();
        twinSplitEip12.outputs[0].assets[0].amount = "1";
        twinSplitEip12.outputs[1].assets = [{ tokenId: mintInputBox.boxId, amount: "1" }];
        expect(s.mockChain.execute(twinSplitEip12 as any, { signers: [s.owner], throw: false })).toBe(false);

        const honestSingleMintTx = new TransactionBuilder(s.mockChain.height)
            .from([mintInputBox, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .mintToken({ amount: 1n })
                    .addTokens([{ tokenId: s.aptTokenId, amount: 100_000n }])
                    .setAdditionalRegisters({
                        R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
                        R7: SLong(1_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
                    }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(honestSingleMintTx, { signers: [s.owner], throw: false })).toBe(true);
    });

    it("resolves #179 review bug 2 & B3: blocks ERG theft on BOTH partial AND final termination of token-base campaigns", () => {
        const s = createV3Setup({ baseTokenId: USD_BASE_TOKEN, devFeePct: 5n });
        const initialErg = 50_000_000_000n;
        s.beneParty.addUTxOs({
            value: initialErg, ergoTree: s.beneTree.toHex(),
            assets: [
                { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_000n },
                { tokenId: s.pftTokenId, amount: 100_000n }, { tokenId: USD_BASE_TOKEN, amount: 1_000n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [50_000n, 0n, 0n]).toHex(),
                R7: SLong(1n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        const box = s.beneParty.utxos.toArray()[0];

        const drainErgPartialTx = new TransactionBuilder(s.mockChain.height)
            .from([box, ...s.attacker.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_000n },
                        { tokenId: s.pftTokenId, amount: 100_000n }, { tokenId: USD_BASE_TOKEN, amount: 900n },
                    ])
                    .setAdditionalRegisters({ ...box.additionalRegisters }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.owner.address).addTokens({ tokenId: USD_BASE_TOKEN, amount: 95n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.devFeeTree).addTokens({ tokenId: USD_BASE_TOKEN, amount: 5n }),
            ])
            .sendChangeTo(s.attacker.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(drainErgPartialTx, { signers: [s.attacker], throw: false })).toBe(false);

        const s2 = createV3Setup({ baseTokenId: USD_BASE_TOKEN, devFeePct: 5n });
        s2.beneParty.addUTxOs({
            value: initialErg, ergoTree: s2.beneTree.toHex(),
            assets: [
                { tokenId: s2.projectNftId, amount: 1n }, { tokenId: s2.aptTokenId, amount: 100_000n },
                { tokenId: USD_BASE_TOKEN, amount: 1_000n },
            ],
            creationHeight: s2.mockChain.height - 10,
            additionalRegisters: {
                R4: s2.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [100_000n, 0n, 100_000n]).toHex(),
                R7: SLong(1n).toHex(), R8: s2.r8.toHex(), R9: s2.r9,
            },
        });
        const termBox = s2.beneParty.utxos.toArray()[0];

        const drainErgTerminationTx = new TransactionBuilder(s2.mockChain.height)
            .from([termBox, ...s2.attacker.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s2.owner.address).addTokens({ tokenId: USD_BASE_TOKEN, amount: 950n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s2.devFeeTree).addTokens({ tokenId: USD_BASE_TOKEN, amount: 50n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT).addTokens({ tokenId: s2.projectNftId, amount: 1n }),
            ])
            .sendChangeTo(s2.attacker.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s2.mockChain.execute(drainErgTerminationTx, { signers: [s2.attacker], throw: false })).toBe(false);

        const honestTerminationTx = new TransactionBuilder(s2.mockChain.height)
            .from([termBox, ...s2.attacker.utxos.toArray()])
            .to([
                new OutputBuilder(initialErg, s2.owner.address).addTokens({ tokenId: USD_BASE_TOKEN, amount: 950n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s2.devFeeTree).addTokens({ tokenId: USD_BASE_TOKEN, amount: 50n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT).addTokens({ tokenId: s2.projectNftId, amount: 1n }),
            ])
            .sendChangeTo(s2.attacker.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s2.mockChain.execute(honestTerminationTx, { signers: [s2.attacker], throw: false })).toBe(true);
    });

    it("resolves #176 B2: supports 100% APT sell-out (0 APT remaining in box) without +1 APT workaround", () => {
        const s = createV3Setup({ baseTokenId: ERG_BASE_TOKEN, devFeePct: 5n });
        s.beneParty.addUTxOs({
            value: SAFE_MIN_BOX_VALUE, ergoTree: s.beneTree.toHex(),
            assets: [
                { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 100n },
                { tokenId: s.pftTokenId, amount: 100n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50n).toHex(), R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
                R7: SLong(10_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        const genesisBox = s.beneParty.utxos.toArray()[0];

        const buyAllTx = new TransactionBuilder(s.mockChain.height)
            .from([genesisBox, ...s.buyer.utxos.toArray()])
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE + 1_000_000_000n, s.beneTree)
                    .addTokens([{ tokenId: s.projectNftId, amount: 1n }, { tokenId: s.pftTokenId, amount: 100n }])
                    .setAdditionalRegisters({ ...genesisBox.additionalRegisters, R6: SColl(SLong, [100n, 0n, 0n]).toHex() }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.buyer.address).addTokens({ tokenId: s.aptTokenId, amount: 100n }),
            ])
            .sendChangeTo(s.buyer.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(buyAllTx, { signers: [s.buyer], throw: false })).toBe(true);

        const soldOutBox = s.beneParty.utxos.toArray()[0];
        const exchangeAllTx = new TransactionBuilder(s.mockChain.height)
            .from([soldOutBox, ...s.buyer.utxos.toArray()])
            .to([
                new OutputBuilder(soldOutBox.value, s.beneTree)
                    .addTokens([{ tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 100n }])
                    .setAdditionalRegisters({ ...soldOutBox.additionalRegisters, R6: SColl(SLong, [100n, 0n, 100n]).toHex() }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.buyer.address).addTokens({ tokenId: s.pftTokenId, amount: 100n }),
            ])
            .sendChangeTo(s.buyer.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(exchangeAllTx, { signers: [s.buyer], throw: false })).toBe(true);
    });

    it("resolves #179 review bug 3: allows withdrawals when devFee == 0 without deadlocking the campaign", () => {
        const s = createV3Setup({ baseTokenId: ERG_BASE_TOKEN, devFeePct: 0n });
        const raisedErg = 10_000_000_000n;
        s.beneParty.addUTxOs({
            value: raisedErg, ergoTree: s.beneTree.toHex(),
            assets: [{ tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_000n }],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [50_000n, 0n, 50_000n]).toHex(),
                R7: SLong(200_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        const box = s.beneParty.utxos.toArray()[0];

        const zeroFeeTx = new TransactionBuilder(s.mockChain.height)
            .from([box, ...s.owner.utxos.toArray()])
            .to([
                new OutputBuilder(raisedErg, s.owner.address),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, TERMINAL_CONTRACT).addTokens({ tokenId: s.projectNftId, amount: 1n }),
            ])
            .sendChangeTo(s.owner.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(zeroFeeTx, { signers: [s.owner], throw: false })).toBe(true);
    });

    it("blocks #174 structural clone attack and allows #78 VLQ top-up", () => {
        const s = createV3Setup({ baseTokenId: ERG_BASE_TOKEN, devFeePct: 5n });
        const probeParty = s.mockChain.newParty("ProbeSizer");
        probeParty.addUTxOs({
            value: 10_000_000_000n,
            ergoTree: probeParty.address.ergoTree,
            assets: [
                { tokenId: s.projectNftId, amount: 1n },
                { tokenId: s.aptTokenId, amount: 1n },
                { tokenId: s.pftTokenId, amount: 100_000n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {},
        });
        const probeTx = new TransactionBuilder(s.mockChain.height)
            .from(probeParty.utxos.toArray())
            .to([
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 1n },
                        { tokenId: s.pftTokenId, amount: 100_000n },
                    ])
                    .setAdditionalRegisters({
                        R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [100_000n, 0n, 0n]).toHex(),
                        R7: SLong(1_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
                    }),
            ])
            .sendChangeTo(probeParty.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        const compactMinErg = BigInt(serializeBox(probeTx.outputs[0]).length) * 360n;

        s.beneParty.addUTxOs({
            value: compactMinErg, ergoTree: s.beneTree.toHex(),
            assets: [
                { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 1n },
                { tokenId: s.pftTokenId, amount: 100_000n },
            ],
            creationHeight: s.mockChain.height - 10,
            additionalRegisters: {
                R4: s.r4, R5: SLong(50_000n).toHex(), R6: SColl(SLong, [100_000n, 0n, 0n]).toHex(),
                R7: SLong(1_000_000n).toHex(), R8: s.r8.toHex(), R9: s.r9,
            },
        });
        s.buyer.addUTxOs({
            value: 5_000_000_000n, ergoTree: s.buyer.address.ergoTree,
            assets: [{ tokenId: s.aptTokenId, amount: 50_000n }],
            creationHeight: s.mockChain.height - 10, additionalRegisters: {},
        });
        const drainedBox = s.beneParty.utxos.toArray()[0];
        const grownMinErg = compactMinErg + 1_440n;

        const vlqRedeemTx = new TransactionBuilder(s.mockChain.height)
            .from([drainedBox, ...s.buyer.utxos.toArray()])
            .to([
                new OutputBuilder(grownMinErg, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 50_001n },
                        { tokenId: s.pftTokenId, amount: 50_000n },
                    ])
                    .setAdditionalRegisters({
                        ...drainedBox.additionalRegisters, R6: SColl(SLong, [100_000n, 0n, 50_000n]).toHex(),
                    }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.buyer.address).addTokens({ tokenId: s.pftTokenId, amount: 50_000n }),
            ])
            .sendChangeTo(s.buyer.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(vlqRedeemTx, { signers: [s.buyer], throw: false })).toBe(true);

        const updatedBox = s.beneParty.utxos.toArray()[0];
        s.buyer.addUTxOs({
            value: 5_000_000_000n, ergoTree: s.buyer.address.ergoTree,
            assets: [{ tokenId: s.aptTokenId, amount: 10_000n }],
            creationHeight: s.mockChain.height - 5, additionalRegisters: {},
        });
        const cloneAttackTx = new TransactionBuilder(s.mockChain.height)
            .from([updatedBox, ...s.buyer.utxos.toArray()])
            .to([
                new OutputBuilder(grownMinErg, s.beneTree)
                    .addTokens([
                        { tokenId: s.projectNftId, amount: 1n }, { tokenId: s.aptTokenId, amount: 60_001n },
                        { tokenId: s.pftTokenId, amount: 40_000n },
                    ])
                    .setAdditionalRegisters({
                        ...updatedBox.additionalRegisters, R6: SColl(SLong, [100_000n, 0n, 60_000n]).toHex(),
                    }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.buyer.address).addTokens({ tokenId: s.pftTokenId, amount: 10_000n }),
                new OutputBuilder(SAFE_MIN_BOX_VALUE, s.beneTree),
            ])
            .sendChangeTo(s.buyer.address).payFee(RECOMMENDED_MIN_FEE_VALUE).build();
        expect(s.mockChain.execute(cloneAttackTx, { signers: [s.buyer], throw: false })).toBe(false);
    });
});
