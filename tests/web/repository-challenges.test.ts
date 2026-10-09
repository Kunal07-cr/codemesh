import { describe, expect, it } from "vitest";
import type { GraphNode } from "@codemesh/shared";
import { buildChallengeDeck, exportChallengeNotes } from "../../apps/web/src/lib/repositoryChallenges";

const files: GraphNode[] = ["src/auth.ts", "src/routes.ts", "src/data.ts", "README.md"].map((filePath) => ({ id: filePath, label: filePath, type: "file", filePath }));
const symbol = (id: string, label: string, filePath = "src/auth.ts", line = 3): GraphNode => ({ id, label, type: "symbol", symbolKind: "function", filePath, range: { startLine: line, endLine: line + 2, startColumn: 0, endColumn: 1 } });

describe("repository challenges", () => {
  it("builds deterministic, bounded questions with one correct choice and exact citations", () => {
    const nodes = [...files, ...Array.from({ length: 30 }, (_, n) => symbol(`s${n}`, `function${n}`, "src/auth.ts", n * 3 + 1))];
    const deck = buildChallengeDeck(nodes, [], "revision:0");
    expect(deck).toHaveLength(24);
    expect(buildChallengeDeck(nodes, [], "revision:0")).toEqual(deck);
    expect(buildChallengeDeck(nodes, [], "revision:1")).not.toEqual(deck);
    for (const question of deck) {
      expect(question.choices.filter((choice) => choice === question.answer)).toHaveLength(1);
      expect(new Set(question.choices).size).toBe(question.choices.length);
      expect(question.choices.length).toBeGreaterThanOrEqual(3);
      expect(question.source.filePath).toBe("src/auth.ts");
      expect(question.source.line).toBeGreaterThan(0);
    }
    expect(deck.some((item) => item.category === "ranges")).toBe(true);
  });

  it("skips ambiguous symbols, duplicate source ranges, unsafe paths, and insufficient choices", () => {
    const nodes = [...files, symbol("a", "duplicate"), symbol("b", "duplicate", "src/routes.ts"), symbol("c", "other"), symbol("d", "unsafe", "../secret.ts"), symbol("e", "missing", "unknown.ts"), symbol("f", "invalid", "src/data.ts", -1)];
    const deck = buildChallengeDeck(nodes, [], "seed");
    expect(deck.some((item) => item.id === "symbol:a" || item.id === "symbol:b")).toBe(false);
    expect(deck.some((item) => item.id === "range:a" || item.id === "range:c")).toBe(false);
    expect(deck.some((item) => item.id.includes(":d") || item.id.includes(":e") || item.id.includes(":f"))).toBe(false);
    expect(buildChallengeDeck([files[0]!, symbol("one", "only")], [], "seed")).toEqual([]);
    expect(buildChallengeDeck([], [], "seed")).toEqual([]);
  });

  it("keeps contract questions source-linked and exports revision-specific study results", () => {
    const contract = { id: "auth", title: "Authorization gate", filePath: "src/auth.ts", line: 12, evidence: "requireAuth(config)", statement: "The gate controls protected routes." };
    const deck = buildChallengeDeck(files, [contract], "seed");
    expect(deck).toHaveLength(1);
    expect(deck[0]?.category).toBe("contracts");
    expect(deck[0]?.source).toEqual({ filePath: "src/auth.ts", line: 12, excerpt: "requireAuth(config)" });
    expect(buildChallengeDeck(files, [contract, { ...contract, id: "other" }], "seed")).toEqual([]);
    const notes = exportChallengeNotes("TaskPilot", "commit-1", deck, { [deck[0]!.id]: "src/routes.ts" });
    expect(notes).toContain("commit-1");
    expect(notes).toContain("src/auth.ts:12");
    expect(notes).toContain("Needs review");
    expect(notes).toContain("requireAuth(config)");
  });
});
