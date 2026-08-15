import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import { explorer_uri, projects, project_id_conflicts } from "$lib/common/store";
import { clearLineageCache } from "$lib/ergo/lineage";
import { fetchProjectById, fetchProjectsFromBlockchain } from "$lib/ergo/fetch";
import { FakeExplorer, EXPLORER_URI, asV2Project, type FakeBox } from "./fake_explorer";

/**
 * #178 made the UI refuse to display a campaign when two unspent boxes claim its id, because
 * nothing in the boxes says which is real. The lineage walk is what can say: the campaign is the
 * box that descends from the mint through OUTPUTS(0). These tests are about the two halves fitting
 * together - a collision the chain can settle is displayed, one it cannot is still refused - and
 * about never falling back to "whichever box the explorer listed first".
 *
 * Every box a test expects to be rejected is built as a valid v2 project, so that rejecting it has
 * to be the lineage's doing and not a parse failure.
 */

const PROJECT_ID = "c".repeat(64);

let explorer: FakeExplorer;
const realFetch = globalThis.fetch;

function campaign(actions: number): FakeBox[] {
    const mintBox = explorer.box(PROJECT_ID, 100, "mintbox");
    explorer.mintedIn(PROJECT_ID, mintBox);
    const genesis = asV2Project(explorer.box(PROJECT_ID, 100, "genesis"), { title: "The real one" });
    explorer.spend(mintBox, [genesis]);

    const chain = [genesis];
    for (let i = 0; i < actions; i++) {
        const next = asV2Project(explorer.box(PROJECT_ID, 100 - i - 1, `replica${i}`), {
            title: "The real one",
        });
        explorer.spend(chain[chain.length - 1], [next]);
        chain.push(next);
    }
    return chain;
}

/** The #176 box: same script, same token, registers of its author's choosing, never on the path. */
function imitation(label: string): FakeBox {
    return asV2Project(explorer.box(PROJECT_ID, 1, label), { title: "The fake one" });
}

beforeEach(() => {
    explorer = new FakeExplorer();
    explorer.install();
    explorer_uri.set(EXPLORER_URI);
    clearLineageCache();
    projects.set({ data: new Map(), last_fetch: 0 });
    project_id_conflicts.set(new Map());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
});

describe("the campaign page", () => {
    // A real explorer promises nothing about the order of the unspent listing, and "whichever came
    // first" is exactly the rule this replaces, so both orders are checked.
    it.each([false, true])(
        "shows the box the lineage reached, not the imitation beside it (reversed: %s)",
        async (reversed) => {
            explorer.reverseUnspent = reversed;
            const chain = campaign(2);
            imitation("imitation");

            const project = await fetchProjectById(PROJECT_ID);

            expect(project?.box.boxId).toBe(chain[chain.length - 1].boxId);
            expect(project?.content.title).toBe("The real one");
            // A collision the chain can settle is not a conflict any more.
            expect(get(project_id_conflicts).has(PROJECT_ID)).toBe(false);
        }
    );

    it("shows an ordinary campaign with nothing competing for its id", async () => {
        const chain = campaign(1);

        const project = await fetchProjectById(PROJECT_ID);

        expect(project?.box.boxId).toBe(chain[chain.length - 1].boxId);
    });

    it("shows nothing for a campaign whose chain has ended", async () => {
        const chain = campaign(1);
        explorer.spend(chain[chain.length - 1], [explorer.box(null, 0, "payout")]);
        // A clone left unspent by the closing transaction - the #174 shape. It is the only box
        // carrying the token now, so before this it was the campaign page.
        imitation("clone");

        expect(await fetchProjectById(PROJECT_ID)).toBeNull();
        expect(explorer.countCalls("/api/v1/boxes/unspent/")).toBe(0);
    });

    it("shows nothing when the box the lineage reached is not among the unspent ones", async () => {
        const chain = campaign(1);
        // The unspent index does not list the real box - a lagging index, say. The imitation is
        // listed, and falling back to it is the one thing that must not happen.
        explorer.hiddenFromUnspent.add(chain[chain.length - 1].boxId);
        imitation("imitation");

        expect(await fetchProjectById(PROJECT_ID)).toBeNull();
    });

    it("still refuses a tie the lineage cannot settle", async () => {
        // No mint registered: the walk cannot start, so nothing establishes which is which and the
        // behaviour #178 introduced has to stand.
        imitation("one");
        imitation("two");

        expect(await fetchProjectById(PROJECT_ID)).toBeNull();
        expect(get(project_id_conflicts).get(PROJECT_ID)).toEqual(["one", "two"]);
    });

    it("still shows a lone box when the lineage cannot be resolved", async () => {
        // The explorer being unable to answer should not take every campaign off the site; with a
        // single candidate there is nothing to be misled between, so this stays as it was.
        asV2Project(explorer.box(PROJECT_ID, 100, "only"), { title: "Alone" });

        expect((await fetchProjectById(PROJECT_ID))?.box.boxId).toBe("only");
    });
});

describe("the campaign list", () => {
    it.each([false, true])(
        "lists the box the lineage reached when two claim one id (reversed: %s)",
        async (reversed) => {
            explorer.reverseUnspent = reversed;
            const chain = campaign(1);
            imitation("imitation");

            await fetchProjectsFromBlockchain();

            const listed = get(projects).data.get(PROJECT_ID);
            expect(listed?.box.boxId).toBe(chain[chain.length - 1].boxId);
            expect(listed?.content.title).toBe("The real one");
            expect(get(project_id_conflicts).has(PROJECT_ID)).toBe(false);
        }
    );

    it("lists a campaign untouched when nothing else claims its id", async () => {
        const chain = campaign(1);

        await fetchProjectsFromBlockchain();

        expect(get(projects).data.get(PROJECT_ID)?.box.boxId).toBe(chain[chain.length - 1].boxId);
        // Nothing collided, so the walk should not have been paid for at all: one call per
        // campaign per sweep is not a cost the listing can carry.
        expect(explorer.countCalls("/api/v1/tokens/" + PROJECT_ID)).toBe(0);
    });

    it("hides the leftovers of a campaign that has ended", async () => {
        const chain = campaign(1);
        explorer.spend(chain[chain.length - 1], [explorer.box(null, 0, "payout")]);
        imitation("clone");
        imitation("another");

        await fetchProjectsFromBlockchain();

        expect(get(projects).data.has(PROJECT_ID)).toBe(false);
        expect(get(project_id_conflicts).get(PROJECT_ID)).toEqual(["clone", "another"]);
    });

    it("hides a collision when the real box is neither of the two", async () => {
        // The campaign is live and its box is simply not in the unspent listing this sweep, while
        // two imitations are. Neither is the campaign, and neither may be shown as one.
        const chain = campaign(1);
        explorer.hiddenFromUnspent.add(chain[chain.length - 1].boxId);
        imitation("one");
        imitation("two");

        await fetchProjectsFromBlockchain();

        expect(get(projects).data.has(PROJECT_ID)).toBe(false);
        expect(get(project_id_conflicts).get(PROJECT_ID)).toEqual(["one", "two"]);
    });

    it("still hides a campaign whose collision the lineage cannot settle", async () => {
        imitation("one");
        imitation("two");

        await fetchProjectsFromBlockchain();

        expect(get(projects).data.has(PROJECT_ID)).toBe(false);
        expect(get(project_id_conflicts).get(PROJECT_ID)).toEqual(["one", "two"]);
    });
});
