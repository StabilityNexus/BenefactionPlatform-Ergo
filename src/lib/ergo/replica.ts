import { OutputBuilder } from "@fleet-sdk/core";
import { has_project_nft, type contract_version } from "./contract";
import type { Project } from "$lib/common/project";

/**
 * Building the project box the same way every action does.
 *
 * The token layout changed in v3 - a singleton NFT at index 0, the APT moved to index 1 - and the
 * contract reads identity and balances by index, so getting the order wrong produces a transaction
 * the contract rejects. Rather than spell the layout out in each of the six actions that replicate
 * the box, they all come through here.
 */

/**
 * Add the tokens that identify the campaign, in the order the contract expects them.
 *
 * `aptAmount` is what the action leaves in the box: constant for a withdrawal, lower after a
 * purchase, higher after a refund. The NFT is never anything but 1 - that is what makes it an NFT,
 * and what lets a v3 box be recognised without walking its lineage.
 */
export function addIdentityTokens(
    output: OutputBuilder,
    project: Project,
    aptAmount: bigint
): OutputBuilder {
    if (has_project_nft(project.version)) {
        output.addTokens({ tokenId: project.project_id, amount: 1n });
    }
    output.addTokens({ tokenId: project.apt_token_id, amount: aptAmount });
    return output;
}

/**
 * The project box of a campaign being created, as Tx B has to build it.
 *
 * Extracted from submit.ts so that a contract test can run the real thing against the compiled
 * mint contract: the whole question is what ends up at token index 0, and that is decided here.
 *
 * From v3 the identity is a singleton NFT minted in this very transaction. Its id is the id of
 * INPUTS(0), and INPUTS(0) of Tx B is the mint box - a box that has just been spent and can never
 * exist again, which is what makes the id unforgeable. It costs nothing extra: no separate
 * transaction, no separate box. The builder places a minted token ahead of everything added
 * afterwards, which is where mint_idt_v3.es and contract_v3.es read identity from.
 */
export function buildProjectOutput(opts: {
    version: contract_version;
    value: bigint;
    ergoTree: string;
    title: string;
    /** APT first, then PFT. The NFT is not here: it is minted, and lands ahead of these. */
    tokens: Array<{ tokenId: string; amount: bigint }>;
    registers: Record<string, string>;
}): OutputBuilder {
    const output = new OutputBuilder(opts.value, opts.ergoTree);

    if (has_project_nft(opts.version)) {
        output.mintToken({
            amount: 1n,
            name: opts.title + " Project NFT",
            decimals: 0,
            description: "Identity of the " + opts.title + " campaign.",
        });
    }

    output.addTokens(opts.tokens).setAdditionalRegisters(opts.registers as any);
    return output;
}

/**
 * How many tokens the project box of `version` will hold, given the ones passed explicitly.
 * v3 adds the minted NFT on top, and the box has to be sized for it.
 */
export function project_token_count(version: contract_version, explicitTokens: number): number {
    return explicitTokens + (has_project_nft(version) ? 1 : 0);
}

/**
 * The dev fee the contract of `version` will require for extracting `extracted` base units.
 *
 * Two different rules, and the frontend has to match the box it is spending rather than the
 * version the platform deploys today:
 *
 * - v1 and v2 compute `extracted * fee / 100` in integer arithmetic, which truncates. Withdrawing
 *   19 units of a token campaign at a 5% fee gives 0, and the contract is satisfied - that is the
 *   evasion reported in #177. It cannot be fixed for a campaign already on chain, because the
 *   contract is immutable and would reject a larger fee than it computes.
 * - v3 rounds up and requires the fee to be strictly positive whenever anything is extracted.
 *
 * Done in BigInt because the product can pass 2^53 on a token campaign with small units, and a
 * fee that is off by one is not a rounding difference here: the contract compares it exactly, so
 * the transaction simply fails.
 */
export function dev_fee_for(
    extracted: number | bigint,
    feePercentage: number,
    version: contract_version
): bigint {
    const amount = BigInt(extracted);
    const percentage = BigInt(feePercentage);
    if (amount <= 0n) return 0n;

    if (version === "v3") {
        // Mirrors `(extractedBaseAmount * devFee + 99) / 100` in contract_v3.es.
        return (amount * percentage + 99n) / 100n;
    }

    // Mirrors `extractedBaseAmount * devFee / 100` in contract_v2.es and earlier: integer
    // division, so anything below one whole unit disappears.
    return (amount * percentage) / 100n;
}
