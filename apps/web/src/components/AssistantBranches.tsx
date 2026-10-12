import { lazy, Suspense, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Columns2, GitBranch, LoaderCircle, X } from "lucide-react";
import type { AiAnswer } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";
const WorkspaceDiff = lazy(() => import("./WorkspaceDiff").then((module) => ({ default: module.WorkspaceDiff })));

export type BranchConversation = { id: string; title: string; parentId?: string; forkAnswerId?: string; createdAt: string; updatedAt: string };
export type BranchDetail = { conversation: BranchConversation; messages: Array<{ id: string; role: "user" | "assistant"; content: string; result?: AiAnswer }> };

export function AssistantBranches({ projectId, conversationId, conversations, answerId, busy, onOpen }: { projectId: string; conversationId: string | null; conversations: BranchConversation[]; answerId?: string; busy: boolean; onOpen(detail: BranchDetail): void }) {
  const queryClient = useQueryClient();
  const [forking, setForking] = useState(false);
  const [title, setTitle] = useState("Alternative approach");
  const [compareId, setCompareId] = useState("");
  const [pair, setPair] = useState<[BranchDetail, BranchDetail] | null>(null);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const fork = useMutation({
    mutationFn: () => api<BranchDetail>(`/api/projects/${projectId}/ai/conversations/${conversationId}/fork`, { method: "POST", body: jsonBody({ answerId, title }) }),
    onSuccess: (detail) => { setForking(false); setPair(null); setError(""); onOpen(detail); void queryClient.invalidateQueries({ queryKey: ["assistant-conversations", projectId] }); },
    onError: (error) => setError(error instanceof Error ? error.message : "Branch could not be created.")
  });
  const compare = useMutation({
    mutationFn: async () => {
      const left = await api<BranchDetail>(`/api/projects/${projectId}/ai/conversations/${conversationId}`);
      const right = await api<BranchDetail>(`/api/projects/${projectId}/ai/conversations/${compareId}`);
      return [left, right] as [BranchDetail, BranchDetail];
    },
    onSuccess: (details) => { setPair(details); setPath(""); setError(""); },
    onError: (error) => setError(error instanceof Error ? error.message : "Comparison unavailable.")
  });
  const current = conversations.find((item) => item.id === conversationId);
  const patches = pair?.map((detail) => [...detail.messages].reverse().find((message) => message.result?.patch)?.result?.patch);
  const filePaths = [...new Set(patches?.flatMap((patch) => patch?.files.map((file) => file.path) ?? []) ?? [])];
  const first = patches?.[0]?.files.find((file) => file.path === path);
  const second = patches?.[1]?.files.find((file) => file.path === path);
  return <div className="cm-assistant-branches">
    {current?.parentId && <span className="cm-branch-origin"><GitBranch size={12} />Branched from {conversations.find((item) => item.id === current.parentId)?.title ?? "earlier conversation"}</span>}
    <div className="cm-work-actions"><button type="button" title="Fork at the latest answer" disabled={!conversationId || !answerId || busy || fork.isPending} onClick={() => setForking(!forking)}><GitBranch size={13} />Branch</button><select aria-label="Compare with conversation" value={compareId} disabled={busy} onChange={(event) => { setCompareId(event.target.value); setPair(null); }}><option value="">Compare with...</option>{conversations.filter((item) => item.id !== conversationId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" title="Compare conversations" aria-label="Compare conversations" disabled={!conversationId || !compareId || busy || compare.isPending} onClick={() => compare.mutate()}>{compare.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Columns2 size={13} />}</button></div>
    {forking && <form className="cm-work-actions" onSubmit={(event) => { event.preventDefault(); fork.mutate(); }}><input aria-label="Branch title" maxLength={64} value={title} onChange={(event) => setTitle(event.target.value)} /><button type="submit" disabled={title.trim().length < 2 || fork.isPending}>Create branch</button></form>}
    {error && <p role="alert" className="text-coral">{error}</p>}
    {pair && <section className="cm-branch-comparison" aria-label="Conversation comparison"><div className="cm-work-actions"><strong>Conversation comparison</strong><button type="button" title="Close comparison" aria-label="Close comparison" onClick={() => setPair(null)}><X size={13} /></button></div>{pair.map((detail, index) => { const message = [...detail.messages].reverse().find((item) => item.role === "assistant"); return <div key={detail.conversation.id}><h4>{index === 0 ? "Current" : "Alternative"}: {detail.conversation.title}</h4><p>{message?.content ?? "No answer yet"}</p><span>{message?.result?.grounding?.status ?? "No grounding record"} - {message?.result?.citations.length ?? 0} citations</span></div>; })}<div className="cm-work-actions">{filePaths.map((filePath) => <button key={filePath} type="button" onClick={() => setPath(filePath)}><Columns2 size={12} />{filePath}</button>)}</div>{filePaths.length === 0 && <p>No patch suggestions in either conversation.</p>}
      {path && <Suspense fallback={<p role="status">Opening comparison...</p>}><WorkspaceDiff title="Compare branch suggestions" path={path} before={first?.proposedContent ?? second?.baseContent ?? ""} after={second?.proposedContent ?? first?.baseContent ?? ""} onClose={() => setPath("")}><span>Current branch on the left, alternative on the right. {first && second && first.baseContent !== second.baseContent ? "Different base versions: compare carefully." : "No changes are applied."}</span></WorkspaceDiff></Suspense>}
    </section>}
  </div>;
}
