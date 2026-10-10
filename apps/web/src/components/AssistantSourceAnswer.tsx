import { useState } from "react";
import { Check, Copy, FileCode2 } from "lucide-react";
import type { AiAnswer } from "@codemesh/shared";

export function AssistantSourceAnswer({ result }: { result: AiAnswer }) {
  const [copied, setCopied] = useState<number | null>(null);
  return <div className="cm-verified-answer">
    <div className="cm-verified-answer-title">Source evidence</div>
    {result.sourceFacts?.map((fact, position) => <details key={`${fact.filePath}:${fact.range.startLine}`} open={position === 0}>
      <summary><FileCode2 size={14} /><span>{fact.filePath}</span><small>{fact.range.startLine}-{fact.range.endLine}</small></summary>
      <div className="cm-evidence-code"><button type="button" className="cm-icon-button" title={copied === position ? "Copied source" : "Copy source"} aria-label={`Copy source from ${fact.filePath}`} onClick={() => void navigator.clipboard.writeText(fact.code).then(() => setCopied(position)).catch(() => setCopied(null))}>{copied === position ? <Check size={14} /> : <Copy size={14} />}</button><pre><code>{fact.code}</code></pre></div>
    </details>)}
    {result.inference && <div className="cm-answer-inference"><strong>Inference, not mechanically verified</strong><p>{result.inference}</p></div>}
    {result.syntheticComparison && <div className="cm-answer-inference"><strong>Synthetic dataset comparison, not project evidence</strong><p>{result.syntheticComparison}</p></div>}
  </div>;
}
