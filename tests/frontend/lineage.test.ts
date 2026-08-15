import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { explorer_uri } from "$lib/common/store";
import {
    resolveCanonicalBox,
    isCanonicalBox,
    clearLineageCache,
} from "$lib/ergo/lineage";
import { FakeExplorer, EXPLORER_URI, type FakeBox } from "./fake_explorer";

/**
 * The lineage walk is the answer to #176: a project has no verifiable identity in v1/v2, so the
 * only thing that distinguishes the real box from an imitation is that it descends from the mint
 * through OUTPUTS(0). These tests are about that distinction holding - and about the walk not
 * inventing an answer when the chain cannot be read.
 */

const PROJECT_ID = "a".repeat(64);
const OTHER_TOKEN = "b".repeat(64);

let explorer: FakeExplorer;
const realFetch = globalThis.fetch;

/**
 * A project with `actions` replications: mint -> genesis -> ... , the head left unspent.
 * Returns the boxes in order, so a test can name the head or any ancestor.
 */
function campaign(actions: number): FakeBox[] {
    const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
    explorer.mintedIn(PROJECT_ID, mintBox);

    const genesis = explorer.box(PROJECT_ID, 100, "genesis");
    explorer.spend(mintBox, [genesis]);

    const chain = [genesis];
    for (let i = 0; i < actions; i++) {
        const next = explorer.box(PROJECT_ID, 100 - i - 1, `replica${i}`);
        explorer.spend(chain[chain.length - 1], [next]);
        chain.push(next);
    }
    return chain;
}

beforeEach(() => {
    explorer = new FakeExplorer();
    explorer.install();
    explorer_uri.set(EXPLORER_URI);
    clearLineageCache();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
});

describe("resolveCanonicalBox", () => {
    it("reaches the head of the chain from the mint", async () => {
        const chain = campaign(3);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box?.boxId).toBe(chain[chain.length - 1].boxId);
        expect(result.ended).toBe(false);
        expect(result.steps).toBe(4); // genesis + three replications
    });

    it("resolves a project that has never been spent since creation", async () => {
        const chain = campaign(0);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box?.boxId).toBe(chain[0].boxId);
        expect(result.ended).toBe(false);
    });

    it("reports the campaign as ended when the chain terminates", async () => {
        const chain = campaign(2);
        // A closing transaction pays the owner at OUTPUTS(0): no project token there.
        explorer.spend(chain[chain.length - 1], [explorer.box(null, 0, "payout")]);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(true);
    });

    it("does not follow a box that carries a different token at index 0", async () => {
        const chain = campaign(1);
        // The project token is in the box, but not at index 0 - so by the contract's own `sameId`
        // check this is not the project carried forward, whatever else it is.
        const impostor = explorer.box(OTHER_TOKEN, 5, "impostor");
        impostor.assets.push({ tokenId: PROJECT_ID, amount: 1 });
        explorer.spend(chain[chain.length - 1], [impostor]);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(true);
    });

    it("does not accept a creation output that is not at index 0", async () => {
        // mint_idt.es requires the project at OUTPUTS(0), so a transaction that puts it elsewhere
        // did not create a project this platform should recognise.
        const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
        explorer.mintedIn(PROJECT_ID, mintBox);
        explorer.spend(mintBox, [explorer.box(OTHER_TOKEN, 1, "decoy"), explorer.box(PROJECT_ID, 100, "aside")]);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(false);
    });
});

describe("what the walk refuses to conclude", () => {
    it("treats an unknown token as unresolved, not as ended", async () => {
        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(false);
    });

    it("treats a never-spent mint box as unresolved", async () => {
        const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
        explorer.mintedIn(PROJECT_ID, mintBox);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(false);
    });

    it("treats a creation transaction that does not produce the project as unresolved", async () => {
        const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
        explorer.mintedIn(PROJECT_ID, mintBox);
        explorer.spend(mintBox, [explorer.box(OTHER_TOKEN, 1, "notaproject")]);

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.box).toBeNull();
        expect(result.ended).toBe(false);
    });

    it("reports the last box it knows, not 'ended', when the explorer has no answer for it", async () => {
        const chain = campaign(1);
        const head = chain[chain.length - 1];
        explorer.boxes.delete(head.boxId); // the explorer 404s on a box it has just told us about

        const result = await resolveCanonicalBox(PROJECT_ID);

        // Saying "ended" here would hide a live campaign on a transient explorer gap.
        expect(result.ended).toBe(false);
        expect(result.box?.boxId).toBe(head.boxId);
    });

    it("propagates a network failure rather than answering from nothing", async () => {
        const chain = campaign(1);
        explorer.unreachable.add(`/api/v1/boxes/${chain[chain.length - 1].boxId}`);

        await expect(resolveCanonicalBox(PROJECT_ID)).rejects.toThrow();
    });

    it("stops instead of spinning when the chain loops back on itself", async () => {
        const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
        explorer.mintedIn(PROJECT_ID, mintBox);
        const a = explorer.box(PROJECT_ID, 100, "loopa");
        const b = explorer.box(PROJECT_ID, 100, "loopb");
        explorer.spend(mintBox, [a]);
        explorer.spend(a, [b]);
        explorer.spend(b, [a]); // a is now spent by two transactions: only a fixture can do this

        const result = await resolveCanonicalBox(PROJECT_ID);

        expect(result.ended).toBe(false);
        expect(result.steps).toBe(5000); // MAX_CHAIN_LENGTH
    }, 30_000);
});

describe("isCanonicalBox", () => {
    it("accepts the box the lineage reaches", async () => {
        const chain = campaign(2);

        expect(await isCanonicalBox(PROJECT_ID, chain[chain.length - 1].boxId)).toBe(true);
    });

    it("rejects an imitation that holds the project token but is not on the path", async () => {
        campaign(2);
        // Anyone holding one unit of the APT can build this: same token at index 0, unspent,
        // and as far as `boxes/unspent/byTokenId` is concerned indistinguishable from the real one.
        const imitation = explorer.box(PROJECT_ID, 1, "imitation");

        expect(await isCanonicalBox(PROJECT_ID, imitation.boxId)).toBe(false);
    });

    it("rejects a clone slipped into the closing transaction at an index other than 0", async () => {
        // This is #174: the transaction that ends the campaign also creates a copy, which the old
        // by-token lookup then presented as the live project.
        const chain = campaign(1);
        const payout = explorer.box(null, 0, "payout");
        const clone = explorer.box(PROJECT_ID, 1, "clone");
        explorer.spend(chain[chain.length - 1], [payout, explorer.box(null, 0, "change"), clone]);

        expect(await isCanonicalBox(PROJECT_ID, clone.boxId)).toBe(false);
        expect((await resolveCanonicalBox(PROJECT_ID)).ended).toBe(true);
    });

    it("rejects an ancestor: the project is where the chain is now, not where it was", async () => {
        const chain = campaign(3);

        expect(await isCanonicalBox(PROJECT_ID, chain[0].boxId)).toBe(false);
    });
});

describe("the cache", () => {
    it("continues from where it stopped instead of walking from the mint again", async () => {
        const chain = campaign(3);
        await resolveCanonicalBox(PROJECT_ID);
        const afterFirst = explorer.calls.length;
        explorer.calls.length = 0;

        const second = await resolveCanonicalBox(PROJECT_ID);

        expect(second.box?.boxId).toBe(chain[chain.length - 1].boxId);
        expect(second.steps).toBe(0);
        expect(explorer.calls.length).toBeLessThan(afterFirst);
        expect(explorer.countCalls("/api/v1/tokens/")).toBe(0);
    });

    it("picks up the actions taken since the last walk", async () => {
        const chain = campaign(1);
        await resolveCanonicalBox(PROJECT_ID);
        explorer.calls.length = 0;

        const later = explorer.box(PROJECT_ID, 50, "later");
        explorer.spend(chain[chain.length - 1], [later]);

        const second = await resolveCanonicalBox(PROJECT_ID);

        expect(second.box?.boxId).toBe(later.boxId);
        expect(second.steps).toBe(1);
        expect(explorer.countCalls("/api/v1/tokens/")).toBe(0);
    });

    it("answers an ended campaign without asking the explorer again", async () => {
        const chain = campaign(1);
        explorer.spend(chain[chain.length - 1], [explorer.box(null, 0, "payout")]);
        await resolveCanonicalBox(PROJECT_ID);
        explorer.calls.length = 0;

        const second = await resolveCanonicalBox(PROJECT_ID);

        expect(second.ended).toBe(true);
        expect(explorer.calls.length).toBe(0);
    });

    it("walks again from the mint once cleared", async () => {
        campaign(2);
        await resolveCanonicalBox(PROJECT_ID);
        clearLineageCache(PROJECT_ID);
        explorer.calls.length = 0;

        const second = await resolveCanonicalBox(PROJECT_ID);

        expect(second.steps).toBe(3);
        expect(explorer.countCalls("/api/v1/tokens/")).toBe(1);
    });
});
