import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MessageSquare, Play, Send } from "lucide-react";
import type { ConversationCaseResult, ConversationRun } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";
import { LoadingState } from "./LoadingState";

type LabData = { provider: { configured: boolean; name: string }; runs: ConversationRun[]; promptVersion: string; scope: string; prompts: Array<{ mode: string; template: string }> };
type Report = { rows: ConversationCaseResult[]; scope: string; metrics: { cases: number; passed: number; passRate: number; averageLatencyMs: number }; limitations: string[] };
export function ConversationAgentLab({ projectId }: { projectId: string }) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/engineering/conversations`, client = useQueryClient();
  const query = useQuery({ queryKey: ["conversations", projectId], queryFn: () => api<LabData>(base) });
  const [selected, setSelected] = useState(""), [transcript, setTranscript] = useState(""), [report, setReport] = useState<Report | null>(null), [model, setModel] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = query.data?.runs.find((item) => item.id === selected) ?? query.data?.runs[0];
  async function submit(path: string, body: unknown) {
    setBusy(true); setError("");
    try { const result = await api<unknown>(`${base}${path}`, { method: "POST", body: jsonBody(body) }); await client.invalidateQueries({ queryKey: ["conversations", projectId] }); return result; }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Conversation request failed"); }
    finally { setBusy(false); }
  }
  if (query.isLoading) return <LoadingState label="Opening Conversational Agent Lab" />;
  if (!query.data) return <p className="studio-error" role="alert">{query.error?.message ?? "Conversation lab unavailable"}</p>;
  const data = query.data;
  return <div className="conversation-lab">
    <div className="systems-readout"><span className="studio-badge">Synthetic transcript prototype</span><span>{data.promptVersion}</span><span>{data.provider.name}</span></div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <form className="systems-form" onSubmit={async (event) => {
      event.preventDefault(); const fields = new FormData(event.currentTarget);
      const result = await submit("", { promptMode: fields.get("prompt"), language: fields.get("language"), providerMode: model ? "configured-model" : "scripted", modelConsent: fields.get("consent") === "on", simulateToolFailure: fields.get("failure") === "on" }) as ConversationRun | undefined;
      if (result) { setSelected(result.id); setTranscript(""); }
    }}>
      <label>Prompt strategy<select className="field" name="prompt" defaultValue="few-shot">{data.prompts.map((item) => <option key={item.mode}>{item.mode}</option>)}</select></label>
      <label>Conversation language<select className="field" name="language"><option value="en">English</option><option value="hinglish">Hindi English code mixed</option></select></label>
      <label className="studio-check"><input type="checkbox" checked={model} disabled={!data.provider.configured} onChange={(event) => setModel(event.target.checked)} /> Use configured LLM intent routing</label>
      <label className="studio-check"><input type="checkbox" name="failure" /> Simulate calendar failure</label>
      {model && <label className="studio-check"><input type="checkbox" name="consent" required /> Send synthetic transcripts to the configured model</label>}
      <button className="action-primary" disabled={busy}><MessageSquare size={16} /> New test session</button>
    </form>
    {!!data.runs.length && <label className="conversation-selector">Retained test session<select className="field" value={run?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>{data.runs.map((item) => <option key={item.id} value={item.id}>{item.settings.promptMode} / {item.settings.language} / {item.state} / {new Date(item.createdAt).toLocaleString()}</option>)}</select></label>}
    {run && <><div className="systems-readout"><span>{run.state}</span><span>{run.turns.length}/20 turns</span><code>{run.promptHash.slice(0, 16)}</code><span>{run.settings.providerMode}</span></div>
      <ol className="conversation-transcript" aria-label="Test conversation">{run.turns.map((turn, index) => <li key={index}><div className="conversation-user"><small>Test user</small><p>{turn.input}</p></div><div className="conversation-agent"><small>Agent / {turn.provider}</small><p>{turn.reply}</p><div className="conversation-events"><code>{turn.before} / {turn.after}</code><span>{turn.latencyMs} ms</span>{turn.tool && <span>{turn.tool} / {turn.toolStatus}</span>}{turn.flags.map((flag) => <span key={flag}>{flag}</span>)}</div></div></li>)}</ol>
      {!run.turns.length && <p className="studio-empty">No transcript turns</p>}
      <form className="conversation-composer" onSubmit={async (event) => { event.preventDefault(); const result = await submit(`/${run.id}/turns`, { transcript, expectedTurns: run.turns.length }); if (result) setTranscript(""); }}><label>Test transcript<textarea className="field" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={2} maxLength={1800} required disabled={busy || ["completed", "handed-off"].includes(run.state)} /></label><button className="action-primary" aria-label="Send test transcript" title="Send test transcript" disabled={busy || !transcript.trim() || ["completed", "handed-off"].includes(run.state)}><Send size={17} /></button></form>
      <form className="systems-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); void submit(`/${run.id}/feedback`, { rating: fields.get("rating"), category: fields.get("category"), note: fields.get("note") }); }}><label>Feedback<select className="field" name="rating"><option value="useful">Useful</option><option value="needs-work">Needs work</option></select></label><label>Failure category<select className="field" name="category">{["clarification", "language", "tool-routing", "persona", "other"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Notes<input className="field" name="note" maxLength={500} /></label><button className="action-secondary" disabled={busy}>Save feedback</button></form>{run.feedback && <p className="systems-scope">Saved feedback: {run.feedback.rating} / {run.feedback.category}</p>}
    </>}
    <section className="systems-band"><div className="systems-actions"><button className="action-secondary" disabled={busy} onClick={async () => { const result = await submit("/evaluate", {}); if (result) setReport(result as Report); }}><Play size={16} /> Run transcript regressions</button>{report && <button className="cm-tool-button" title="Export transcript evaluation" aria-label="Export transcript evaluation" onClick={() => download(report)}><Download size={16} /></button>}</div>
      {report && <><div className="systems-readout"><span>{report.metrics.passed}/{report.metrics.cases} authored checks passed</span><span>{report.metrics.averageLatencyMs.toFixed(2)} ms mean scripted case time</span></div><p className="systems-scope">{report.scope}</p><div className="studio-table-wrap"><table><thead><tr><th>Prompt</th><th>Condition</th><th>Language</th><th>Result</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}><td>{row.promptMode}</td><td>{row.condition}</td><td>{row.language}</td><td><span className="studio-badge" data-state={row.passed ? "pass" : "fail"}>{row.passed ? "PASS" : "FAIL"}</span></td></tr>)}</tbody></table></div>{report.limitations.map((item) => <p key={item} className="systems-scope">{item}</p>)}</>}
    </section>
    <details><summary>Versioned prompt templates</summary>{data.prompts.map((item) => <div key={item.mode}><h3>{item.mode}</h3><pre>{item.template}</pre></div>)}</details>
  </div>;
}
function download(report: Report) { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "codaventra-conversation-evaluation.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
