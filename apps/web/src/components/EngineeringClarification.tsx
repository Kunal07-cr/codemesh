import { useState } from "react";
import { MessageSquarePlus, Send } from "lucide-react";
import type { PublicEngineeringRun } from "@codemesh/shared";

export function EngineeringClarification({ run, busy, onSubmit }: {
  run: PublicEngineeringRun;
  busy: boolean;
  onSubmit: (instruction: string, expectedAttempt: number) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const available = run.status === "needs_input" && run.attempts < run.maxAttempts && !run.corpusId;
  if (!available && !run.clarifications?.length) return null;

  return <section className="studio-clarification" aria-label="Task clarification">
    {!!run.clarifications?.length && <details className="studio-clarification-history">
      <summary>Clarification history ({run.clarifications.length})</summary>
      <ol>{run.clarifications.map((item, index) => <li key={index}>
        <div><strong>Attempt {item.attempt}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
        <p>{item.instruction}</p>
      </li>)}</ol>
    </details>}
    {available && <form onSubmit={(event) => { event.preventDefault(); const text = instruction.trim(); if (text.length >= 8) onSubmit(text, run.attempts); }}>
      <h3><MessageSquarePlus size={17} /> Additional instructions</h3>
      <label>Clarification<textarea className="field" value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} minLength={8} maxLength={2000} required disabled={busy} /></label>
      <div className="studio-clarification-actions"><span>Next attempt: {run.attempts + 1} / {run.maxAttempts}</span><button className="action-primary" disabled={busy || instruction.trim().length < 8}><Send size={16} />{busy ? "Submitting" : "Clarify and continue"}</button></div>
    </form>}
  </section>;
}
