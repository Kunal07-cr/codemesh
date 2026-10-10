import { describe, expect, it } from "vitest";
import type { GraphNode } from "@codemesh/shared";
import { buildVivaPrompts, exportVivaNotes, parseVivaResponses } from "../../apps/web/src/lib/vivaPractice";

const nodes: GraphNode[] = [{ id: "file", type: "file", label: "main.ts", filePath: "src/main.ts" }, ...Array.from({ length: 20 }, (_, index): GraphNode => ({ id: `symbol-${index}`, type: "symbol", symbolKind: "function", label: `run${index}`, filePath: "src/main.ts", range: { startLine: index + 1, endLine: index + 1, startColumn: 1, endColumn: 10 } }))];

describe("source-backed viva rehearsal", () => {
  it("builds bounded factual prompts and excludes unsafe or unindexed evidence", () => {
    const prompts = buildVivaPrompts(nodes, [{ id: "bad", title: "Missing", filePath: "missing.ts", line: 1, statement: "x", evidence: "x" }]);
    expect(prompts).toHaveLength(12);
    expect(new Set(prompts.map((item) => item.id)).size).toBe(12);
    expect(prompts.every((item) => item.source.filePath === "src/main.ts" && item.reference.includes("must be confirmed"))).toBe(true);
    expect(buildVivaPrompts([{ ...nodes[0]!, filePath: ".env" }, { ...nodes[1]!, filePath: ".env" }], [])).toEqual([]);
    expect(buildVivaPrompts([], [])).toEqual([]);
  });
  it("validates stored responses and exports explanations as self-assessment", () => {
    const prompts = buildVivaPrompts(nodes, []);
    const responses = parseVivaResponses(JSON.stringify({ [prompts[0]!.id]: { answer: "x".repeat(7000), reviewed: true, checked: [-1, 0, 0, 9, "1"] }, unknown: { answer: "ignored" } }), prompts);
    expect(responses[prompts[0]!.id]?.answer).toHaveLength(6000);
    expect(responses[prompts[0]!.id]?.checked).toEqual([0]);
    expect(Object.keys(responses)).toHaveLength(1);
    expect(parseVivaResponses("broken", prompts)).toEqual({});
    const notes = exportVivaNotes("Example", "revision", prompts, responses);
    expect(notes).toContain("Self-assessment, not an automated grade");
    expect(notes).toContain("src/main.ts:");
    expect(notes).toContain("- [x] Identified the declaration");
  });
});
