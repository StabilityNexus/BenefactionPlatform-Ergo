import { describe, it, expect } from "vitest";
import { is_legacy_version, type Project } from "$lib/common/project";
import { ErgoPlatform } from "$lib/ergo/platform";
import type { contract_version } from "$lib/ergo/contract";

/**
 * The badge that marks a campaign as running on an older contract. The point of these tests is
 * not the string on screen but the rule behind it: "older than what the platform deploys today",
 * so that publishing a new contract marks the previous one on its own.
 */

function projectOn(version: string, deployed: string): Project {
    return { version, platform: { last_version: deployed } } as unknown as Project;
}

describe("is_legacy_version", () => {
    it("marks the versions older than the deployed one", () => {
        expect(is_legacy_version(projectOn("v1_0", "v2"))).toBe(true);
        expect(is_legacy_version(projectOn("v1_1", "v2"))).toBe(true);
    });

    it("leaves the deployed version unmarked", () => {
        expect(is_legacy_version(projectOn("v2", "v2"))).toBe(false);
    });

    it("marks the previous version as soon as a new one is deployed", () => {
        // Nobody has to come back and edit a list when v3 ships: v2 becomes legacy by itself, and
        // v3 does not mark itself.
        expect(is_legacy_version(projectOn("v2", "v3"))).toBe(true);
        expect(is_legacy_version(projectOn("v3", "v3"))).toBe(false);
    });

    it("agrees with what the platform actually deploys right now", () => {
        const deployed: contract_version = new ErgoPlatform().last_version;

        expect(is_legacy_version(projectOn(deployed, deployed))).toBe(false);
        expect(is_legacy_version(projectOn("v1_0", deployed))).toBe(true);
    });
});
