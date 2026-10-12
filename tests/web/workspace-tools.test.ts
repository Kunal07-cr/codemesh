import { describe, expect, it } from "vitest";
import { annotationsForNode, buildFileTree, nodeAtLine, parsePinnedPaths } from "../../apps/web/src/lib/workspaceNavigation";
import { classifyDraft, clearUserDrafts, draftKey, readDraft, writeDraft, type DraftScope, type DraftStorage } from "../../apps/web/src/lib/workspaceDrafts";
import type { CodeAnnotation, GraphNode } from "@codemesh/shared";

function storage(): DraftStorage {
  const entries = new Map<string, string>();
  return { get length() { return entries.size; }, getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: (key) => { entries.delete(key); }, key: (index) => [...entries.keys()][index] ?? null };
}
const scope: DraftScope = { userId: "owner", projectId: "project", workspaceId: "main", kind: "code", path: "src/main.ts" };
const draft = { content: "edited", baseContent: "original", revision: "commit-a", savedAt: 1000 };
const node = (id: string, type: GraphNode["type"], filePath: string, symbolId?: string, startLine = 1, endLine = 20): GraphNode => ({ id, type, label: id, filePath, symbolId, range: { startLine, endLine, startColumn: 1, endColumn: 1 } } as GraphNode);

describe("recoverable workspace drafts", () => {
  it("scopes code by identity, project, workspace, path and draft kind", () => {
    const db = storage(); expect(writeDraft(db, scope, draft)).toBe(true);
    for (const replacement of [{ userId: "other" }, { projectId: "other" }, { workspaceId: "other" }, { path: "other.ts" }, { kind: "chat" as const }]) expect(readDraft(db, { ...scope, ...replacement }, 1001)).toBeNull();
    expect(readDraft(db, scope, 1001)).toEqual(draft);
    expect(draftKey({ ...scope, userId: "a:b" })).not.toBe(draftKey({ ...scope, userId: "a", projectId: "b:project" }));
  });
  it("expires drafts and rejects malformed/future cache entries", () => {
    const db = storage(); writeDraft(db, scope, draft);
    expect(readDraft(db, scope, 1000 + 8 * 86400000)).toBeNull(); expect(db.length).toBe(0);
    db.setItem(draftKey(scope), JSON.stringify({ ...draft, savedAt: 100000 })); expect(readDraft(db, scope, 1000)).toBeNull();
    db.setItem(draftKey(scope), "{invalid"); expect(readDraft(db, scope, 1000)).toBeNull();
  });
  it("distinguishes acknowledged drafts from safe bases and conflicts", () => {
    expect(classifyDraft(draft, "edited", "commit-b")).toBe("synced");
    expect(classifyDraft(draft, "original", "commit-a")).toBe("recoverable");
    expect(classifyDraft(draft, "teammate", "commit-a")).toBe("conflict");
    expect(classifyDraft(draft, "original", "commit-b")).toBe("conflict");
  });
  it("retains empty code drafts but clears empty composers", () => {
    const db = storage(); writeDraft(db, scope, { ...draft, content: "" }); expect(readDraft(db, scope, 1001)?.content).toBe("");
    writeDraft(db, { ...scope, kind: "chat" }, draft); writeDraft(db, { ...scope, kind: "chat" }, { ...draft, content: "" }); expect(db.length).toBe(1);
  });
  it("bounds the cache and clears only the signing-out identity", () => {
    const db = storage();
    for (let index = 0; index < 30; index++) writeDraft(db, { ...scope, path: `file-${index}` }, { ...draft, savedAt: 1000 + index });
    expect(db.length).toBe(20);
    writeDraft(db, { ...scope, userId: "other" }, draft);
    clearUserDrafts(db, "owner"); expect(db.length).toBe(1); expect(readDraft(db, { ...scope, userId: "other" }, 1001)).toEqual(draft);
  });
  it("reports storage failure and refuses guest/oversized drafts", () => {
    const db = storage(); db.setItem = () => { throw new Error("Quota exceeded"); };
    expect(writeDraft(db, scope, draft)).toBe(false);
    expect(writeDraft(storage(), { ...scope, userId: "guest" }, draft)).toBe(false);
    expect(writeDraft(storage(), scope, { ...draft, content: "x".repeat(500001) })).toBe(false);
  });
});

describe("source navigation and annotations", () => {
  it("builds sorted deduplicated folders without prototype-key collisions", () => {
    const tree = buildFileTree(["src/b.ts", "README.md", "src/a.ts", "src/a.ts", "__proto__/x.ts"]);
    expect(tree.map((entry) => entry.name)).toEqual(["__proto__", "src", "README.md"]);
    expect(tree[1]!.children!.map((entry) => entry.name)).toEqual(["a.ts", "b.ts"]);
  });
  it("prefers the narrowest containing source symbol", () => {
    const nodes = [node("file", "file", "a.ts"), node("outer", "symbol", "a.ts", "outer", 1, 20), node("inner", "symbol", "a.ts", "inner", 5, 8)];
    expect(nodeAtLine(nodes, "a.ts", 6)?.id).toBe("inner");
    expect(nodeAtLine(nodes, "a.ts", 50)?.id).toBe("file");
    expect(nodeAtLine(nodes, "missing", 6)).toBeUndefined();
  });
  it("never shows another file's annotation for an undefined symbol", () => {
    const annotations = [{ filePath: "a.ts" }, { filePath: "b.ts" }, { filePath: "a.ts", symbolId: "fn" }] as CodeAnnotation[];
    expect(annotationsForNode(annotations, node("file", "file", "a.ts"))).toEqual([annotations[0]]);
    expect(annotationsForNode(annotations, node("fn", "symbol", "a.ts", "fn"))).toEqual([annotations[2]]);
  });
  it("validates pinned tabs against imported files and caps their number", () => {
    expect(parsePinnedPaths('["a.ts","a.ts","missing",5]', ["a.ts"])).toEqual(["a.ts"]);
    expect(parsePinnedPaths("invalid", ["a.ts"])).toEqual([]);
    const known = Array.from({ length: 20 }, (_, index) => `${index}.ts`);
    expect(parsePinnedPaths(JSON.stringify(known), known)).toHaveLength(12);
  });
});
