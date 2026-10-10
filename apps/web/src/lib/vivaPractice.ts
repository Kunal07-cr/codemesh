import type { GraphNode } from "@codemesh/shared";
import { isPracticePath, type ChallengeContract } from "./repositoryChallenges";

export type VivaPrompt = { id: string; question: string; reference: string; source: { filePath: string; line: number; excerpt?: string }; checkpoints: string[]; followUp: string };
export type VivaResponse = { answer: string; reviewed: boolean; checked: number[] };

export function buildVivaPrompts(nodes: GraphNode[], contracts: ChallengeContract[]): VivaPrompt[] {
  const files = new Set(nodes.filter((node) => node.type === "file" && isPracticePath(node.filePath)).map((node) => node.filePath));
  const validLine = (line: number | undefined) => Number.isSafeInteger(line) && line! > 0;
  const symbols = nodes.filter((node) => node.type === "symbol" && ["function", "class", "interface", "type"].includes(node.symbolKind ?? "") && files.has(node.filePath) && isPracticePath(node.filePath) && validLine(node.range?.startLine));
  const seen = new Set<string>();
  const declarations: VivaPrompt[] = [];
  for (const node of [...symbols].sort((a, b) => a.id.localeCompare(b.id))) {
    const location = `${node.filePath}:${node.range!.startLine}`;
    if (seen.has(location)) continue;
    seen.add(location);
    declarations.push({ id: `symbol:${node.id}`, question: `Explain ${node.symbolKind} ${node.label} in ${node.filePath}. What is its responsibility, and what would you verify before changing it?`,
      reference: `The index locates ${node.symbolKind} ${node.label} at ${location}. Its recorded range is lines ${node.range!.startLine}-${node.range!.endLine}. Responsibility and behavior must be confirmed in the source.`,
      source: { filePath: node.filePath!, line: node.range!.startLine }, checkpoints: ["Identified the declaration and source location", "Explained inputs, outputs or the type contract from source", "Discussed a dependency or boundary", "Proposed an edge case and a focused verification step"], followUp: `What could break if ${node.label} changes, and what evidence would you inspect?` });
    if (declarations.length >= 12) break;
  }
  const invariants = contracts.filter((item) => files.has(item.filePath) && isPracticePath(item.filePath) && validLine(item.line) && item.evidence).slice(0, 8).map((item): VivaPrompt => ({
    id: `contract:${item.id}`, question: `Defend the contract "${item.title}". Where is it recorded, what could violate it, and how would you test that case?`, reference: item.statement,
    source: { filePath: item.filePath, line: item.line, excerpt: item.evidence }, checkpoints: ["Located the recorded evidence", "Explained the intended contract", "Described a plausible failure case", "Separated static evidence from a test that still needs to run"], followUp: "Which change would invalidate this evidence, and when should the contract be rechecked?"
  }));
  const prompts: VivaPrompt[] = [];
  for (let index = 0; index < Math.max(declarations.length, invariants.length); index++) {
    if (declarations[index]) prompts.push(declarations[index]!);
    if (invariants[index]) prompts.push(invariants[index]!);
  }
  return prompts.slice(0, 16);
}

export function parseVivaResponses(raw: string | null, prompts: VivaPrompt[]): Record<string, VivaResponse> {
  const responses: Record<string, VivaResponse> = {};
  try {
    const value = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return responses;
    for (const prompt of prompts) {
      const item = value[prompt.id];
      if (!item || typeof item.answer !== "string") continue;
      const checked: unknown[] = Array.isArray(item.checked) ? item.checked : [];
      responses[prompt.id] = { answer: item.answer.slice(0, 6000), reviewed: item.reviewed === true, checked: [...new Set(checked.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < prompt.checkpoints.length))] };
    }
  } catch { /* Ignore corrupt or older device drafts. */ }
  return responses;
}

export function exportVivaNotes(projectName: string, commitSha: string, prompts: VivaPrompt[], responses: Record<string, VivaResponse>): string {
  const clean = (text: string) => text.replace(/[<>]/g, "");
  return [`# ${clean(projectName).replace(/[\r\n]/g, " ")}: Viva Rehearsal`, "", `Indexed revision: ${clean(commitSha)}`, "Self-assessment, not an automated grade or runtime verification.", "", ...prompts.flatMap((prompt, index) => {
    const response = responses[prompt.id];
    return [`## ${index + 1}. ${clean(prompt.question)}`, "", "### My explanation", clean(response?.answer ?? "Not answered"), "", "### Source reference", `${clean(prompt.source.filePath)}:${prompt.source.line}`, clean(prompt.reference), ...(prompt.source.excerpt ? [clean(prompt.source.excerpt)] : []), "", ...prompt.checkpoints.map((label, checkpoint) => `- [${response?.checked.includes(checkpoint) ? "x" : " "}] ${label}`), "", `Follow-up: ${clean(prompt.followUp)}`, ""];
  })].join("\n");
}
