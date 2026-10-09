import { describe, expect, it } from "vitest";
import { exportTrail, parseTrail, recordTrailVisit, trailLocation } from "../../apps/web/src/lib/investigationTrail";

describe("investigation trail", () => {
  it("keeps only same-project locations and removes prompt or secret query parameters", () => {
    expect(trailLocation("p", "/projects/p/workspace?path=src%2Fauth.ts&line=7&token=private&prompt=secret")).toEqual({ href: "/projects/p/workspace?path=src%2Fauth.ts&line=7", label: "Source workspace", source: "src/auth.ts" });
    for (const href of ["https://evil.test/projects/p", "//evil.test/projects/p", "/projects/p2/workspace", "/projects/p/../../dashboard", "/projects/p/unknown", "/projects/p\\evil"]) expect(trailLocation("p", href)).toBeNull();
  });

  it("recovers from corrupt browser storage and normalizes saved entries", () => {
    expect(parseTrail("p", "not json")).toEqual([]);
    const entries = parseTrail("p", JSON.stringify([null, { href: "https://evil.test", pinned: true }, { href: "/projects/p/labs?lab=invariants", label: "tampered", note: "a".repeat(3000), pinned: true }, { href: "/projects/p/labs?lab=invariants" }]));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("Invariant Ledger");
    expect(entries[0]?.note).toHaveLength(2000);
    expect(entries[0]?.pinned).toBe(true);
  });

  it("deduplicates revisits, preserves notes, and retains pins when history fills", () => {
    let trail = recordTrailVisit([], "p", "/projects/p/workspace?path=auth.ts");
    trail[0] = { ...trail[0]!, pinned: true, note: "Check authorization" };
    for (let n = 0; n < 45; n++) trail = recordTrailVisit(trail, "p", `/projects/p/workspace?path=file${n}.ts`);
    expect(trail).toHaveLength(40);
    expect(trail.some((item) => item.pinned && item.note === "Check authorization")).toBe(true);
    trail = recordTrailVisit(trail, "p", "/projects/p/workspace?path=auth.ts");
    expect(trail[0]?.note).toBe("Check authorization");
    expect(recordTrailVisit(trail, "p", trail[0]!.href)).toBe(trail);
    const markdown = exportTrail("My project", trail);
    expect(markdown).toContain("Check authorization");
    expect(markdown).toContain("auth.ts");
  });
});
