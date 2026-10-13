import { labBundleSchema, labCanonical, labResultSchema, type JsonValue, type LabOutcome, type LabRun } from "@codemesh/shared";

export function labOutcomeText(outcome: LabOutcome): string {
  return outcome.status === "returned" ? JSON.stringify(outcome.value, null, 2) : `${outcome.status}: ${outcome.error ?? "No outcome available"}`;
}
export function labRegressionTest(run: LabRun): string | null {
  const candidate = run.result?.counterexample;
  if (!candidate || !["returned", "threw"].includes(candidate.baseline.status)) return null;
  const outcome = candidate.baseline;
  const literal = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return [
    "import test from 'node:test';", "import assert from 'node:assert/strict';",
    `import * as subject from ${literal(`./${run.request.filePath}`)};`, "",
    "// Review this baseline-derived expectation before adopting it.",
    `// Source snapshot: ${run.bundleHash}`,
    `test(${literal(`Codaventra regression: ${candidate.probe.label}`)}, async () => {`,
    `  const invoke = () => subject[${literal(run.request.exportName)}](...${literal(candidate.probe.args)});`,
    outcome.status === "returned" ? `  assert.deepEqual(await invoke(), ${literal(outcome.value)});` : `  await assert.rejects(async () => invoke(), { message: ${literal(outcome.error ?? "")} });`,
    "});", ""
  ].join("\n");
}
export async function verifyLabReceipt(text: string) {
  if (text.length > 3_000_000) throw new Error("Receipt exceeds the 3 MB limit.");
  const receipt = JSON.parse(text) as { sha256?: string; payload?: { schemaVersion?: number; run?: LabRun; snapshot?: unknown } };
  if (receipt.payload?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? "")) throw new Error("Unsupported receipt format.");
  const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (await hash(labCanonical(receipt.payload as unknown as JsonValue)) !== receipt.sha256) throw new Error("Receipt integrity check failed.");
  const run = receipt.payload.run;
  if (!run?.id || !run.projectId || !run.bundleHash) throw new Error("Missing experiment metadata.");
  if (run.result) labResultSchema.parse(run.result);
  if (receipt.payload.snapshot) {
    const snapshot = labBundleSchema.parse(receipt.payload.snapshot);
    if (await hash(labCanonical(snapshot as unknown as JsonValue)) !== run.bundleHash) throw new Error("Snapshot does not match the receipt.");
    if (run.manifest.length !== snapshot.files.length) throw new Error("Source manifest mismatch.");
    for (const file of snapshot.files) {
      const entry = run.manifest.find((item) => item.path === file.path);
      const proposed = snapshot.changes.find((item) => item.path === file.path)?.content ?? file.content;
      if (!entry || await hash(file.content) !== entry.baselineHash || await hash(proposed) !== entry.proposedHash) throw new Error("Source manifest mismatch.");
    }
  }
  return { title: run.title, revision: run.revision, sourceIncluded: Boolean(receipt.payload.snapshot), scope: run.mode, resultAvailable: Boolean(run.result) };
}
