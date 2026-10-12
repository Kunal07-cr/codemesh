import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Columns2, LoaderCircle, Sparkles, X } from "lucide-react";
import type { AiAnswer, PatchProposal } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";
import { WorkspaceDiff } from "./WorkspaceDiff";

export function InlineCopilot({ projectId, path, content, canReview, connected, onApplied }: { projectId: string; path: string; content: string; canReview: boolean; connected: boolean; onApplied(): void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [status, setStatus] = useState<PatchProposal["status"]>("proposed");
  const [error, setError] = useState("");
  const [previewPath, setPreviewPath] = useState("");
  const suggestion = useMutation({
    mutationFn: () => api<AiAnswer>(`/api/projects/${projectId}/ai/ask`, { method: "POST", body: jsonBody({ question: `In ${path}: ${instruction}`, mode: "propose", activeFilePath: path, includeWorkspace: true, knowledgeScope: "repository", retrievalMode: "graph", conversation: [] }) }),
    onMutate: () => { setAnswer(null); setError(""); },
    onSuccess: (result) => { setAnswer(result); setStatus(result.patch?.status ?? "proposed"); },
    onError: (error) => setError(error instanceof Error ? error.message : "Suggestion unavailable.")
  });
  const review = useMutation({
    mutationFn: (action: "apply" | "reject") => api(`/api/projects/${projectId}/patches/${answer!.patch!.id}/${action}`, { method: "POST", body: jsonBody({}) }),
    onSuccess: (_result, action) => {
      setStatus(action === "apply" ? "applied" : "rejected"); setPreviewPath(""); setError("");
      if (action === "apply") { void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] }); void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "contributions"] }); onApplied(); }
    },
    onError: (error) => setError(error instanceof Error ? error.message : "Patch review failed.")
  });
  const patch = answer?.patch;
  const preview = patch?.files.find((file) => file.path === previewPath);
  const changed = patch?.files.some((file) => file.path === path && file.baseContent !== content);
  const busy = suggestion.isPending || review.isPending;
  const actions = patch && <div className="cm-work-actions"><button type="button" disabled={!canReview || busy || !connected || changed || status !== "proposed"} onClick={() => review.mutate("apply")}><Check size={14} />Accept patch</button><button type="button" disabled={!canReview || busy || !connected || status !== "proposed"} onClick={() => review.mutate("reject")}><X size={14} />Reject</button><span role="status">{changed && status === "proposed" ? "File changed: request a fresh suggestion" : status}</span></div>;
  return <section className="cm-inline-copilot" aria-label="Inline Copilot">
    <button type="button" className="cm-copilot-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><Sparkles size={14} />Inline Copilot</button>
    {open && <div className="cm-copilot-content">
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && connected) suggestion.mutate(); }}><input aria-label="Code correction instruction" maxLength={3500} placeholder="Describe a correction for this file" value={instruction} onChange={(event) => setInstruction(event.target.value)} /><button type="submit" disabled={instruction.trim().length < 3 || busy || !connected}>{suggestion.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}Suggest</button></form>
      {error && <p role="alert" className="text-coral">{error}</p>}
      {answer && !patch && <p className="cm-copilot-no-patch">{answer.answer}{answer.uncertainty ? ` ${answer.uncertainty}` : ""}</p>}
      {patch && <><div className="cm-copilot-files"><strong>{patch.title}</strong>{patch.files.map((file) => <button type="button" key={file.path} onClick={() => setPreviewPath(file.path)}><Columns2 size={13} />{file.path}</button>)}</div>{actions}</>}
      {preview && <WorkspaceDiff title="Review Copilot suggestion" path={preview.path} before={preview.baseContent} after={preview.proposedContent} onClose={() => setPreviewPath("")}>{actions}{error && <p role="alert" className="text-coral">{error}</p>}</WorkspaceDiff>}
    </div>}
  </section>;
}
