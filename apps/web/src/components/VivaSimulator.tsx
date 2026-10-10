import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Download, FileCode2, GraduationCap, RotateCcw } from "lucide-react";
import type { GraphNode } from "@codemesh/shared";
import type { ChallengeContract } from "../lib/repositoryChallenges";
import { buildVivaPrompts, exportVivaNotes, parseVivaResponses, type VivaPrompt, type VivaResponse } from "../lib/vivaPractice";
import { useAuth } from "../lib/auth";

type Props = { project: { id: string; name: string; commitSha: string }; nodes: GraphNode[]; contracts: ChallengeContract[] };

export function VivaSimulator(props: Props) {
  const { user } = useAuth();
  const prompts = useMemo(() => buildVivaPrompts(props.nodes, props.contracts), [props.nodes, props.contracts]);
  const key = `codemesh-viva:v1:${encodeURIComponent(user?.id ?? "guest")}:${encodeURIComponent(props.project.id)}:${encodeURIComponent(props.project.commitSha)}`;
  return <section className="cm-viva-room">
    <header className="cm-challenge-header"><div><div className="eyebrow"><GraduationCap className="h-4 w-4" /> Viva rehearsal</div><h2>Viva Simulator</h2><p>{props.project.name} <span className="font-mono">{props.project.commitSha.slice(0, 16)}</span></p></div></header>
    {prompts.length ? <VivaSession key={key} storageKey={key} project={props.project} prompts={prompts} /> : <div className="cm-challenge-empty"><BookOpen className="h-7 w-7 text-cyan" /><h3>No indexed declarations yet</h3><Link className="action-secondary" to={`/projects/${props.project.id}/settings`}>Repository settings</Link></div>}
  </section>;
}

function VivaSession({ storageKey, project, prompts }: { storageKey: string; project: Props["project"]; prompts: VivaPrompt[] }) {
  const [position, setPosition] = useState(0);
  const [responses, setResponses] = useState<Record<string, VivaResponse>>(() => { try { return parseVivaResponses(localStorage.getItem(storageKey), prompts); } catch { return {}; } });
  const [storageError, setStorageError] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const prompt = prompts[position]!;
  const response = responses[prompt.id] ?? { answer: "", reviewed: false, checked: [] };
  const reviewed = prompts.filter((item) => responses[item.id]?.reviewed).length;
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(responses)); setStorageError(""); } catch { setStorageError("Draft could not be saved on this device"); } }, [responses, storageKey]);
  function update(next: Partial<VivaResponse>) { setResponses((current) => ({ ...current, [prompt.id]: { ...response, ...next } })); }
  function navigate(next: number) { setPosition(next); setResetConfirm(false); requestAnimationFrame(() => heading.current?.focus()); }
  function download() {
    const url = URL.createObjectURL(new Blob([exportVivaNotes(project.name, project.commitSha, prompts, responses)], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "codemesh-viva-rehearsal.md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="cm-challenge-progress"><div><span>Source-backed rehearsal</span><strong>{reviewed} / {prompts.length} reviewed</strong></div><progress aria-label="Viva progress" value={reviewed} max={prompts.length} /></div>
    <div className="cm-viva-layout">
      <div className="cm-viva-answer"><div className="eyebrow text-cyan">Question {position + 1} / {prompts.length}</div><h3 ref={heading} tabIndex={-1}>{prompt.question}</h3>
        <label className="text-sm text-steel" htmlFor="viva-answer">Your explanation</label><textarea id="viva-answer" className="field" rows={9} maxLength={6000} value={response.answer} onChange={(event) => update({ answer: event.target.value, reviewed: false, checked: [] })} />
        <div className="cm-viva-answer-footer"><span className="text-xs text-steel">{response.answer.length} / 6000</span><button className="action-primary" type="button" disabled={response.answer.trim().length < 20} onClick={() => update({ reviewed: true })}><BookOpen className="h-4 w-4" /> Compare with source</button></div>
        <p role="status" className="text-xs text-coral">{storageError}</p>
      </div>
      <aside className="cm-viva-reference" aria-label="Viva source reference">
        {response.reviewed ? <><div className="eyebrow text-mint">Reference and self-assessment</div><p>{prompt.reference}</p>{prompt.source.excerpt && <pre>{prompt.source.excerpt}</pre>}
          <Link className="action-secondary" to={`/projects/${project.id}/workspace?${new URLSearchParams({ path: prompt.source.filePath, line: String(prompt.source.line) })}`}><FileCode2 className="h-4 w-4" /><span>{prompt.source.filePath}:{prompt.source.line}</span></Link>
          <fieldset><legend>Checkpoints you covered</legend>{prompt.checkpoints.map((checkpoint, index) => <label key={checkpoint}><input type="checkbox" checked={response.checked.includes(index)} onChange={(event) => update({ checked: event.target.checked ? [...response.checked, index] : response.checked.filter((item) => item !== index) })} />{checkpoint}</label>)}</fieldset>
          <div className="cm-viva-follow-up"><strong>Follow-up question</strong><p>{prompt.followUp}</p></div><span className="text-xs text-steel">Self-assessment only. No automated grade.</span>
        </> : <><BookOpen className="h-7 w-7 text-cyan" /><h3>Reference sealed</h3><span className="text-xs text-steel">Awaiting your explanation</span></>}
      </aside>
    </div>
    <footer className="cm-viva-controls"><div className="flex gap-2"><button className="cm-icon-button" type="button" title="Previous viva question" aria-label="Previous viva question" disabled={position === 0} onClick={() => navigate(position - 1)}><ArrowLeft className="h-4 w-4" /></button><button className="cm-icon-button" type="button" title="Next viva question" aria-label="Next viva question" disabled={position === prompts.length - 1} onClick={() => navigate(position + 1)}><ArrowRight className="h-4 w-4" /></button></div><div className="flex flex-wrap items-center gap-2"><button className="action-secondary" type="button" onClick={download}><Download className="h-4 w-4" /> Export rehearsal</button><button className="cm-icon-button" type="button" title="Reset rehearsal" aria-label="Reset rehearsal" onClick={() => setResetConfirm((current) => !current)}><RotateCcw className="h-4 w-4" /></button>{resetConfirm && <><button className="action-secondary text-coral" type="button" onClick={() => { setResponses({}); setPosition(0); setResetConfirm(false); }}>Confirm reset</button><button className="action-secondary" type="button" onClick={() => setResetConfirm(false)}>Cancel</button></>}</div></footer>
  </>;
}
