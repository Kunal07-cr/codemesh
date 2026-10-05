import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Citation } from "@codemesh/shared";

type DatasetManifest = {
  schema_version: string;
  is_synthetic: boolean;
  snapshot_date: string;
  counts: Record<string, number>;
  limitations: string[];
};

type DatasetRepository = {
  id: string;
  name: string;
  full_name: string;
  description: string;
  language: string;
  topics: string[];
  stars: number;
  forks: number;
  split: "train" | "validation" | "test";
  contributor_ids: string[];
  open_issues_count: number;
  open_prs_count: number;
};

type DatasetChunk = {
  id: string;
  repository_id: string;
  file_id: string;
  symbol_id: string;
  path: string;
  start_line: number;
  end_line: number;
  text: string;
  split: string;
};

type DatasetQa = {
  id: string;
  repository_id: string;
  question: string;
  reference_answer: string;
  relevant_chunk_ids: string[];
  answerable: boolean;
  split: string;
};

type DatasetFile = { id: string; repository_id: string; path: string; language: string; line_count: number };
type DatasetSymbol = { id: string; repository_id: string; file_id: string; name: string; kind: string; start_line: number; end_line: number };
type DatasetEdge = { id: string; repository_id: string; source: string; target: string; type: string };
type DatasetContributor = { id: string; login: string; display_name: string; is_synthetic: boolean };
type DatasetCommit = { id: string; repository_id: string; author_id: string; message: string; committed_at: string; file_changes: Array<{ file_id: string; additions: number; deletions: number }> };
type DatasetIssue = { id: string; repository_id: string; number: number; title: string; body: string; state: string; labels: string[]; author_id: string; assignee_id: string | null; related_file_ids: string[] };
type DatasetPullRequest = { id: string; repository_id: string; number: number; title: string; state: string; author_id: string; reviewer_ids: string[]; linked_issue_ids: string[]; changed_file_ids: string[]; ci_status: string; note: string };
type DatasetActivity = { id: string; repository_id: string; date: string; commit_count: number; additions: number; deletions: number };
type DatasetCollaborationEvent = { id: string; repository_id: string; user_id: string; type: string; symbol_id: string | null; text: string | null; timestamp: string };

export type AssistantDatasetSummary = {
  available: boolean;
  synthetic: true;
  snapshotDate: string;
  counts: Record<string, number>;
  limitations: string[];
  repositories: Array<Pick<DatasetRepository, "id" | "name" | "description" | "language" | "topics" | "split" | "open_issues_count" | "open_prs_count">>;
  suggestions: Array<{ question: string; repositoryId?: string }>;
};

export type AssistantDatasetSearch = {
  answer: string;
  context: string;
  citations: Citation[];
  chunkIds: string[];
  relevance: number;
  preferDataset: boolean;
  repositoryIds: string[];
  answerable: boolean;
  synthetic: true;
};

const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "does", "for", "from", "how", "in", "is", "it", "of", "on", "or", "the", "this", "to", "what", "which", "with"]);

export class AssistantDataset {
  private readonly repositoryById: Map<string, DatasetRepository>;
  private readonly symbolById: Map<string, DatasetSymbol>;
  private readonly contributorById: Map<string, DatasetContributor>;

  constructor(
    private readonly manifest: DatasetManifest,
    private readonly repositories: DatasetRepository[],
    private readonly chunks: DatasetChunk[],
    private readonly qaExamples: DatasetQa[],
    private readonly files: DatasetFile[],
    private readonly symbols: DatasetSymbol[],
    private readonly edges: DatasetEdge[],
    private readonly contributors: DatasetContributor[],
    private readonly commits: DatasetCommit[],
    private readonly issues: DatasetIssue[],
    private readonly pullRequests: DatasetPullRequest[],
    private readonly activity: DatasetActivity[],
    private readonly collaborationEvents: DatasetCollaborationEvent[]
  ) {
    this.repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));
    this.symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
    this.contributorById = new Map(contributors.map((contributor) => [contributor.id, contributor]));
  }

  getSummary(): AssistantDatasetSummary {
    return {
      available: true,
      synthetic: true,
      snapshotDate: this.manifest.snapshot_date,
      counts: this.manifest.counts,
      limitations: this.manifest.limitations,
      repositories: this.repositories.map(({ id, name, description, language, topics, split, open_issues_count, open_prs_count }) => ({ id, name, description, language, topics, split, open_issues_count, open_prs_count })),
      suggestions: [
        { question: "What does save_item do?", repositoryId: "r001" },
        { question: "Which open issues affect validation?", repositoryId: "r001" },
        { question: "Summarize pull-request and CI status across the dataset." },
        { question: "Compare repository activity and contributor participation." }
      ]
    };
  }

  search(question: string, requestedRepositoryId?: string, scope: "combined" | "dataset" = "combined"): AssistantDatasetSearch {
    const normalized = normalize(question);
    const terms = tokenize(question);
    const namedRepository = this.repositories.find((repository) => normalized.includes(normalize(repository.name)));
    const selectedRepository = this.repositoryById.get(requestedRepositoryId ?? "") ?? namedRepository;
    const repositoryIds = selectedRepository ? [selectedRepository.id] : this.repositories.map((repository) => repository.id);
    const qaCandidates = this.qaExamples.filter((example) => repositoryIds.includes(example.repository_id));
    const qaRanked = qaCandidates
      .map((example) => ({ example, score: similarity(terms, tokenize(example.question), normalized === normalize(example.question)) }))
      .sort((a, b) => b.score - a.score);
    const exactQa = qaRanked[0]?.score >= 0.72 ? qaRanked[0] : undefined;

    const rankedChunks = this.chunks
      .filter((chunk) => repositoryIds.includes(chunk.repository_id))
      .map((chunk) => {
        const repository = this.repositoryById.get(chunk.repository_id)!;
        const symbol = this.symbolById.get(chunk.symbol_id);
        const haystack = `${repository.name} ${repository.description} ${repository.topics.join(" ")} ${chunk.path} ${symbol?.name ?? ""} ${chunk.text}`;
        return { chunk, score: lexicalScore(terms, haystack, symbol?.name, chunk.path) };
      })
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));

    const forcedChunkIds = new Set(exactQa?.example.relevant_chunk_ids ?? []);
    const hits = exactQa && !exactQa.example.answerable
      ? []
      : rankedChunks.filter((entry) => entry.score > 0 || forcedChunkIds.has(entry.chunk.id)).slice(0, 6);
    const relevantRepositories = [...new Set((hits.length ? hits.map((hit) => hit.chunk.repository_id) : repositoryIds.slice(0, 3)))];
    const intent = detectIntent(question);
    const records = this.recordsForIntent(intent, relevantRepositories, terms);
    const codeCitations = hits.map(({ chunk }) => this.chunkCitation(chunk));
    const citations = [...records.citations, ...codeCitations].filter(uniqueCitation).slice(0, 8);
    const chunkIds = [...new Set([...records.recordIds, ...hits.map((hit) => hit.chunk.id)])];
    const topChunkScore = hits[0]?.score ?? 0;
    const relevance = Math.min(1, Math.max(exactQa?.score ?? 0, topChunkScore / Math.max(4, terms.length * 4), records.relevance));
    const answerable = exactQa ? exactQa.example.answerable : citations.length > 0 || records.relevance > 0;
    const answer = exactQa
      ? exactQa.example.reference_answer
      : records.answer || this.codeAnswer(hits.map((hit) => hit.chunk), selectedRepository);
    const context = this.buildContext(question, selectedRepository, exactQa?.example, records.context, hits.map((hit) => hit.chunk));

    return {
      answer,
      context,
      citations,
      chunkIds,
      relevance,
      preferDataset: scope === "dataset" || Boolean(namedRepository) || Boolean(exactQa),
      repositoryIds: relevantRepositories,
      answerable,
      synthetic: true
    };
  }

  private recordsForIntent(intent: ReturnType<typeof detectIntent>, repositoryIds: string[], terms: string[]) {
    if (intent === "issues") {
      const issues = rankRecords(this.issues.filter((issue) => repositoryIds.includes(issue.repository_id)), terms, (issue) => `${issue.title} ${issue.body} ${issue.labels.join(" ")}`).slice(0, 6);
      return {
        answer: issues.length ? `Open dataset issues include ${issues.map((issue) => `${this.repositoryName(issue.repository_id)} #${issue.number}: ${issue.title}`).join("; ")}.` : "No matching issue is present in the selected synthetic dataset scope.",
        context: issues.map((issue) => `Issue ${this.repositoryName(issue.repository_id)} #${issue.number} [${issue.state}]: ${issue.title}\n${issue.body}`).join("\n\n"),
        citations: issues.map((issue) => this.recordCitation(issue.repository_id, "issues.json", issue.id, `${issue.title}. ${issue.body}`)),
        recordIds: issues.map((issue) => issue.id), relevance: issues.length ? 0.85 : 0
      };
    }
    if (intent === "pull_requests") {
      const prs = this.pullRequests.filter((pullRequest) => repositoryIds.includes(pullRequest.repository_id)).slice(0, 8);
      const statuses = countBy(prs, (pullRequest) => `${pullRequest.state}/${pullRequest.ci_status}`);
      return {
        answer: prs.length ? `The selected dataset scope contains ${prs.length} representative pull requests. Status summary: ${formatCounts(statuses)}. These records contain workflow metadata, not actual diffs.` : "No pull-request record is present in the selected synthetic dataset scope.",
        context: prs.map((pullRequest) => `PR ${this.repositoryName(pullRequest.repository_id)} #${pullRequest.number}: ${pullRequest.title}; state=${pullRequest.state}; CI=${pullRequest.ci_status}; reviewers=${pullRequest.reviewer_ids.join(", ") || "none"}`).join("\n"),
        citations: prs.slice(0, 5).map((pullRequest) => this.recordCitation(pullRequest.repository_id, "pull_requests.json", pullRequest.id, `#${pullRequest.number} ${pullRequest.title}; ${pullRequest.state}; CI ${pullRequest.ci_status}. ${pullRequest.note}`)),
        recordIds: prs.map((pullRequest) => pullRequest.id), relevance: prs.length ? 0.8 : 0
      };
    }
    if (intent === "contributors") {
      const commits = this.commits.filter((commit) => repositoryIds.includes(commit.repository_id));
      const contributionCounts = countBy(commits, (commit) => commit.author_id);
      const leaders = [...contributionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      return {
        answer: leaders.length ? `The most active synthetic contributors in this scope are ${leaders.map(([id, count]) => `${this.contributorById.get(id)?.display_name ?? id} (${count} commits)`).join(", ")}.` : "No contributor activity is present in the selected dataset scope.",
        context: leaders.map(([id, count]) => `${this.contributorById.get(id)?.display_name ?? id}: ${count} simulated commits`).join("\n"),
        citations: leaders.map(([id, count]) => this.recordCitation(repositoryIds[0] ?? "all", "contributors.json", id, `${this.contributorById.get(id)?.display_name ?? id}: ${count} simulated commits.`)),
        recordIds: leaders.map(([id]) => id), relevance: leaders.length ? 0.75 : 0
      };
    }
    if (intent === "activity") {
      const activity = this.activity.filter((day) => repositoryIds.includes(day.repository_id));
      const commits = activity.reduce((sum, day) => sum + day.commit_count, 0);
      const additions = activity.reduce((sum, day) => sum + day.additions, 0);
      const deletions = activity.reduce((sum, day) => sum + day.deletions, 0);
      const byRepository = countBy(activity, (day) => day.repository_id, (day) => day.commit_count);
      const leaders = [...byRepository.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        answer: activity.length ? `Simulated activity totals ${commits} commits, ${additions} additions, and ${deletions} deletions. Highest commit totals: ${leaders.map(([id, count]) => `${this.repositoryName(id)} (${count})`).join(", ")}.` : "No activity records are present in the selected dataset scope.",
        context: `Activity totals: commits=${commits}, additions=${additions}, deletions=${deletions}.\n${leaders.map(([id, count]) => `${this.repositoryName(id)}: ${count} commits`).join("\n")}`,
        citations: leaders.map(([id, count]) => this.recordCitation(id, "activity.json", `${id}-activity`, `${this.repositoryName(id)} has ${count} simulated commits in the activity table.`)),
        recordIds: leaders.map(([id]) => `${id}-activity`), relevance: activity.length ? 0.75 : 0
      };
    }
    if (intent === "graph") {
      const edges = this.edges.filter((edge) => repositoryIds.includes(edge.repository_id));
      const edgeTypes = countBy(edges, (edge) => edge.type);
      return {
        answer: edges.length ? `The synthetic graph contains ${edges.length} relationships in this scope: ${formatCounts(edgeTypes)}.` : "No graph relationships are present in the selected dataset scope.",
        context: edges.slice(0, 20).map((edge) => `${this.repositoryName(edge.repository_id)}: ${edge.source} -[${edge.type}]-> ${edge.target}`).join("\n"),
        citations: edges.slice(0, 5).map((edge) => this.recordCitation(edge.repository_id, "edges.json", edge.id, `${edge.source} -[${edge.type}]-> ${edge.target}`)),
        recordIds: edges.map((edge) => edge.id), relevance: edges.length ? 0.72 : 0
      };
    }
    if (intent === "collaboration") {
      const events = this.collaborationEvents.filter((event) => repositoryIds.includes(event.repository_id));
      const eventTypes = countBy(events, (event) => event.type);
      return {
        answer: events.length ? `The collaboration fixtures contain ${events.length} events: ${formatCounts(eventTypes)}. They are playback examples, not live CRDT telemetry.` : "No collaboration events are present in the selected dataset scope.",
        context: events.slice(0, 20).map((event) => `${this.repositoryName(event.repository_id)} ${event.timestamp}: ${event.user_id} ${event.type}${event.symbol_id ? ` on ${event.symbol_id}` : ""}`).join("\n"),
        citations: events.slice(0, 5).map((event) => this.recordCitation(event.repository_id, "collaboration_events.json", event.id, `${event.timestamp}: ${event.user_id} ${event.type}`)),
        recordIds: events.map((event) => event.id), relevance: events.length ? 0.7 : 0
      };
    }
    if (intent === "overview") {
      const repositories = repositoryIds.map((id) => this.repositoryById.get(id)).filter((repository): repository is DatasetRepository => Boolean(repository)).slice(0, 6);
      return {
        answer: repositories.length ? repositories.map((repository) => `${repository.name} is a synthetic ${repository.language} repository with ${repository.open_issues_count} open issues and ${repository.open_prs_count} open PRs.`).join(" ") : "No repository metadata matched the question.",
        context: repositories.map((repository) => `${repository.name}: ${repository.description}; language=${repository.language}; topics=${repository.topics.join(", ")}; split=${repository.split}`).join("\n"),
        citations: repositories.map((repository) => this.recordCitation(repository.id, "repositories.json", repository.id, `${repository.name}: ${repository.description}`)),
        recordIds: repositories.map((repository) => repository.id), relevance: repositories.length ? 0.65 : 0
      };
    }
    return { answer: "", context: "", citations: [] as Citation[], recordIds: [] as string[], relevance: 0 };
  }

  private codeAnswer(chunks: DatasetChunk[], selectedRepository?: DatasetRepository) {
    if (!chunks.length) return "The synthetic dataset does not contain enough matching evidence for that question.";
    const repositoryLabel = selectedRepository?.name ?? "the matching demo repositories";
    const summaries = chunks.slice(0, 4).map((chunk) => {
      const symbol = this.symbolById.get(chunk.symbol_id);
      return `${symbol?.name ?? chunk.path} in ${this.repositoryName(chunk.repository_id)} (${chunk.path}:${chunk.start_line}-${chunk.end_line})`;
    });
    return `Relevant source evidence from ${repositoryLabel} appears in ${summaries.join("; ")}. The source cards contain the exact fixture code.`;
  }

  private buildContext(question: string, selectedRepository: DatasetRepository | undefined, qa: DatasetQa | undefined, recordContext: string, chunks: DatasetChunk[]) {
    const metadata = selectedRepository
      ? `Selected synthetic repository: ${selectedRepository.name} (${selectedRepository.language}); ${selectedRepository.description}`
      : `Synthetic corpus: ${this.repositories.length} repositories, ${this.chunks.length} source chunks, snapshot ${this.manifest.snapshot_date}.`;
    const qaContext = qa ? `Illustrative QA reference (${qa.answerable ? "answerable" : "unanswerable"}): ${qa.question}\nReference answer: ${qa.reference_answer}` : "";
    const code = chunks.map((chunk) => `Chunk ${chunk.id} | ${this.repositoryName(chunk.repository_id)} | ${chunk.path}:${chunk.start_line}-${chunk.end_line}\n${chunk.text}`).join("\n\n");
    return [`Dataset question: ${question}`, metadata, qaContext, recordContext, code, "Dataset warning: all identities, histories, metrics, and repositories are synthetic fixtures; do not describe them as real GitHub evidence."].filter(Boolean).join("\n\n");
  }

  private chunkCitation(chunk: DatasetChunk): Citation {
    const repository = this.repositoryById.get(chunk.repository_id)!;
    return {
      filePath: `dataset/${repository.name}/${chunk.path}`,
      range: { startLine: chunk.start_line, startColumn: 1, endLine: chunk.end_line, endColumn: 1 },
      symbolName: this.symbolById.get(chunk.symbol_id)?.name,
      sourceRevision: "synthetic-dataset",
      excerpt: chunk.text.slice(0, 500),
      sourceType: "dataset",
      datasetRepositoryId: repository.id,
      datasetRepositoryName: repository.name,
      chunkId: chunk.id
    };
  }

  private recordCitation(repositoryId: string, table: string, recordId: string, excerpt: string): Citation {
    const repository = this.repositoryById.get(repositoryId);
    return {
      filePath: `dataset/${repository?.name ?? "all"}/${table}`,
      range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      sourceRevision: "synthetic-dataset",
      excerpt: excerpt.slice(0, 500),
      sourceType: "dataset",
      datasetRepositoryId: repository?.id,
      datasetRepositoryName: repository?.name,
      chunkId: recordId
    };
  }

  private repositoryName(repositoryId: string) {
    return this.repositoryById.get(repositoryId)?.name ?? repositoryId;
  }
}

export async function loadAssistantDataset(customPath?: string) {
  const directory = customPath ? path.resolve(customPath) : fileURLToPath(new URL("../../data/assistant-dataset/", import.meta.url));
  const read = <T>(name: string) => readJson<T>(path.join(directory, name));
  const [manifest, repositories, chunks, qaExamples, files, symbols, edges, contributors, commits, issues, pullRequests, activity, collaborationEvents] = await Promise.all([
    read<DatasetManifest>("manifest.json"), read<DatasetRepository[]>("repositories.json"), read<DatasetChunk[]>("rag_chunks.json"), read<DatasetQa[]>("qa_examples.json"),
    read<DatasetFile[]>("files.json"), read<DatasetSymbol[]>("symbols.json"), read<DatasetEdge[]>("edges.json"), read<DatasetContributor[]>("contributors.json"),
    read<DatasetCommit[]>("commits.json"), read<DatasetIssue[]>("issues.json"), read<DatasetPullRequest[]>("pull_requests.json"), read<DatasetActivity[]>("activity.json"), read<DatasetCollaborationEvent[]>("collaboration_events.json")
  ]);
  if (!manifest.is_synthetic) throw new Error("CodeMesh assistant dataset must declare its provenance.");
  return new AssistantDataset(manifest, repositories, chunks, qaExamples, files, symbols, edges, contributors, commits, issues, pullRequests, activity, collaborationEvents);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, " ").trim();
}

function tokenize(value: string) {
  return normalize(value).split(/\s+/).filter((term) => term.length > 1 && !stopWords.has(term));
}

function similarity(query: string[], candidate: string[], exact: boolean) {
  if (exact) return 1;
  if (!query.length || !candidate.length) return 0;
  const candidateSet = new Set(candidate);
  const overlap = query.filter((term) => candidateSet.has(term)).length;
  return overlap / Math.max(1, query.length);
}

function lexicalScore(terms: string[], text: string, symbolName?: string, filePath?: string) {
  const normalized = normalize(text);
  return terms.reduce((score, term) => {
    const occurrences = normalized.split(term).length - 1;
    const symbolBoost = symbolName?.toLowerCase().includes(term) ? 4 : 0;
    const pathBoost = filePath?.toLowerCase().includes(term) ? 3 : 0;
    return score + Math.min(4, occurrences) + symbolBoost + pathBoost;
  }, 0);
}

function detectIntent(question: string) {
  if (/\bissues?|bugs?|ticket|backlog\b/i.test(question)) return "issues" as const;
  if (/\bpull requests?|\bprs?\b|review|\bci\b|merge/i.test(question)) return "pull_requests" as const;
  if (/contributor|author|developer|team|who (worked|committed)/i.test(question)) return "contributors" as const;
  if (/activity|churn|timeline|history|commits?|additions|deletions/i.test(question)) return "activity" as const;
  if (/graph|edge|calls?|imports?|dependency|relationship/i.test(question)) return "graph" as const;
  if (/collaborat|presence|session|comment event/i.test(question)) return "collaboration" as const;
  if (/overview|summarize|about|repositories|compare|language|topics?/i.test(question)) return "overview" as const;
  return "code" as const;
}

function rankRecords<T>(records: T[], terms: string[], text: (record: T) => string) {
  return records.map((record) => ({ record, score: lexicalScore(terms, text(record)) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.record);
}

function countBy<T>(values: T[], key: (value: T) => string, amount: (value: T) => number = () => 1) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(key(value), (counts.get(key(value)) ?? 0) + amount(value)));
  return counts;
}

function formatCounts(counts: Map<string, number>) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${label}=${count}`).join(", ");
}

function uniqueCitation(citation: Citation, index: number, citations: Citation[]) {
  return citations.findIndex((candidate) => candidate.filePath === citation.filePath && candidate.chunkId === citation.chunkId) === index;
}
