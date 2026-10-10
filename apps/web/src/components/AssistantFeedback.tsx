import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Flag, LoaderCircle, Save, ThumbsDown, ThumbsUp } from "lucide-react";
import { api, jsonBody } from "../lib/api";
import { useAuth } from "../lib/auth";

type Feedback = { rating: "helpful" | "unhelpful" | null; incorrectCitation: boolean; note: string; updatedAt?: string };

export function AssistantFeedback({ projectId, answerId }: { projectId: string; answerId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const queryKey = ["assistant-feedback", user?.id, projectId, answerId];
  const query = useQuery({ queryKey, queryFn: () => api<{ feedback: Feedback | null }>(`/api/projects/${projectId}/ai/feedback/${answerId}`), enabled: open && Boolean(user), retry: false });
  async function exportExamples() {
    setExportError("");
    try {
      const data = await api(`/api/projects/${projectId}/ai/feedback`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "codemesh-assistant-feedback.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : "Export failed"); }
  }
  return <div className="cm-answer-feedback">
    <button className="cm-feedback-trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Flag className="h-3.5 w-3.5" /> Answer feedback</button>
    {open && <div className="cm-feedback-body">
      {query.isLoading && <LoaderCircle aria-label="Loading feedback" className="h-4 w-4 animate-spin" />}
      {query.isError && <p className="text-xs text-coral" role="alert">{query.error.message}</p>}
      {query.data && <FeedbackForm key={query.data.feedback?.updatedAt ?? answerId} initial={query.data.feedback} projectId={projectId} answerId={answerId} queryKey={queryKey} />}
      <button className="cm-feedback-trigger" type="button" onClick={() => void exportExamples()}><Download className="h-3.5 w-3.5" /> Export my feedback</button>
      {exportError && <p className="text-xs text-coral" role="alert">{exportError}</p>}
    </div>}
  </div>;
}

function FeedbackForm({ initial, projectId, answerId, queryKey }: { initial: Feedback | null; projectId: string; answerId: string; queryKey: readonly unknown[] }) {
  const client = useQueryClient();
  const [value, setValue] = useState<Feedback>(initial ?? { rating: null, incorrectCitation: false, note: "" });
  const [dirty, setDirty] = useState(false);
  const save = useMutation({ mutationFn: () => api<{ feedback: Feedback }>(`/api/projects/${projectId}/ai/feedback/${answerId}`, { method: "PUT", body: jsonBody({ rating: value.rating, incorrectCitation: value.incorrectCitation, note: value.note }) }), onSuccess: (data) => { client.setQueryData(queryKey, data); } });
  function update(next: Partial<Feedback>) { setValue((current) => ({ ...current, ...next })); setDirty(true); save.reset(); }
  return <form className="cm-feedback-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <div className="flex flex-wrap items-center gap-2">{(["helpful", "unhelpful"] as const).map((rating) => <button className="cm-icon-button" key={rating} type="button" title={rating === "helpful" ? "Helpful answer" : "Unhelpful answer"} aria-label={rating === "helpful" ? "Helpful answer" : "Unhelpful answer"} aria-pressed={value.rating === rating} disabled={save.isPending} onClick={() => update({ rating: value.rating === rating ? null : rating })}>{rating === "helpful" ? <ThumbsUp className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}</button>)}<label className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={value.incorrectCitation} disabled={save.isPending} onChange={(event) => update({ incorrectCitation: event.target.checked })} /> Incorrect citation</label></div>
    <label className="text-xs text-steel">Feedback note<textarea className="field mt-1 resize-y text-xs" rows={2} maxLength={1000} value={value.note} disabled={save.isPending} onChange={(event) => update({ note: event.target.value })} /></label>
    <div className="flex items-center gap-2"><button className="action-secondary" type="submit" disabled={save.isPending}><Save className="h-3.5 w-3.5" /> {save.isPending ? "Saving" : "Save feedback"}</button><span role="status" className="text-xs text-mint">{dirty ? "Unsaved" : initial?.updatedAt ? "Saved" : ""}</span></div>
    {save.isError && <p className="text-xs text-coral" role="alert">{save.error.message}</p>}
  </form>;
}
