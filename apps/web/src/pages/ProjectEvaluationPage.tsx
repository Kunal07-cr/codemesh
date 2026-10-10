import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical, LoaderCircle, Play, ShieldCheck } from "lucide-react";
import type { EvaluationReport } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";
import { LoadingState } from "../components/LoadingState";

type Run = { id: string; status: string; progress: number; createdAt: string; error?: string; metadata?: { completed?: number; total?: number }; output?: { report: EvaluationReport } };
type Payload = { provider: string; scope: string; index: { revision: string; indexedAt: string; indexedFiles: number; storedFiles: number; chunks: number; warnings: string[]; parsers: string[] }; settings: { strategy: string; maxChunks: number; maxContextEstimatedTokens: number; learnedEmbeddings: boolean }; baseline: Pick<EvaluationReport, "metrics" | "provider" | "version" | "generatedAt" | "limitations"> | null; runs: Run[] };
const labels: Array<[keyof EvaluationReport["metrics"], string, boolean]> = [["recallAtK", "Evidence Recall@8", true], ["mrr", "Mean reciprocal rank", false], ["expectedFactCoverage", "Expected fact coverage", true], ["sourceSupportedAnswerRate", "Source-supported checks", true], ["citationPrecision", "Citation precision", true], ["abstentionPrecision", "Abstention precision", true], ["abstentionRecall", "Abstention recall", true], ["multifileCoverage", "Multi-file evidence", true], ["averageLatencyMs", "Average latency (ms)", false], ["contextTokensEstimate", "Estimated context tokens", false]];
const format = (value: number | null | undefined, percent: boolean) => value == null ? "Not measured" : percent ? `${(value * 100).toFixed(1)}%` : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function ProjectEvaluationPage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const [runId, setRunId] = useState("");
  const [failure, setFailure] = useState("all");
  const key = ["assistant-evaluation", projectId];
  const query = useQuery({ queryKey: key, queryFn: () => api<Payload>(`/api/projects/${projectId}/ai/evaluation`), refetchInterval: (query) => query.state.data?.runs.some((run) => ["queued", "running"].includes(run.status)) ? 1000 : false });
  const run = useMutation({ mutationFn: () => api<Run>(`/api/projects/${projectId}/ai/evaluation`, { method: "POST", body: jsonBody({}) }), onSuccess: (result) => { setRunId(result.id); void client.invalidateQueries({ queryKey: key }); } });
  if (query.isLoading) return <LoadingState label="Opening source evaluation" />;
  if (!query.data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral" role="alert">{query.error?.message ?? "Evaluation is unavailable."}</div>;
  const data = query.data;
  const current = data.runs.find((item) => item.id === runId) ?? data.runs[0];
  const report = current?.output?.report;
  const previous = data.runs.find((item) => item.id !== current?.id && item.output?.report)?.output?.report;
  const pending = run.isPending || data.runs.some((item) => ["queued", "running"].includes(item.status));
  const rows = report?.rows.filter((row) => failure === "all" || (failure === "passed" ? !row.failure : row.failure === failure)) ?? [];
  return <section className="cm-evaluation mx-auto max-w-7xl px-4 py-8">
    <Link className="inline-flex items-center gap-2 text-sm text-steel" to={`/projects/${projectId}`}><ArrowLeft size={14} />Project</Link>
    <header><div><div className="eyebrow"><FlaskConical size={14} />Source accuracy lab</div><h1>AI Evaluation</h1><p>{data.scope}</p></div><button type="button" className="cm-prism-button" disabled={pending} onClick={() => run.mutate()}>{pending ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}Run local evaluation</button></header>
    {(run.error || current?.error) && <p role="alert" className="text-coral">{run.error?.message ?? current?.error}</p>}
    {current && ["queued", "running"].includes(current.status) && <div className="cm-evaluation-progress" role="status"><span>{current.status} · {current.metadata?.completed ?? 0} / {current.metadata?.total ?? 20} questions completed</span><progress max="100" value={current.progress} /></div>}
    <dl className="cm-index-facts"><div><dt>Indexed / stored files</dt><dd>{data.index.indexedFiles} / {data.index.storedFiles}</dd></div><div><dt>Source chunks</dt><dd>{data.index.chunks}</dd></div><div><dt>Last indexed</dt><dd>{new Date(data.index.indexedAt).toLocaleString()}</dd></div><div><dt>Configured assistant</dt><dd>{data.provider}</dd></div></dl>
    <div className="cm-evaluation-settings"><ShieldCheck size={15} /><span>{data.settings.strategy} · {data.settings.maxChunks} chunks · {data.settings.maxContextEstimatedTokens.toLocaleString()} estimated-token budget</span></div>
    <details className="cm-index-warnings"><summary>{data.index.warnings.length} index warnings · revision {data.index.revision}</summary><p>{data.index.parsers.join("; ")}</p>{data.index.warnings.map((warning, position) => <p key={position}>{warning}</p>)}</details>
    <div className="cm-evaluation-select"><h2>Benchmark runs</h2><label>Run<select aria-label="Benchmark run" value={current?.id ?? ""} onChange={(event) => setRunId(event.target.value)}><option value="" disabled>No runs yet</option>{data.runs.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.status}</option>)}</select></label></div>
    <div className="cm-evaluation-table"><table><thead><tr><th>Metric</th><th>Original local baseline</th><th>Selected run</th><th>Previous completed run</th></tr></thead><tbody>{labels.map(([metric, label, percent]) => <tr key={metric}><th scope="row">{label}</th><td>{format(data.baseline?.metrics[metric], percent)}</td><td>{format(report?.metrics[metric], percent)}</td><td>{format(previous?.metrics[metric], percent)}</td></tr>)}</tbody></table></div>
    <p className="cm-evaluation-caveat">Source-anchored assertions and range checks are not semantic proof of arbitrary model answers. Local evaluation does not measure live-model accuracy. Token counts are estimates.</p>
    {report && <><div className="cm-evaluation-select"><h2>Question inspection</h2><label>Result<select aria-label="Evaluation result filter" value={failure} onChange={(event) => setFailure(event.target.value)}>{["all", "passed", "retrieval", "generation", "citation", "abstention", "provider"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label></div><div className="cm-evaluation-questions">{rows.map((row) => <details key={row.id}><summary><span className={`cm-result-dot ${row.failure ? "is-failed" : ""}`} /><span>{row.question}<small>{row.category}</small></span><strong>{row.failure ?? "Checks passed"}</strong></summary><div className="cm-question-inspection"><h3>Expected source facts</h3><ul>{row.expectedFacts.length ? row.expectedFacts.map((fact) => <li key={fact}><code>{fact}</code></li>) : <li>No repository answer expected; abstention or clarification required.</li>}</ul>{row.expectedEvidence.map((entry, position) => <p key={position}><code>{entry.path}:{entry.startLine}-{entry.endLine}</code> · {entry.quote}</p>)}<h3>Actual answer</h3><pre>{row.answer || row.error}</pre><h3>Retrieved context</h3>{row.retrieved.map((entry, position) => <details key={position}><summary>{entry.path}:{entry.startLine}-{entry.endLine}</summary><p>{entry.reason}</p><pre><code>{entry.content}</code></pre></details>)}</div></details>)}</div><div className="cm-evaluation-caveat">{report.limitations.map((item) => <p key={item}>{item}</p>)}</div></>}
  </section>;
}
