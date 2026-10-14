import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicEngineeringRun } from "../../packages/shared/src/index";
import { EngineeringClarification } from "../../apps/web/src/components/EngineeringClarification";

function render(input: Partial<PublicEngineeringRun> = {}) {
  const run = { id: "fixture", status: "needs_input", attempts: 1, maxAttempts: 3, ...input } as PublicEngineeringRun;
  return renderToStaticMarkup(createElement(EngineeringClarification, { run, busy: false, onSubmit() {} }));
}

describe("engineering clarification surface", () => {
  it("shows a bounded, labeled follow-up for an eligible run", () => {
    const html = render();
    expect(html).toContain("Clarify and continue"); expect(html).toContain("Next attempt: 2 / 3");
    expect(html).toContain('maxLength="2000"'); expect(html).toContain("Clarification<textarea");
  });
  it.each([
    { status: "running" as const }, { status: "awaiting_review" as const }, { status: "cancelled" as const },
    { attempts: 3 }, { corpusId: "benchmark" }
  ])("does not offer a follow-up for an unavailable run %j", (input) => { expect(render(input)).toBe(""); });
  it("keeps instruction history after completion and escapes source-like content", () => {
    const html = render({ status: "awaiting_review", clarifications: [{ instruction: '<script>alert("fixture")</script>', createdAt: "2026-10-14T09:00:00Z", attempt: 2 }] });
    expect(html).toContain("Clarification history (1)"); expect(html).toContain("Attempt 2");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).not.toContain("Clarify and continue");
  });
});
