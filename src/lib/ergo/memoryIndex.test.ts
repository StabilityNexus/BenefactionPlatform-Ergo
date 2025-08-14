/**
 * Unit tests for MemoryIndex
 *
 * Note on framework:
 * - These tests use Jest/Vitest-style globals (describe, it/test, expect).
 * - They should run as-is on either Jest or Vitest with TypeScript support.
 */

import { MemoryIndex, projectIndex } from "./memoryIndex";

// Minimal Project shape required for these tests.
// We only model the fields exercised by MemoryIndex.
type Project = {
  project_id: string;
  content?: { title?: string; description?: string };
  token_details?: { name?: string };
  box: { creationHeight: number };
  minimum_amount: number;
  maximum_amount: number;
  token_id: string;
  version: string;
  collected_value: number;
};

// Helper to construct projects with sensible defaults while allowing overrides.
const createProject = (p: Partial<Project> & { project_id: string }): Project => {
  const base: Project = {
    project_id: p.project_id,
    content: { title: "", description: "" },
    token_details: { name: "" },
    box: { creationHeight: 0 },
    minimum_amount: 0,
    maximum_amount: 0,
    token_id: "",
    version: "",
    collected_value: 0,
  };
  return {
    ...base,
    ...p,
    content: { ...(base.content ?? {}), ...(p.content ?? {}) },
    token_details: { ...(base.token_details ?? {}), ...(p.token_details ?? {}) },
    box: { ...(base.box ?? {}), ...(p.box ?? {}) },
  };
};

const toIds = (map: Map<string, Project>): string[] => Array.from(map.keys());

describe("MemoryIndex", () => {
  let index: MemoryIndex;
  let projects: Map<string, Project>;
  let A: Project;
  let B: Project;
  let C: Project;

  beforeEach(() => {
    index = new MemoryIndex();
    projects = new Map();

    A = createProject({
      project_id: "1234567890abcdef",
      content: { title: "Erg Wallet", description: "A secure wallet for ERG and tokens!" },
      token_details: { name: "ERGpay" },
      box: { creationHeight: 100 },
      minimum_amount: 10,
      maximum_amount: 1000,
      token_id: "",
      version: "v1",
      collected_value: 50,
    });

    B = createProject({
      project_id: "abcdef1234567890",
      content: { title: "DEX Protocol", description: "Decentralized exchange" },
      token_details: { name: "dex-coin" },
      box: { creationHeight: 200 },
      minimum_amount: 5,
      maximum_amount: 500,
      token_id: "abc123",
      version: "v2",
      collected_value: 150,
    });

    C = createProject({
      project_id: "ZZZZYYYYXXXXWWWV",
      // Intentionally omit content and token_details to exercise optional chaining in tokenization
      box: { creationHeight: 50 },
      minimum_amount: 0,
      maximum_amount: 100,
      token_id: "",
      version: "v1",
      collected_value: 0,
    });

    projects.set("A", A);
    projects.set("B", B);
    projects.set("C", C);

    index.buildIndex(projects);
  });

  it("builds the index and reports correct size", () => {
    expect(index.size()).toBe(3);
    expect(toIds(index.getAllProjects())).toEqual(["A", "B", "C"]);
  });

  it("returns all projects for empty or whitespace-only queries", () => {
    expect(index.search("").size).toBe(3);
    expect(index.search("   ").size).toBe(3);
  });

  it("supports case-insensitive and punctuation-insensitive search", () => {
    expect(toIds(index.search("wallet"))).toEqual(["A"]);
    expect(toIds(index.search("WALLET!!"))).toEqual(["A"]);
    expect(toIds(index.search("ErG"))).toEqual(["A"]);
  });

  it("supports partial token matching within indexed tokens", () => {
    // "ERGpay" should be matched by "ergp"
    expect(toIds(index.search("ergp"))).toEqual(["A"]);
  });

  it("matches on multiple tokens only when all are present in a single project", () => {
    // "dex exchange" should match project B
    expect(toIds(index.search("dex exchange"))).toEqual(["B"]);
    // No single project has both "wallet" and "exchange" tokens
    expect(index.search("wallet exchange").size).toBe(0);
  });

  it("matches project id prefix (first 8 chars lowercased)", () => {
    expect(toIds(index.search("12345678"))).toEqual(["A"]);
    expect(index.search("abcdef12").has("B")).toBe(true);
  });

  it("returns empty result for queries with no matches", () => {
    expect(index.search("thiswillnotmatch").size).toBe(0);
  });

  describe("filtering", () => {
    it("filters by minimum amount (>= min)", () => {
      const res = index.filter({ minAmount: 6 });
      expect(toIds(res)).toEqual(["A"]);
    });

    it("filters by maximum amount (<= max)", () => {
      const res = index.filter({ maxAmount: 100 });
      expect(toIds(res)).toEqual(["C"]);
    });

    it("filters by token presence", () => {
      const withToken = index.filter({ hasToken: true });
      expect(toIds(withToken)).toEqual(["B"]);

      const withoutToken = index.filter({ hasToken: false });
      expect(toIds(withoutToken)).toEqual(["A", "C"]);
    });

    it("filters by exact version", () => {
      const v1 = index.filter({ version: "v1" });
      expect(toIds(v1).sort()).toEqual(["A", "C"]);
      const none = index.filter({ version: "vX" });
      expect(none.size).toBe(0);
    });

    it("combines multiple criteria", () => {
      const res = index.filter({ minAmount: 6, version: "v1" });
      expect(toIds(res)).toEqual(["A"]);
    });
  });

  describe("sorting", () => {
    it("sorts by oldest (ascending creation height)", () => {
      const ids = toIds(index.filter({ sortBy: "oldest" }));
      expect(ids).toEqual(["C", "A", "B"]);
    });

    it("sorts by newest (default, descending creation height)", () => {
      const ids = toIds(index.filter({ sortBy: "newest" }));
      expect(ids).toEqual(["B", "A", "C"]);
      // Default with undefined sortBy also uses newest
      const defaultIds = toIds(index.filter({}));
      expect(defaultIds).toEqual(["B", "A", "C"]);
    });

    it("sorts by collected amount (descending)", () => {
      const ids = toIds(index.filter({ sortBy: "amount" }));
      expect(ids).toEqual(["B", "A", "C"]);
    });

    it("sorts by name (title, using localeCompare; empty titles first)", () => {
      const ids = toIds(index.filter({ sortBy: "name" }));
      expect(ids).toEqual(["C", "B", "A"]);
    });
  });

  it("clears the index", () => {
    index.clear();
    expect(index.size()).toBe(0);
    expect(index.getAllProjects().size).toBe(0);
  });

  it("works with the singleton projectIndex instance", () => {
    try {
      projectIndex.clear();
      const single = new Map<string, Project>();
      single.set("S", A);
      projectIndex.buildIndex(single);
      expect(projectIndex.size()).toBe(1);
      expect(toIds(projectIndex.getAllProjects())).toEqual(["S"]);
    } finally {
      // Ensure shared singleton is reset to avoid bleeding state between tests
      projectIndex.clear();
    }
  });
});