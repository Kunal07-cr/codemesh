export type EvaluationRow = {
  id: string; category: string; question: string; expectedFacts: string[];
  expectedEvidence: Array<{ path: string; startLine: number; endLine: number; quote: string }>;
  retrieved: Array<{ path: string; startLine: number; endLine: number; content: string; reason: string }>;
  answer: string; recallAtK: number | null; reciprocalRank: number | null; factCoverage: number | null;
  citationPrecision: number | null; shouldAbstain: boolean; abstained: boolean; multifileCoverage: number | null;
  sourceSupported: boolean; latencyMs: number; contextTokensEstimate: number; error?: string;
  failure: "retrieval" | "generation" | "citation" | "abstention" | "provider" | null;
};
export type EvaluationReport = {
  version: string; generatedAt: string; provider: string; scope: string; k: number; rows: EvaluationRow[];
  metrics: { recallAtK: number; mrr: number; expectedFactCoverage: number; sourceSupportedAnswerRate: number; citationPrecision: number; abstentionPrecision: number | null; abstentionRecall: number; multifileCoverage: number; averageLatencyMs: number; contextTokensEstimate: number };
  limitations: string[];
};
