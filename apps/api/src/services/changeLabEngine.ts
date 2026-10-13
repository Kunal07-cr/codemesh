import { createHash } from "node:crypto";
import {
  compareLabProbe, generateLabBoundaries, labCanonical, labOutcomeKey, labShrinkCandidates,
  type LabBundle, type LabOutcome, type LabProbe, type LabResult
} from "@codemesh/shared";

export type LabExecute = (files: LabBundle["files"], probe: LabProbe, signal: AbortSignal) => Promise<LabOutcome>;
export const labHash = (content: string) => createHash("sha256").update(content).digest("hex");

export async function runChangeExperiment(bundle: LabBundle, execute: LabExecute, environment: LabResult["environment"], signal: AbortSignal): Promise<LabResult> {
  const proposed = bundle.files.map((file) => bundle.changes.find((change) => change.path === file.path) ?? file);
  const probes = bundle.request.generateBoundaries ? generateLabBoundaries(bundle.request.probes) : bundle.request.probes;
  const comparisons: LabResult["comparisons"] = [];
  const investigation: LabResult["investigation"] = [];
  let executionCount = 0;
  const invoke: LabExecute = async (files, probe, abort) => {
    abort.throwIfAborted();
    if (++executionCount > 64) throw new Error("The execution budget was exhausted.");
    return execute(files, structuredClone(probe), abort);
  };
  for (const probe of probes) {
    const baseline = await invoke(bundle.files, probe, signal);
    const after = await invoke(proposed, probe, signal);
    comparisons.push(compareLabProbe(probe, baseline, after));
  }
  const candidate = comparisons.find((item) => item.verdict === "regression") ?? comparisons.find((item) => item.verdict === "changed");
  let counterexample: LabResult["counterexample"] = null;
  let stability: LabResult["stability"] = null;
  if (candidate) {
    const baseline = await invoke(bundle.files, candidate.probe, signal), after = await invoke(proposed, candidate.probe, signal);
    stability = { probeId: candidate.probe.id, baseline, proposed: after, repeatMatched: labOutcomeKey(baseline) !== null && labOutcomeKey(after) !== null && labOutcomeKey(baseline) === labOutcomeKey(candidate.baseline) && labOutcomeKey(after) === labOutcomeKey(candidate.proposed) };
    if (!stability.repeatMatched) { candidate.verdict = "inconclusive"; candidate.reason = "Repeating this case did not reproduce the recorded outcomes; investigation was withheld."; }
  }
  if (candidate && stability?.repeatMatched) {
    counterexample = { originalProbeId: candidate.probe.id, probe: candidate.probe, baseline: candidate.baseline, proposed: candidate.proposed, attempts: 0 };
    // Bounded search for a smaller differing input, not a claim of global minimality.
    const shrinkLimit = Math.min(6, Math.floor((64 - executionCount - (bundle.request.investigate ? bundle.changes.length : 0)) / 2));
    for (const args of labShrinkCandidates(candidate.probe.args).slice(0, shrinkLimit)) {
      const probe: LabProbe = { id: "minimized-case", label: "Smaller behavioral difference", args, generated: true };
      const baseline = await invoke(bundle.files, probe, signal), after = await invoke(proposed, probe, signal);
      counterexample.attempts++;
      if (baseline.status === "returned" && labOutcomeKey(after) !== null && labOutcomeKey(baseline) !== labOutcomeKey(after) && labCanonical(args).length < labCanonical(counterexample.probe.args).length) {
        counterexample = { ...counterexample, probe, baseline, proposed: after };
      }
    }
    if (bundle.request.investigate) {
      for (const change of bundle.changes) {
        const reverted = proposed.map((file) => file.path === change.path ? bundle.files.find((base) => base.path === file.path)! : file);
        const outcome = await invoke(reverted, candidate.probe, signal);
        investigation.push({ revertedPath: change.path, probeId: candidate.probe.id, outcome, matchesBaseline: labOutcomeKey(outcome) !== null && labOutcomeKey(outcome) === labOutcomeKey(candidate.baseline) });
      }
    }
  }
  return {
    comparisons, investigation, counterexample, stability, executionCount, environment,
    unknowns: [
      "Results cover only these inputs, this source snapshot, and this environment; they do not establish universal safety.",
      "Replay records export calls, console output, and outcomes. Internal function calls are not instrumented.",
      "Boundary inputs are deterministic heuristics, not exhaustive fuzzing or AI-generated correctness oracles.",
      "File reversions suggest contributing changes; interacting edits and nondeterministic code can invalidate causal conclusions.",
      "Durations are observations, not controlled performance benchmarks. Randomness, wall clocks, and external state are not virtualized.",
      "Repository-produced outputs are untrusted observations. Receipt hashes detect alteration, not worker authenticity or malicious output fabrication."
    ]
  };
}

export const examplePath = "examples/session-boundary.mjs";
export function originalSession(expiresAt: number, now: number) {
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) throw new Error("Finite timestamps required");
  return { accepted: now < expiresAt };
}
export function changedSession(expiresAt: number, now: number) {
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) throw new Error("Finite timestamps required");
  return { accepted: now <= expiresAt };
}
export function exampleBundle(): LabBundle {
  return {
    files: [{ path: examplePath, content: `export ${originalSession.toString()}` }],
    changes: [{ path: examplePath, content: `export ${changedSession.toString().replace("changedSession", "originalSession")}` }],
    request: {
      title: "Session expiry boundary", patchId: "built-in-example", filePath: examplePath, exportName: "originalSession",
      probes: [
        { id: "valid", label: "Before expiry", args: [1000, 999], expected: { accepted: true } },
        { id: "expiry", label: "Exactly at expiry", args: [1000, 1000], expected: { accepted: false } },
        { id: "expired", label: "After expiry", args: [1000, 1001], expected: { accepted: false } }
      ], generateBoundaries: true, investigate: true
    }
  };
}
export async function runLabExample(signal: AbortSignal) {
  const bundle = exampleBundle();
  return runChangeExperiment(bundle, async (files, probe) => {
    const started = performance.now();
    const events: LabOutcome["events"] = [{ kind: "call", filePath: examplePath, exportName: "originalSession", detail: JSON.stringify(probe.args), offsetMs: 0 }];
    try {
      const fn = files[0]!.content === bundle.files[0]!.content ? originalSession : changedSession;
      const value = fn(probe.args[0] as number, probe.args[1] as number);
      const durationMs = performance.now() - started;
      events.push({ kind: "return", filePath: examplePath, exportName: "originalSession", detail: JSON.stringify(value), offsetMs: durationMs });
      return { status: "returned", value, durationMs, events };
    } catch (error) {
      const durationMs = performance.now() - started, message = error instanceof Error ? error.message : "Example error";
      events.push({ kind: "throw", filePath: examplePath, exportName: "originalSession", detail: message, offsetMs: durationMs });
      return { status: "threw", error: message, durationMs, events };
    }
  }, { runtime: `Node ${process.versions.node}`, image: "Codaventra built-in fixture", isolation: "Trusted built-in functions only. No imported repository code executed.", command: "originalSession(...args), baseline and changed fixture" }, signal);
}
