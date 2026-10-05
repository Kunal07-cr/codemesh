import { describe, expect, it } from "vitest";
import { loadAssistantDataset } from "../../apps/api/src/services/assistantDataset";

describe("assistant dataset", () => {
  it("loads the bundled corpus with explicit synthetic provenance", async () => {
    const dataset = await loadAssistantDataset();
    const summary = dataset.getSummary();

    expect(summary.synthetic).toBe(true);
    expect(summary.counts.repositories).toBe(12);
    expect(summary.counts.rag_chunks).toBe(48);
    expect(summary.repositories).toHaveLength(12);
    expect(summary.limitations.some((limitation) => limitation.includes("Not collected from GitHub"))).toBe(true);
  });

  it("answers an exact fixture question with dataset citations", async () => {
    const dataset = await loadAssistantDataset();
    const result = dataset.search("What does save_item do?", "r001", "dataset");

    expect(result.answer).toMatch(/validates the item/i);
    expect(result.answer).toMatch(/does not persist data/i);
    expect(result.preferDataset).toBe(true);
    expect(result.citations.some((citation) => citation.sourceType === "dataset" && citation.chunkId === "r001-chunk-2")).toBe(true);
  });

  it("preserves unanswerable examples instead of inventing credentials", async () => {
    const dataset = await loadAssistantDataset();
    const result = dataset.search("What production database credentials does this repository use?", "r001", "dataset");

    expect(result.answerable).toBe(false);
    expect(result.answer).toMatch(/does not contain production database credentials/i);
    expect(result.citations).toHaveLength(0);
  });

  it("summarizes pull-request workflow metadata without claiming real diffs", async () => {
    const dataset = await loadAssistantDataset();
    const result = dataset.search("Summarize pull request and CI status", undefined, "dataset");

    expect(result.answer).toMatch(/representative pull requests/i);
    expect(result.answer).toMatch(/not actual diffs/i);
    expect(result.citations.some((citation) => citation.filePath.endsWith("pull_requests.json"))).toBe(true);
  });
});
