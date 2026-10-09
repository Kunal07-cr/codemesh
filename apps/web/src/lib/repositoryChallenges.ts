import type { GraphNode } from "@codemesh/shared";

export type ChallengeCategory = "symbols" | "ranges" | "contracts";
export type ChallengeContract = { id: string; title: string; filePath: string; line: number; evidence: string; statement: string };
export type RepositoryChallenge = {
  id: string;
  category: ChallengeCategory;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  source: { filePath: string; line: number; excerpt?: string };
};

const supportedKinds = new Set(["function", "class", "interface", "type"]);
const validLine = (line: number | undefined): line is number => Number.isSafeInteger(line) && line! > 0;
const safePath = (path: string | undefined): path is string => Boolean(path && path.length <= 1000 && !/[\\\r\n]|(^\/)|(^[a-z]+:)|(^|\/)\.\.($|\/)|(^|\/)(\.env(?:\.[^/]*)?|credentials[^/]*|[^/]*\.pem)($|\/)/i.test(path));

// Stable variety across practice rounds, not security-sensitive randomness.
function rank(value: string, seed: string) {
  let hash = 2166136261;
  for (const character of seed + value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shuffled<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => rank(key(a), seed) - rank(key(b), seed) || key(a).localeCompare(key(b)));
}

function choicesFor(answer: string, alternatives: string[], seed: string): string[] {
  const distractors = shuffled([...new Set(alternatives)].filter((item) => item !== answer), seed, (item) => item).slice(0, 3);
  return distractors.length < 2 ? [] : shuffled([answer, ...distractors], seed + ":choices", (item) => item);
}

export function buildChallengeDeck(nodes: GraphNode[], contracts: ChallengeContract[], seed: string): RepositoryChallenge[] {
  const files = [...new Set(nodes.filter((node) => node.type === "file" && safePath(node.filePath)).map((node) => node.filePath!))];
  const fileSet = new Set(files);
  const symbols = nodes.filter((node) => node.type === "symbol" && supportedKinds.has(node.symbolKind ?? "") && safePath(node.filePath) && fileSet.has(node.filePath) && validLine(node.range?.startLine));
  const candidates: RepositoryChallenge[] = [];
  const nameCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const fileSymbols = new Map<string, string[]>();
  for (const node of symbols) {
    const name = `${node.symbolKind}:${node.label}`;
    const location = `${node.filePath}:${node.range!.startLine}`;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
    const peers = fileSymbols.get(node.filePath!) ?? [];
    peers.push(`${node.symbolKind} ${node.label}`);
    fileSymbols.set(node.filePath!, peers);
  }

  for (const node of shuffled(symbols, seed, (item) => item.id).slice(0, 48)) {
    const source = { filePath: node.filePath!, line: node.range!.startLine };
    const name = `${node.symbolKind}:${node.label}`;
    if (nameCounts.get(name) === 1) {
      const choices = choicesFor(source.filePath, files, seed + node.id);
      if (choices.length) candidates.push({ id: `symbol:${node.id}`, category: "symbols", question: `Which indexed file declares the ${node.symbolKind} ${node.label}?`, choices, answer: source.filePath, explanation: `The index records ${node.label} at ${source.filePath}:${source.line}.`, source });
    }
    if (locationCounts.get(`${source.filePath}:${source.line}`) === 1) {
      const peers = fileSymbols.get(source.filePath) ?? [];
      const answer = `${node.symbolKind} ${node.label}`;
      const choices = choicesFor(answer, peers, seed + node.id + ":range");
      if (choices.length) candidates.push({ id: `range:${node.id}`, category: "ranges", question: `Which indexed declaration begins at line ${source.line} in ${source.filePath}?`, choices, answer, explanation: `The indexed source range for ${node.label} starts at line ${source.line}.`, source });
    }
  }

  const titleCounts = new Map<string, number>();
  for (const contract of contracts) titleCounts.set(contract.title, (titleCounts.get(contract.title) ?? 0) + 1);
  for (const contract of shuffled(contracts, seed, (item) => item.id).slice(0, 24)) {
    if (!safePath(contract.filePath) || !fileSet.has(contract.filePath) || !validLine(contract.line) || !contract.evidence || titleCounts.get(contract.title) !== 1) continue;
    const choices = choicesFor(contract.filePath, files, seed + contract.id);
    if (choices.length) candidates.push({ id: `contract:${contract.id}`, category: "contracts", question: `Where does the Invariant Ledger record "${contract.title}"?`, choices, answer: contract.filePath, explanation: contract.statement, source: { filePath: contract.filePath, line: contract.line, excerpt: contract.evidence } });
  }

  const groups = (["symbols", "ranges", "contracts"] as const).map((category) => shuffled(candidates.filter((item) => item.category === category), seed, (item) => item.id));
  const deck: RepositoryChallenge[] = [];
  for (let index = 0; deck.length < 24 && groups.some((group) => group[index]); index++) {
    for (const group of groups) if (group[index] && deck.length < 24) deck.push(group[index]!);
  }
  return deck;
}

export function exportChallengeNotes(projectName: string, commitSha: string, deck: RepositoryChallenge[], answers: Record<string, string>): string {
  const clean = (value: string) => value.replace(/[\r\n<>]/g, " ");
  return [`# ${clean(projectName)}: Repository Challenge Notes`, "", `Indexed revision: ${clean(commitSha)}`, "", "Static index practice, not runtime verification.", "", ...deck.flatMap((item, index) => [
    `## ${index + 1}. ${clean(item.question)}`, "", `Answer: ${clean(item.answer)}`,
    `Source: ${clean(item.source.filePath)}:${item.source.line}`,
    `Result: ${answers[item.id] ? answers[item.id] === item.answer ? "Correct" : "Needs review" : "Not answered"}`,
    clean(item.explanation), ...(item.source.excerpt ? ["", "Source excerpt:", item.source.excerpt.replace(/[<>]/g, "")] : []), ""
  ])].join("\n");
}
