import { describe, expect, it } from "vitest";
import { hasPermission } from "@codemesh/shared";

describe("role permissions", () => {
  it("denies viewer writes even when the UI could be bypassed", () => {
    expect(hasPermission("viewer", "workspace.edit")).toBe(false);
    expect(hasPermission("viewer", "discussion.post")).toBe(false);
    expect(hasPermission("viewer", "project.read")).toBe(true);
  });

  it("allows maintainers to review and publish contributions", () => {
    expect(hasPermission("maintainer", "workspace.review")).toBe(true);
    expect(hasPermission("maintainer", "github.publish")).toBe(true);
  });
});
