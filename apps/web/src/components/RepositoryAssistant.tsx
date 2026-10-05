import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Columns2,
  Database,
  FileCode2,
  LoaderCircle,
  MessageSquarePlus,
  SearchCode,
  Send,
  ShieldAlert,
  Sparkles,
  TestTube2,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import type { AiAnswer, AiAskRequest, PatchProposal } from "@codemesh/shared";
import { ApiClientError, api, jsonBody, streamApi } from "../lib/api";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AiAnswer;
  error?: boolean;
};

type RepositoryAssistantProps = {
  projectId: string;
  activeFilePath: string;
  canReview: boolean;
  initialPrompt?: string;
  onOpenFile(path: string): void;
};

type AskVariables = {
  question: string;
  requestMode?: AiAskRequest["mode"];
  streamId: string;
  history: AiAskRequest["conversation"];
};

type AssistantConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type AssistantMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AiAnswer;
};

type ConversationList = {
  provider: string;
  conversations: AssistantConversation[];
};

type ConversationDetail = {
  conversation: AssistantConversation;
  messages: AssistantMessageRecord[];
};

type AssistantDatasetSummary = {
  available: boolean;
  synthetic: true;
  snapshotDate?: string;
  counts: Record<string, number>;
  limitations: string[];
  repositories: Array<{
    id: string;
    name: string;
    description: string;
    language: string;
    topics: string[];
    split: "train" | "validation" | "test";
  }>;
  suggestions: Array<{ question: string; repositoryId?: string }>;
};

const modes: Array<{ value: AiAskRequest["mode"]; label: string; icon: typeof Bot }> = [
  { value: "explain", label: "Explain", icon: Bot },
  { value: "investigate", label: "Investigate", icon: SearchCode },
  { value: "propose", label: "Edit", icon: Sparkles }
];

export function RepositoryAssistant({ projectId, activeFilePath, canReview, initialPrompt, onOpenFile }: RepositoryAssistantProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededPromptRef = useRef("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<AiAskRequest["mode"]>("explain");
  const [retrievalMode, setRetrievalMode] = useState<AiAskRequest["retrievalMode"]>("graph");
  const [knowledgeScope, setKnowledgeScope] = useState<NonNullable<AiAskRequest["knowledgeScope"]>>("combined");
  const [datasetRepositoryId, setDatasetRepositoryId] = useState("");
  const conversationKey = `codemesh-assistant:${projectId}`;
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(conversationKey) ?? "[]") as AssistantMessage[];
    } catch {
      return [];
    }
  });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [patchStates, setPatchStates] = useState<Record<string, PatchProposal["status"]>>({});
  const [patchError, setPatchError] = useState("");

  const conversations = useQuery({
    queryKey: ["assistant-conversations", projectId],
    queryFn: () => api<ConversationList>(`/api/projects/${projectId}/ai/conversations`)
  });
  const dataset = useQuery({
    queryKey: ["assistant-dataset", projectId],
    queryFn: () => api<AssistantDatasetSummary>(`/api/projects/${projectId}/ai/dataset`)
  });

  useEffect(() => {
    if (!initialPrompt || seededPromptRef.current === initialPrompt) return;
    seededPromptRef.current = initialPrompt;
    setMode("propose");
    setKnowledgeScope("repository");
    setPrompt((current) => current || initialPrompt);
  }, [initialPrompt]);

  const ask = useMutation({
    mutationFn: async ({ question, requestMode, streamId, history }: AskVariables) => {
      let result: AiAnswer | null = null;
      let streamError = "";
      const requestedMode = requestMode ?? mode;
      const requestedScope = requestedMode === "propose" ? "repository" : knowledgeScope;
      await streamApi(`/api/projects/${projectId}/ai/stream`, {
        method: "POST",
        body: jsonBody({
          question,
          mode: requestedMode,
          retrievalMode,
          includeWorkspace: true,
          activeFilePath,
          knowledgeScope: requestedScope,
          datasetRepositoryId: requestedScope === "repository" ? undefined : datasetRepositoryId || undefined,
          conversationId: conversationId ?? undefined,
          conversation: conversationId ? [] : history
        } satisfies AiAskRequest & { conversationId?: string })
      }, (event, payload) => {
        const data = payload as { conversationId?: string; text?: string; result?: AiAnswer; message?: string };
        if (event === "meta" && data.conversationId) setConversationId(data.conversationId);
        if (event === "token" && data.text) {
          setMessages((current) => current.map((message) => message.id === streamId ? { ...message, content: message.content + data.text } : message));
          window.setTimeout(scrollToBottom, 0);
        }
        if (event === "result" && data.result) result = data.result;
        if (event === "error") streamError = data.message ?? "The assistant stream ended unexpectedly.";
      });
      if (streamError) throw new Error(streamError);
      if (!result) throw new Error("The assistant finished without returning a result.");
      return { result: result as AiAnswer, streamId };
    },
    onMutate: ({ question, streamId }) => {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: question },
        { id: streamId, role: "assistant", content: "" }
      ]);
      setPrompt("");
      window.setTimeout(scrollToBottom, 0);
    },
    onSuccess: ({ result, streamId }) => {
      setMessages((current) => current.map((message) => message.id === streamId
        ? { id: result.id, role: "assistant", content: result.answer, result }
        : message));
      void queryClient.invalidateQueries({ queryKey: ["assistant-conversations", projectId] });
      window.setTimeout(scrollToBottom, 0);
    },
    onError: (error, variables) => {
      setMessages((current) => current.map((message) => message.id === variables.streamId
        ? { ...message, content: errorMessage(error), error: true }
        : message));
      window.setTimeout(scrollToBottom, 0);
    }
  });

  const removeConversation = useMutation({
    mutationFn: (id: string) => api(`/api/projects/${projectId}/ai/conversations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConversationId(null);
      setMessages([]);
      setPatchError("");
      void queryClient.invalidateQueries({ queryKey: ["assistant-conversations", projectId] });
    },
    onError: (error) => setPatchError(errorMessage(error))
  });

  useEffect(() => {
    localStorage.setItem(conversationKey, JSON.stringify(messages.slice(-30)));
  }, [conversationKey, messages]);

  const applyPatch = useMutation({
    mutationFn: (patch: PatchProposal) =>
      api(`/api/projects/${projectId}/patches/${patch.id}/apply`, { method: "POST", body: jsonBody({}) }),
    onMutate: () => setPatchError(""),
    onSuccess: (_result, patch) => {
      setPatchStates((current) => ({ ...current, [patch.id]: "applied" }));
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "contributions"] });
      const firstFile = patch.files[0];
      if (firstFile) onOpenFile(firstFile.path);
    },
    onError: (error) => setPatchError(errorMessage(error))
  });

  const rejectPatch = useMutation({
    mutationFn: (patch: PatchProposal) =>
      api<PatchProposal>(`/api/projects/${projectId}/patches/${patch.id}/reject`, { method: "POST", body: jsonBody({}) }),
    onMutate: () => setPatchError(""),
    onSuccess: (_result, patch) => setPatchStates((current) => ({ ...current, [patch.id]: "rejected" })),
    onError: (error) => setPatchError(errorMessage(error))
  });

  function scrollToBottom() {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = prompt.trim();
    if (question.length < 3 || ask.isPending) return;
    ask.mutate({
      question,
      streamId: crypto.randomUUID(),
      history: conversationId ? [] : messages
        .filter((message) => message.content.trim().length > 0)
        .slice(-10)
        .map(({ role, content }) => ({ role, content }))
    });
  }

  async function openConversation(id: string) {
    if (!id) {
      setConversationId(null);
      setMessages([]);
      setPatchError("");
      return;
    }
    setLoadingConversation(true);
    setPatchError("");
    try {
      const detail = await api<ConversationDetail>(`/api/projects/${projectId}/ai/conversations/${id}`);
      setConversationId(detail.conversation.id);
      setMessages(detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        result: message.result
      })));
      window.setTimeout(scrollToBottom, 0);
    } catch (error) {
      setPatchError(errorMessage(error));
    } finally {
      setLoadingConversation(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section className="flex min-h-0 flex-[3] flex-col border-b border-line" aria-label="Repository assistant">
      <header className="border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Bot className="h-4 w-4 text-mint" />
            Repository assistant
          </div>
          <button
            className="rounded p-1.5 text-steel hover:bg-ink hover:text-white disabled:opacity-40"
            type="button"
            title="Clear conversation"
            aria-label="Clear conversation"
            disabled={messages.length === 0 || ask.isPending}
            onClick={() => {
              if (conversationId) removeConversation.mutate(conversationId);
              else {
                setMessages([]);
                setPatchError("");
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            className="min-w-0 flex-1 truncate rounded border border-line bg-ink px-2 py-1.5 text-xs text-steel outline-none focus:border-mint"
            aria-label="Assistant conversation"
            value={conversationId ?? ""}
            disabled={ask.isPending || loadingConversation}
            onChange={(event) => void openConversation(event.target.value)}
          >
            <option value="">New conversation</option>
            {conversations.data?.conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
          <button
            className="rounded border border-line p-1.5 text-steel hover:border-mint hover:text-white disabled:opacity-40"
            type="button"
            title="Start new conversation"
            aria-label="Start new conversation"
            disabled={ask.isPending}
            onClick={() => void openConversation("")}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
        <button
          className="mt-2 flex max-w-full items-center gap-2 text-left font-mono text-[11px] text-steel hover:text-mint"
          type="button"
          title={activeFilePath}
          onClick={() => onOpenFile(activeFilePath)}
        >
          <FileCode2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{activeFilePath || "No file selected"}</span>
        </button>
        <div className="mt-3 grid grid-cols-3 rounded border border-line bg-ink p-1">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                className={`flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs ${mode === item.value ? "bg-panel text-white" : "text-steel hover:text-white"}`}
                type="button"
                onClick={() => {
                  setMode(item.value);
                  if (item.value === "propose") setKnowledgeScope("repository");
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            className="min-w-0 rounded border border-line bg-ink px-2 py-1.5 text-[11px] text-steel outline-none focus:border-mint"
            aria-label="Assistant knowledge scope"
            value={knowledgeScope}
            disabled={mode === "propose"}
            onChange={(event) => setKnowledgeScope(event.target.value as NonNullable<AiAskRequest["knowledgeScope"]>)}
          >
            <option value="combined">Project + dataset</option>
            <option value="repository">Project only</option>
            <option value="dataset">Dataset lab</option>
          </select>
          <select
            className="min-w-0 rounded border border-line bg-ink px-2 py-1.5 text-[11px] text-steel outline-none focus:border-mint disabled:opacity-50"
            aria-label="Dataset repository"
            value={datasetRepositoryId}
            disabled={mode === "propose" || knowledgeScope === "repository" || !dataset.data?.available}
            onChange={(event) => setDatasetRepositoryId(event.target.value)}
          >
            <option value="">All demo repositories</option>
            {dataset.data?.repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-steel">
          <span className="truncate">{conversations.data?.provider ?? "repository"} · {scopeLabel(knowledgeScope)} · {retrievalMode}</span>
          <span className="flex shrink-0 items-center gap-1 text-mint"><span className="cm-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" /> ready</span>
        </div>
      </header>

      <div ref={scrollRef} className="cm-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full min-h-36 flex-col items-center justify-center text-center">
            <Sparkles className="h-6 w-6 text-mint" />
            <p className="mt-3 text-sm font-medium text-white">What should we change?</p>
            <button
              className="mt-3 flex items-center gap-2 rounded bg-violet px-3 py-2 text-xs font-semibold text-ink hover:brightness-110 disabled:opacity-50"
              type="button"
              disabled={!activeFilePath || ask.isPending}
              onClick={() => ask.mutate({
                requestMode: "propose",
                streamId: crypto.randomUUID(),
                history: conversationId ? [] : messages
                  .filter((message) => message.content.trim().length > 0)
                  .slice(-10)
                  .map(({ role, content }) => ({ role, content })),
                question: `Analyze ${activeFilePath} for correctness, security, edge cases, and maintainability. Propose the smallest safe code correction, explain why it is needed, and include focused verification steps.`
              })}
            >
              <WandSparkles className="h-4 w-4" /> Analyze &amp; fix active file
            </button>
            <p className="mt-2 max-w-64 text-[10px] leading-4 text-steel">Corrections are returned as a reviewable diff and are never applied automatically.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => setPrompt("Explain the selected file and its dependencies.")}>Explain file</button>
              <button className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("investigate"); setPrompt("Find bugs and security risks in the selected file."); }}>Find risks</button>
              <button className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("propose"); setPrompt("Update the selected file to "); }}>Draft edit</button>
              <button className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("propose"); setPrompt("Generate focused tests for the selected file."); }}><TestTube2 className="h-3 w-3" /> Tests</button>
              <button className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("investigate"); setPrompt("Audit the selected file for security and dependency risks."); }}><ShieldAlert className="h-3 w-3" /> Audit</button>
            </div>
            {dataset.data?.available && (
              <div className="mt-4 max-w-sm border-t border-line pt-3">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase text-violet">
                  <Database className="h-3.5 w-3.5" /> Synthetic dataset · {dataset.data.counts.repositories ?? dataset.data.repositories.length} repositories
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {dataset.data.suggestions.slice(0, 2).map((suggestion) => (
                    <button
                      key={`${suggestion.repositoryId ?? "all"}:${suggestion.question}`}
                      className="rounded border border-violet/30 px-2 py-1 text-[11px] text-steel hover:border-violet hover:text-white"
                      type="button"
                      onClick={() => {
                        setKnowledgeScope("dataset");
                        setDatasetRepositoryId(suggestion.repositoryId ?? "");
                        setPrompt(suggestion.question);
                      }}
                    >
                      {suggestion.question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {messages.map((message, messageIndex) => (
          <article key={message.id} className={message.role === "user" ? "ml-7 rounded border border-mint/25 bg-mint/10 p-3" : "mr-2"}>
            <div className={`text-[10px] font-semibold uppercase text-steel ${message.role === "user" ? "text-right" : ""}`}>
              {message.role === "user" ? "You" : "CodeMesh"}
            </div>
            <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${message.error ? "text-coral" : "text-slate-100"}`}>{message.content}</p>
            {message.result && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase text-steel">
                <span>{message.result.citations.some((citation) => citation.sourceType === "dataset") ? "Dataset-grounded" : message.result.retrieval.model.startsWith("gemini:") ? "Gemini reasoning" : "Repository reasoning"}</span>
                <span>{message.result.citations.length} source{message.result.citations.length === 1 ? "" : "s"}</span>
                {message.result.citations.some((citation) => citation.sourceType === "dataset") && <span className="text-violet">synthetic dataset</span>}
                <span>{message.result.retrieval.generationLatencyMs} ms</span>
              </div>
            )}
            {message.result?.uncertainty && <p className="mt-2 text-xs leading-5 text-amber">{message.result.uncertainty}</p>}
            {message.result && message.result.citations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {message.result.citations.map((citation) => citation.sourceType === "dataset" ? (
                  <span
                    key={`${citation.chunkId ?? citation.filePath}:${citation.range.startLine}`}
                    className="flex max-w-full items-center gap-1 rounded border border-violet/30 bg-violet/5 px-2 py-1 font-mono text-[10px] text-steel"
                    title={`${citation.excerpt}\nSynthetic dataset fixture`}
                  >
                    <Database className="h-3 w-3 shrink-0 text-violet" />
                    <span className="truncate">{citation.datasetRepositoryName ?? "dataset"} · {citation.chunkId ?? citation.filePath}</span>
                  </span>
                ) : (
                  <button
                    key={`${citation.filePath}:${citation.range.startLine}`}
                    className="flex max-w-full items-center gap-1 rounded border border-line px-2 py-1 font-mono text-[10px] text-steel hover:border-mint hover:text-white"
                    type="button"
                    title={`${citation.filePath}:${citation.range.startLine}-${citation.range.endLine}`}
                    onClick={() => onOpenFile(citation.filePath)}
                  >
                    <span className="truncate">{citation.filePath}:{citation.range.startLine}</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {message.result?.patch && (
              <PatchReview
                patch={message.result.patch}
                status={patchStates[message.result.patch.id] ?? message.result.patch.status}
                canReview={canReview}
                pending={applyPatch.isPending || rejectPatch.isPending}
                onApply={() => applyPatch.mutate(message.result!.patch!)}
                onReject={() => rejectPatch.mutate(message.result!.patch!)}
                onOpenFile={onOpenFile}
              />
            )}
            {message.role === "assistant" && !message.error && messageIndex === messages.length - 1 && !ask.isPending && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button className="rounded border border-line px-2 py-1 text-[11px] text-steel hover:border-mint hover:text-white" type="button" onClick={() => setPrompt("Explain that in more detail and walk through the relevant code.")}>Go deeper</button>
                <button className="rounded border border-line px-2 py-1 text-[11px] text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("investigate"); setPrompt("Trace the dependencies and callers related to that answer."); }}>Trace dependencies</button>
                <button className="rounded border border-line px-2 py-1 text-[11px] text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setMode("investigate"); setPrompt("What risks, edge cases, and missing tests should I review for that implementation?"); }}>Review risks</button>
              </div>
            )}
          </article>
        ))}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm text-steel">
            <LoaderCircle className="h-4 w-4 animate-spin text-mint" />
            Reading repository context...
          </div>
        )}
        {patchError && (
          <div className="flex gap-2 rounded border border-coral/40 bg-coral/10 p-2 text-xs leading-5 text-coral" role="alert">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {patchError}
          </div>
        )}
      </div>

      <form className="border-t border-line p-3" onSubmit={submit}>
        <textarea
          className="h-20 w-full resize-none rounded border border-line bg-ink px-3 py-2 text-sm text-white outline-none placeholder:text-steel focus:border-mint"
          value={prompt}
          maxLength={4000}
          placeholder={mode === "propose" ? "Describe the edit for the selected file..." : "Ask about this repository..."}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <select
            className="min-w-0 rounded border border-line bg-ink px-2 py-1.5 text-xs text-steel outline-none focus:border-mint"
            aria-label="Retrieval mode"
            value={retrievalMode}
            onChange={(event) => setRetrievalMode(event.target.value as AiAskRequest["retrievalMode"])}
          >
            <option value="vector">Vector</option>
            <option value="hybrid">Hybrid</option>
            <option value="graph">Graph + hybrid</option>
          </select>
          <button
            className="flex h-8 w-8 items-center justify-center rounded bg-mint text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            title="Send"
            aria-label="Send"
            disabled={prompt.trim().length < 3 || ask.isPending}
          >
            {ask.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}

function PatchReview({
  patch,
  status,
  canReview,
  pending,
  onApply,
  onReject,
  onOpenFile
}: {
  patch: PatchProposal;
  status: PatchProposal["status"];
  canReview: boolean;
  pending: boolean;
  onApply(): void;
  onReject(): void;
  onOpenFile(path: string): void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <div className="mt-3 border-l-2 border-mint bg-mint/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{patch.title}</div>
          <p className="mt-1 text-xs leading-5 text-steel">{patch.summary}</p>
        </div>
        <span className={`text-[10px] font-semibold uppercase ${status === "applied" ? "text-mint" : status === "rejected" || status === "stale" ? "text-coral" : "text-amber"}`}>{status}</span>
      </div>
      <div className="mt-3 space-y-2">
        {patch.files.map((file) => {
          const stats = changeStats(file.baseContent, file.proposedContent);
          return (
            <details key={file.path} className="rounded border border-line bg-ink">
              <summary className="cursor-pointer list-none px-2 py-2 text-xs text-white">
                <span className="flex items-center justify-between gap-2">
                  <button className="min-w-0 truncate font-mono hover:text-mint" type="button" onClick={(event) => { event.preventDefault(); onOpenFile(file.path); }}>{file.path}</button>
                  <span className="shrink-0 font-mono"><span className="text-mint">+{stats.added}</span> <span className="text-coral">-{stats.removed}</span></span>
                </span>
              </summary>
              <pre className="cm-scrollbar max-h-44 overflow-auto border-t border-line p-2 font-mono text-[10px] leading-4 text-steel">{file.proposedContent}</pre>
            </details>
          );
        })}
      </div>
      <button className="mt-3 flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => setShowDiff((current) => !current)}>
        <Columns2 className="h-3.5 w-3.5" /> {showDiff ? "Hide diff" : "View side-by-side diff"}
      </button>
      {showDiff && (
        <div className="mt-3 space-y-2">
          {patch.files.map((file) => (
            <div key={`${file.path}-diff`} className="grid gap-2 md:grid-cols-2">
              <div className="min-w-0 rounded border border-line bg-ink">
                <div className="border-b border-line px-2 py-1.5 font-mono text-[10px] text-steel">Before · {file.path}</div>
                <pre className="cm-scrollbar max-h-52 overflow-auto p-2 font-mono text-[10px] leading-4 text-coral">{file.baseContent}</pre>
              </div>
              <div className="min-w-0 rounded border border-mint/30 bg-mint/5">
                <div className="border-b border-mint/20 px-2 py-1.5 font-mono text-[10px] text-mint">After · {file.path}</div>
                <pre className="cm-scrollbar max-h-52 overflow-auto p-2 font-mono text-[10px] leading-4 text-mint">{file.proposedContent}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
      {patch.suggestedVerification.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] leading-4 text-steel">
          {patch.suggestedVerification.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      )}
      {status === "proposed" && (
        <div className="mt-3 flex gap-2">
          <button className="flex items-center gap-1 rounded bg-mint px-2.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-50" type="button" disabled={!canReview || pending} onClick={onApply}>
            <Check className="h-3.5 w-3.5" /> Apply
          </button>
          <button className="flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-xs text-steel hover:text-white disabled:opacity-50" type="button" disabled={!canReview || pending} onClick={onReject}>
            <X className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      )}
      {!canReview && status === "proposed" && <p className="mt-2 text-[11px] text-amber">Your project role cannot apply repository patches.</p>}
    </div>
  );
}

function changeStats(before: string, after: string) {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) suffix += 1;
  return {
    removed: Math.max(0, beforeLines.length - prefix - suffix),
    added: Math.max(0, afterLines.length - prefix - suffix)
  };
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return "The repository assistant could not complete that request.";
}

function scopeLabel(scope: NonNullable<AiAskRequest["knowledgeScope"]>) {
  if (scope === "dataset") return "dataset lab";
  if (scope === "combined") return "project + dataset";
  return "project";
}
