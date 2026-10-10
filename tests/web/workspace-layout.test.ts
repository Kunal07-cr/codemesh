import { describe, expect, it } from "vitest";
import { parseWorkspaceLayout, workspaceLayoutKey, workspacePresets } from "../../apps/web/src/lib/workspaceLayout";

describe("workspace layouts", () => {
  it("round-trips presets and isolates project and account keys", () => {
    for (const layout of Object.values(workspacePresets)) expect(parseWorkspaceLayout(JSON.stringify(layout))).toEqual(layout);
    expect(workspaceLayoutKey("a", "p")).not.toBe(workspaceLayoutKey("b", "p"));
    expect(workspaceLayoutKey("a", "p")).not.toBe(workspaceLayoutKey("a", "q"));
    expect(workspaceLayoutKey("a:b", "c")).not.toBe(workspaceLayoutKey("a", "b:c"));
  });
  it("recovers from invalid storage and constrains panel sizes", () => {
    for (const raw of [null, "{", "[]", "null", '{"version":2}', '{"version":1,"view":"bad"}']) expect(parseWorkspaceLayout(raw)).toEqual(workspacePresets.explore);
    expect(parseWorkspaceLayout(JSON.stringify({ ...workspacePresets.review, fileWidth: 1, assistantWidth: 9000, graphPercent: 100 }))).toMatchObject({ fileWidth: 180, assistantWidth: 440, graphPercent: 75 });
    expect(parseWorkspaceLayout(JSON.stringify({ ...workspacePresets.review, fileWidth: "200", assistantWidth: null }))).toMatchObject({ fileWidth: 260, assistantWidth: 360 });
  });
});
