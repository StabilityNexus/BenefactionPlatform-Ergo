import { describe, it, expect } from "vitest";
import { OutputBuilder, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { addIdentityTokens, project_token_count } from "$lib/ergo/replica";
import type { Project } from "$lib/common/project";

/**
 * The contract reads identity and balances by token index, so the order these are added in is not
 * cosmetic: a v3 box without its NFT at index 0, or with the APT in the wrong place, is a box the
 * contract rejects. v3 also separated the two ids that v2 conflated - the NFT identifies, the APT
 * circulates - and using one where the other belongs is the mistake this guards against.
 */

const NFT = "n".repeat(64);
const APT = "a".repeat(64);

function project(version: string, ids: { project_id: string; apt_token_id: string }): Project {
    return { version, ...ids } as unknown as Project;
}

function tokensOf(output: OutputBuilder) {
    return output.assets.toArray().map((t: any) => ({
        tokenId: t.tokenId,
        amount: BigInt(t.amount),
    }));
}

describe("addIdentityTokens", () => {
    it("puts the singleton NFT first and the APT second on v3", () => {
        const output = new OutputBuilder(SAFE_MIN_BOX_VALUE, "0008cd" + "02".repeat(33));

        addIdentityTokens(output, project("v3", { project_id: NFT, apt_token_id: APT }), 500n);

        expect(tokensOf(output)).toEqual([
            { tokenId: NFT, amount: 1n },
            { tokenId: APT, amount: 500n },
        ]);
    });

    it("adds the APT alone on v2, where it is also the identity", () => {
        const output = new OutputBuilder(SAFE_MIN_BOX_VALUE, "0008cd" + "02".repeat(33));

        addIdentityTokens(output, project("v2", { project_id: APT, apt_token_id: APT }), 500n);

        expect(tokensOf(output)).toEqual([{ tokenId: APT, amount: 500n }]);
    });

    it("moves the APT, not the NFT, when the amount changes", () => {
        // A purchase lowers the APT in the box. The NFT is not a balance and never moves.
        const output = new OutputBuilder(SAFE_MIN_BOX_VALUE, "0008cd" + "02".repeat(33));

        addIdentityTokens(output, project("v3", { project_id: NFT, apt_token_id: APT }), 1n);

        expect(tokensOf(output)).toEqual([
            { tokenId: NFT, amount: 1n },
            { tokenId: APT, amount: 1n },
        ]);
    });

    it("counts the minted NFT when sizing a v3 box", () => {
        // The count feeds the minimum-value estimate. Leaving the NFT out of it builds a box that
        // may fall under the value the network requires for its size.
        expect(project_token_count("v3", 2)).toBe(3);
        expect(project_token_count("v2", 2)).toBe(2);
        expect(project_token_count("v1_0", 2)).toBe(2);
    });

    it("does not reuse the project id for the APT on v3", () => {
        // The two are different tokens from v3 on; spending the NFT id as if it were the APT would
        // build a transaction the contract rejects, and it is the easy mistake to make.
        const output = new OutputBuilder(SAFE_MIN_BOX_VALUE, "0008cd" + "02".repeat(33));

        addIdentityTokens(output, project("v3", { project_id: NFT, apt_token_id: APT }), 500n);
        const tokens = tokensOf(output);

        expect(tokens.filter((t) => t.tokenId === NFT)).toHaveLength(1);
        expect(tokens.find((t) => t.tokenId === NFT)!.amount).toBe(1n);
        expect(tokens.find((t) => t.tokenId === APT)!.amount).toBe(500n);
    });
});
