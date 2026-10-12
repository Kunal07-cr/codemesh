import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Check, Code2, Columns3, Download, FileSearch, GitPullRequest, History, ListTodo, Maximize2, MessageSquare, MessageSquareText, Minimize2, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Radio, RotateCcw, Search, Trash2, SlidersHorizontal, Save, X } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import type {
  CodeAnnotation,
  GraphEdge,
  GraphNode,
  Permission,
  Project,
  ProjectRole,
  RepoFile,
  RepositoryGraph,
  WorkspaceDoc
} from "@codemesh/shared";
import { RepositoryAssistant } from "../components/RepositoryAssistant";
import { RepositoryGraphCanvas } from "../components/RepositoryGraphCanvas";
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { API_URL, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relativeTime } from "../lib/format";
import { parseWorkspaceLayout, workspaceLayoutKey, workspacePresets, type WorkspaceLayout } from "../lib/workspaceLayout";
import { classifyDraft, draftKey, readDraft, writeDraft, type DraftScope, type LocalDraft } from "../lib/workspaceDrafts";
import { annotationsForNode, nodeAtLine, parsePinnedPaths } from "../lib/workspaceNavigation";
import { useComposerDraft } from "../lib/useComposerDraft";
import { WorkspaceFileTree, WorkspaceTabs } from "../components/WorkspaceNavigation";
import { WorkspaceDiff } from "../components/WorkspaceDiff";
import { InlineCopilot } from "../components/InlineCopilot";
import { TaskWorkspace } from "../components/TaskWorkspace";
import "../workspace-tools.css";
import "../lib/monaco";

type WorkspacePayload = {
  project: Project;
  role: ProjectRole;
  permissions: Permission[];
  files: RepoFile[];
  graph: RepositoryGraph;
  workspaceId: string;
  docs: WorkspaceDoc[];
  chat: ChatMessage[];
  annotations: CodeAnnotation[];
};

type ChatMessage = {
  id: string;
  projectId: string;
  workspaceId: string;
  body: string;
  authorId: string;
  createdAt: string;
};

export function WorkspacePage() {
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  return <WorkspaceSession key={`${user?.id ?? "guest"}:${projectId}`} />;
}

function WorkspaceSession() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const requestedPath = searchParams.get("path") ?? "";
  const requestedLine = Number(searchParams.get("line") ?? 1);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  const [selectedPath, setSelectedPath] = useState(requestedPath || "src/auth/session.ts");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [view, setView] = useState<"editor" | "graph" | "split">(() => compact ? "editor" : "split");
  const [content, setContent] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [connection, setConnection] = useState("offline");
  const [presence, setPresence] = useState<string[]>([]);
  const [filePanelOpen, setFilePanelOpen] = useState(!compact);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(!compact);
  const [panelSizes, setPanelSizes] = useState(workspacePresets.explore);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState("");
  const [taskOpen, setTaskOpen] = useState(Boolean(searchParams.get("task")));
  const [taskPrompt, setTaskPrompt] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState("Opening file");
  const [docReady, setDocReady] = useState(false);
  const [reloadDoc, setReloadDoc] = useState(0);
  const [recovery, setRecovery] = useState<LocalDraft | null>(null);
  const [compareDraft, setCompareDraft] = useState(false);
  const [compared, setCompared] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [draftsEnabled, setDraftsEnabled] = useState(true);
  const serverBaseRef = useRef("");
  const pendingDrafts = useRef(new Map<string, LocalDraft>());
  const contentRef = useRef("");
  const writeSequence = useRef(0);
  const sourceOrigin = useRef<"cursor" | "navigation">("navigation");
  const cursorListener = useRef<{ dispose(): void } | null>(null);
  const graphRef = useRef<RepositoryGraph | undefined>(undefined);
  const socketRef = useRef<Socket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const selectedPathRef = useRef(selectedPath);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationIds = useRef<string[]>([]);
  const applyingRemote = useRef(false);

  selectedPathRef.current = selectedPath;

  const workspace = useQuery({
    queryKey: ["workspace", projectId, user?.id],
    queryFn: () => api<WorkspacePayload>(`/api/projects/${projectId}/workspace`),
    enabled: Boolean(user)
  });
  const data = workspace.data;
  graphRef.current = data?.graph;
  contentRef.current = content;
  const draftScope: DraftScope = { userId: user?.id ?? "guest", projectId, workspaceId: data?.workspaceId ?? "main", kind: "code", path: selectedPath };
  const selectedDoc = data?.docs.find((doc) => doc.path === selectedPath);
  const canEdit = data?.permissions.includes("workspace.edit") ?? false;
  const focusMode = !filePanelOpen && !assistantPanelOpen;
  const visibleFiles = useMemo(() => {
    const needle = fileFilter.trim().toLowerCase();
    return data?.files.filter((file) => !needle || file.path.toLowerCase().includes(needle)) ?? [];
  }, [data?.files, fileFilter]);

  useEffect(() => {
    if (!data) return;
    if (!data.files.some((file) => file.path === selectedPath)) setSelectedPath(data.files[0]?.path ?? "");
    try { setPinned(parsePinnedPaths(localStorage.getItem(`codemesh-pins:${user?.id}:${projectId}`), data.files.map((file) => file.path))); } catch { setPinned([]); }
  }, [data?.project.commitSha, data?.files, projectId, user?.id]);

  function togglePin(path: string) {
    const next = pinned.includes(path) ? pinned.filter((item) => item !== path) : [...pinned, path].slice(-12);
    setPinned(next);
    try { localStorage.setItem(`codemesh-pins:${user?.id}:${projectId}`, JSON.stringify(next)); } catch { setLayoutStatus("Pinned tabs could not be saved on this device"); }
  }

  function applyLayout(layout: WorkspaceLayout, isCompact: boolean) {
    setPanelSizes(layout);
    setView(isCompact ? "editor" : layout.view);
    setFilePanelOpen(!isCompact && layout.filesOpen);
    setAssistantPanelOpen(!isCompact && layout.assistantOpen);
  }

  useEffect(() => {
    if (!user) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(workspaceLayoutKey(user.id, projectId)); } catch { /* Storage may be blocked. */ }
    applyLayout(parseWorkspaceLayout(raw), window.matchMedia("(max-width: 1023px)").matches);
    setLayoutStatus("");
    setLayoutMenuOpen(false);
  }, [user?.id, projectId]);

  function saveLayout() {
    if (!user) return;
    try {
      localStorage.setItem(workspaceLayoutKey(user.id, projectId), JSON.stringify({ ...panelSizes, view, filesOpen: filePanelOpen, assistantOpen: assistantPanelOpen }));
      setLayoutStatus("Layout saved");
    } catch { setLayoutStatus("Layout could not be saved on this device"); }
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = () => {
      setCompact(media.matches);
      setLayoutMenuOpen(false);
      if (media.matches) { setFilePanelOpen(false); setAssistantPanelOpen(false); setView("editor"); }
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    if (!data || !requestedPath) return;
    const matchingNode = nodeAtLine(data.graph.nodes, requestedPath, requestedLine);
    setSelectedNode(matchingNode ?? null);
    setSelectedPath(requestedPath);
  }, [data, requestedLine, requestedPath]);

  function selectSource(path: string, line?: number) {
    if (!data?.files.some((file) => file.path === path)) return;
    sourceOrigin.current = "navigation";
    setSelectedPath(path);
    const next = new URLSearchParams(searchParams);
    next.set("path", path);
    if (line) next.set("line", String(line));
    else next.delete("line");
    setSearchParams(next, { replace: true });
  }

  function openGraphSource(path: string, line?: number) {
    selectSource(path, line);
    setView(compact ? "editor" : "split");
  }

  useEffect(() => {
    if (!data || !user) return;
    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.timeout(8000).emit("workspace:join", { projectId, workspaceId: data.workspaceId }, (error: Error | null, response: { ok: boolean; error?: string }) => {
        if (error || !response?.ok) { setConnection("offline"); setSaveStatus(response?.error ?? "Workspace connection timed out"); return; }
        setConnection("connected"); setReloadDoc((value) => value + 1);
      });
    });
    socket.on("disconnect", () => { setConnection("reconnecting"); setDocReady(false); setSaveStatus("Reconnecting - local drafts only"); });
    socket.on("connect_error", (error) => { setConnection("offline"); setDocReady(false); setSaveStatus(error.message); });
    socket.on("presence:joined", (payload: { user: { name: string } }) => {
      setPresence((current) => [...new Set([...current, payload.user.name])]);
    });
    socket.on("presence:update", (payload: { user: { name: string } }) => {
      setPresence((current) => [...new Set([...current, payload.user.name])]);
    });
    socket.on("workspace:chat:message", () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    });
    socket.on("annotation:created", () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    });
    socket.on("annotation:deleted", () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    });
    socket.on("doc:update", (payload: { path: string; update: number[] }) => {
      if (payload.path !== selectedPathRef.current || !docRef.current) return;
      applyingRemote.current = true;
      Y.applyUpdate(docRef.current, Uint8Array.from(payload.update));
      const remote = docRef.current.getText("content").toString();
      serverBaseRef.current = remote;
      setContent(remote);
      applyingRemote.current = false;
    });
    socket.on("doc:restored", (payload: { path: string; update: number[] }) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-history", projectId, payload.path] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
      if (payload.path !== selectedPathRef.current || !docRef.current) return;
      applyingRemote.current = true;
      Y.applyUpdate(docRef.current, Uint8Array.from(payload.update));
      const remote = docRef.current.getText("content").toString();
      serverBaseRef.current = remote;
      setContent(remote);
      applyingRemote.current = false;
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [data?.workspaceId, projectId, queryClient, user?.id]);

  useEffect(() => {
    if (!data || !selectedPath) return;
    let current = true;
    const scope: DraftScope = { userId: user?.id ?? "guest", projectId, workspaceId: data.workspaceId, kind: "code", path: selectedPath };
    const draft = pendingDrafts.current.get(selectedPath) ?? (draftsEnabled ? readDraft(localStorage, scope) : null);
    writeSequence.current++;
    setCompared(false); setCompareDraft(false); setDocReady(false);
    if (connection !== "connected" || !socketRef.current?.connected) {
      const remote = selectedDoc?.content ?? data.files.find((file) => file.path === selectedPath)?.content ?? "";
      serverBaseRef.current = draft?.baseContent ?? remote;
      setContent(draft?.content ?? remote);
      setRecovery(draft);
      setSaveStatus(draft ? "Local draft - waiting for connection" : "Offline");
      return;
    }
    const doc = new Y.Doc();
    docRef.current = doc;
    setSaveStatus("Opening file");
    socketRef.current.timeout(8000).emit(
      "doc:open",
      { projectId, workspaceId: data.workspaceId, path: selectedPath },
      (error: Error | null, response: { ok: boolean; update?: number[]; error?: string }) => {
        if (!current) return;
        if (!error && response?.ok && response.update) {
          Y.applyUpdate(doc, Uint8Array.from(response.update));
          const remote = doc.getText("content").toString();
          serverBaseRef.current = remote;
          setContent(remote); setDocReady(true);
          const state = draft ? classifyDraft(draft, remote, data.project.commitSha) : "synced";
          if (state === "synced") { setRecovery(null); pendingDrafts.current.delete(selectedPath); try { localStorage.removeItem(draftKey(scope)); } catch { /* Storage blocked. */ } setSaveStatus("Saved"); }
          else { setRecovery(draft); setSaveStatus(state === "conflict" ? "Draft conflict - review required" : "Local draft available"); }
        } else {
          setContent(selectedDoc?.content ?? "");
          setSaveStatus(response?.error ?? "File opening timed out");
        }
      }
    );
    socketRef.current.emit("presence:update", { projectId, workspaceId: data.workspaceId, path: selectedPath });
    return () => {
      current = false;
      doc.destroy();
      if (docRef.current === doc) docRef.current = null;
    };
  }, [data?.workspaceId, data?.project.commitSha, projectId, selectedDoc?.content, selectedPath, connection, reloadDoc, user?.id, draftsEnabled]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const range = selectedNode?.filePath === selectedPath ? selectedNode.range : undefined;
    if (!editor || !monaco) return;
    decorationIds.current = editor.deltaDecorations(
      decorationIds.current,
      range
        ? [{
            range: new monaco.Range(range.startLine, range.startColumn, range.endLine, Math.max(range.startColumn, range.endColumn)),
            options: { isWholeLine: true, className: "cm-editor-highlight", glyphMarginClassName: "cm-editor-highlight-glyph" }
          }]
        : []
    );
    if (range && sourceOrigin.current !== "cursor") editor.revealLinesInCenter(range.startLine, range.endLine);
  }, [selectedNode, selectedPath, view]);

  const mountEditor: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    cursorListener.current?.dispose();
    cursorListener.current = editor.onDidChangeCursorPosition((event) => {
      if (event.reason !== monaco.editor.CursorChangeReason.Explicit) return;
      const node = nodeAtLine(graphRef.current?.nodes ?? [], selectedPathRef.current, event.position.lineNumber);
      sourceOrigin.current = "cursor";
      setSelectedNode(node ?? null);
    });
  };

  useEffect(() => () => cursorListener.current?.dispose(), []);

  function updateEditor(value = "") {
    setContent(value);
    contentRef.current = value;
    if (!canEdit || applyingRemote.current || !data) return;
    const draft: LocalDraft = { content: value, baseContent: serverBaseRef.current, revision: data.project.commitSha, savedAt: Date.now() };
    pendingDrafts.current.set(selectedPath, draft);
    const saved = draftsEnabled && writeDraft(localStorage, draftScope, draft);
    if (!docRef.current || !socketRef.current?.connected || connection !== "connected" || !docReady || recovery) {
      setRecovery(draft); setSaveStatus(saved ? "Local draft saved" : "Unsynced - device storage unavailable or disabled"); return;
    }
    const sequence = ++writeSequence.current;
    const path = selectedPath;
    const scope = { ...draftScope };
    const text = docRef.current.getText("content");
    docRef.current.transact(() => {
      text.delete(0, text.length);
      text.insert(0, value);
    }, "local-editor");
    const update = Array.from(Y.encodeStateAsUpdate(docRef.current));
    setSaveStatus(saved ? "Saving..." : "Saving... local backup unavailable");
    socketRef.current.timeout(8000).emit("doc:update", { projectId, workspaceId: data.workspaceId, path, update }, (error: Error | null, response: { ok: boolean; error?: string }) => {
      if (sequence !== writeSequence.current || path !== selectedPathRef.current) return;
      if (error || !response?.ok) { setSaveStatus(response?.error ?? "Save not confirmed - draft retained"); setReloadDoc((current) => current + 1); return; }
      serverBaseRef.current = docRef.current?.getText("content").toString() ?? value;
      setSaveStatus("Saved");
      if (contentRef.current === value) { pendingDrafts.current.delete(path); try { localStorage.removeItem(draftKey(scope)); } catch { /* Storage blocked. */ } }
    });
  }

  function restoreDraft() {
    if (!recovery || !socketRef.current?.connected || !data || !canEdit || !compared) return;
    const draft = recovery, path = selectedPath, scope = { ...draftScope };
    setRecovering(true);
    socketRef.current.timeout(8000).emit("doc:replace", { projectId, workspaceId: data.workspaceId, path, expectedContent: serverBaseRef.current, content: draft.content }, (error: Error | null, response: { ok: boolean; error?: string }) => {
      setRecovering(false);
      if (path !== selectedPathRef.current) return;
      if (error || !response?.ok) { setSaveStatus(response?.error ?? "Restore not confirmed - draft retained"); setReloadDoc((current) => current + 1); return; }
      try { localStorage.removeItem(draftKey(scope)); } catch { /* Storage blocked. */ }
      pendingDrafts.current.delete(path);
      setRecovery(null); setCompareDraft(false); setContent(draft.content); serverBaseRef.current = draft.content; setSaveStatus("Draft restored and saved");
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    });
  }

  if (!user) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-steel">Sign in to join a workspace.</div>;
  }
  if (workspace.isError) return <div className="mx-auto max-w-3xl p-8 text-coral" role="alert">{workspace.error.message}<button type="button" className="ml-3 text-mint" onClick={() => void workspace.refetch()}>Retry workspace</button></div>;
  if (workspace.isLoading || !data) {
    return <LoadingState label="Loading collaborative workspace" />;
  }

  const recoveryActions = recovery && <div className="cm-draft-recovery" role="status"><span>{classifyDraft(recovery, serverBaseRef.current, data.project.commitSha) === "conflict" ? "Local draft differs from server" : "Unsent local draft"}</span><button type="button" disabled={!docReady || recovering} onClick={() => { setCompareDraft(true); setCompared(true); }}>Compare</button><button type="button" disabled={!canEdit || !docReady || !compared || recovering} onClick={restoreDraft}>Restore draft</button><button type="button" disabled={recovering} onClick={() => {
    try { localStorage.removeItem(draftKey(draftScope)); } catch { setSaveStatus("Device draft could not be removed"); return; }
    pendingDrafts.current.delete(selectedPath);
    setRecovery(null); setCompareDraft(false); setContent(serverBaseRef.current); setSaveStatus(connection === "connected" ? "Saved" : "Offline");
  }}>Discard draft</button></div>;
  const editorProps = { path: selectedPath, files: data.files, content, canEdit: canEdit && (connection !== "connected" || (docReady && !recovery)), onMount: mountEditor, onChange: updateEditor, onSelectPath: selectSource, pinned, onPin: togglePin, onFilter: (prefix: string) => { setFileFilter(prefix); setFilePanelOpen(true); }, modelKey: `${user.id}/${projectId}/${selectedPath}`, saveStatus, recoveryActions, projectId, canReview: data.permissions.includes("workspace.review"), connected: connection === "connected" && docReady && !recovery, onApplied: () => setReloadDoc((value) => value + 1) };

  return (
    <section className="cm-code-workspace h-[calc(100vh-3.5rem)] overflow-hidden bg-ink" data-compact={compact} onKeyDown={(event) => { if (event.key === "Escape") { setLayoutMenuOpen(false); if (compact) { setFilePanelOpen(false); setAssistantPanelOpen(false); } } }}>
      {taskOpen && <TaskWorkspace projectId={projectId} userId={user.id} taskId={searchParams.get("task") ?? ""} paths={data.files.map((file) => file.path)} revision={data.project.commitSha} canManage={data.permissions.includes("task.manage")} onClose={() => setTaskOpen(false)} onOpenFile={(path) => { selectSource(path); setView("editor"); setTaskOpen(false); }} onAsk={(prompt) => { setTaskPrompt(prompt); setAssistantPanelOpen(true); if (compact) setFilePanelOpen(false); setTaskOpen(false); }} />}
      {compareDraft && recovery && <WorkspaceDiff title="Compare local draft with server" path={selectedPath} before={serverBaseRef.current} after={recovery.content} onClose={() => setCompareDraft(false)}>{recoveryActions}</WorkspaceDiff>}
      <header className="flex h-12 items-center justify-between border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill tone={connection === "connected" ? "good" : "warn"}>
            <Radio className="mr-1 h-3 w-3" />
            {connection}
          </StatusPill>
          <div className="truncate font-semibold text-white">{data.project.name}</div>
          <span className="hidden sm:inline-flex"><StatusPill>{data.role}</StatusPill></span>
          <span className="hidden text-xs text-steel md:inline">workspace/{data.workspaceId}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-steel">
          {!compact && <div className="cm-layout-anchor">
            <button className="cm-icon-button" type="button" title="Workspace layout" aria-label="Workspace layout" aria-expanded={layoutMenuOpen} aria-controls="workspace-layout-menu" onClick={() => setLayoutMenuOpen((open) => !open)}><SlidersHorizontal className="h-4 w-4" /></button>
            {layoutMenuOpen && <div id="workspace-layout-menu" className="cm-layout-menu">
              <div className="flex items-center justify-between"><strong className="text-white">Workspace layout</strong><button className="cm-icon-button" type="button" title="Close layout settings" aria-label="Close layout settings" onClick={() => setLayoutMenuOpen(false)}><X className="h-4 w-4" /></button></div>
              <div className="cm-layout-presets">{Object.entries(workspacePresets).map(([name, layout]) => <button className="action-secondary" key={name} type="button" onClick={() => { applyLayout({ ...layout }, false); setLayoutStatus(""); }}>{name === "coding" ? <Code2 className="h-4 w-4" /> : name === "explore" ? <Network className="h-4 w-4" /> : <GitPullRequest className="h-4 w-4" />}{name}</button>)}</div>
              {([{ key: "fileWidth", label: "File tree width", min: 180, max: 320, unit: "px" }, { key: "assistantWidth", label: "Copilot width", min: 280, max: 440, unit: "px" }, { key: "graphPercent", label: "Graph share", min: 25, max: 75, unit: "%" }] as const).map((control) => <label className="cm-layout-range" key={control.key}><span>{control.label}<output>{panelSizes[control.key]}{control.unit}</output></span><input type="range" aria-label={control.label} min={control.min} max={control.max} value={panelSizes[control.key]} onChange={(event) => { setPanelSizes((current) => ({ ...current, [control.key]: Number(event.target.value) })); setLayoutStatus(""); }} /></label>)}
              <div className="flex items-center gap-2"><button className="action-primary" type="button" onClick={saveLayout}><Save className="h-4 w-4" /> Save layout</button><button className="cm-icon-button" type="button" title="Restore default layout" aria-label="Restore default layout" onClick={() => { applyLayout({ ...workspacePresets.explore }, false); setLayoutStatus(""); }}><RotateCcw className="h-4 w-4" /></button></div>
              <label className="mt-3 flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={draftsEnabled} disabled={Boolean(recovery) || saveStatus.startsWith("Saving")} onChange={(event) => setDraftsEnabled(event.target.checked)} />Keep code drafts on this device (7 days)</label>
              <p className="text-xs text-mint" role="status">{layoutStatus}</p>
            </div>}
          </div>}
          {presence.slice(0, 3).map((name) => (
            <span key={name} className="hidden rounded border border-line px-2 py-1 sm:inline-flex">
              {name}
            </span>
          ))}
          <button className="cm-icon-button" type="button" title={filePanelOpen ? "Hide file tree" : "Show file tree"} aria-label={filePanelOpen ? "Hide file tree" : "Show file tree"} aria-pressed={filePanelOpen} onClick={() => { setFilePanelOpen((open) => !open); if (compact) setAssistantPanelOpen(false); }}>
            {filePanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <button className={compact ? "hidden" : "cm-icon-button"} type="button" title={focusMode ? "Exit focus mode" : "Focus graph and code"} aria-label={focusMode ? "Exit focus mode" : "Focus graph and code"} aria-pressed={focusMode} onClick={() => {
            if (focusMode) {
              setFilePanelOpen(true);
              setAssistantPanelOpen(true);
            } else {
              setFilePanelOpen(false);
              setAssistantPanelOpen(false);
            }
          }}>
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button className="cm-icon-button" type="button" title={assistantPanelOpen ? "Hide copilot" : "Show copilot"} aria-label={assistantPanelOpen ? "Hide copilot" : "Show copilot"} aria-pressed={assistantPanelOpen} onClick={() => { setAssistantPanelOpen((open) => !open); if (compact) setFilePanelOpen(false); }}>
            {assistantPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          <span className="hidden sm:inline-flex"><StatusPill tone={canEdit ? "good" : "warn"}>{canEdit ? "edit allowed" : "read only"}</StatusPill></span>
        </div>
      </header>
      <div
        className="cm-workspace-grid grid h-[calc(100%-3rem)]"
        style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : `${filePanelOpen ? `min(${panelSizes.fileWidth}px, 21vw)` : "0px"} minmax(0, 1fr) ${assistantPanelOpen ? `min(${panelSizes.assistantWidth}px, 30vw)` : "0px"}` }}
      >
        {compact && (filePanelOpen || assistantPanelOpen) && <button className="cm-workspace-scrim" type="button" aria-label="Close workspace panels" onClick={() => { setFilePanelOpen(false); setAssistantPanelOpen(false); }} />}
        <aside className={`cm-workspace-rail cm-file-rail flex min-h-0 flex-col overflow-hidden border-r border-line bg-panel ${filePanelOpen ? "opacity-100" : "pointer-events-none border-transparent opacity-0"}`} aria-hidden={!filePanelOpen} inert={!filePanelOpen}>
          <div className="border-b border-line p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-steel">
              <span className="flex items-center gap-2"><FileSearch className="h-3.5 w-3.5 text-mint" /> Files</span>
              <span className="font-mono text-[10px]">{data.files.length}</span>
            </div>
            <label className="relative mt-3 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel" />
              <input className="field py-2 pl-8 text-xs" aria-label="Search files" placeholder="Filter files" value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} />
            </label>
          </div>
          <div className="cm-scrollbar min-h-0 flex-1 overflow-auto p-2">
            <WorkspaceFileTree paths={visibleFiles.map((file) => file.path)} selectedPath={selectedPath} filtered={Boolean(fileFilter.trim())} onSelect={(path) => { selectSource(path); if (compact) setFilePanelOpen(false); setView("editor"); }} />
            {visibleFiles.length === 0 && <div className="p-3 text-xs leading-5 text-steel">No files match this filter.</div>}
          </div>
        </aside>
        <main className="cm-workspace-main min-w-0 bg-ink" inert={compact && (filePanelOpen || assistantPanelOpen)}>
          <div className="flex h-11 items-center justify-between border-b border-line px-3">
            <div className="flex items-center gap-2">
              <button
                className={`rounded px-3 py-1.5 text-sm ${view === "editor" ? "bg-panel text-white" : "text-steel hover:text-white"}`}
                onClick={() => setView("editor")}
              >
                <Code2 className="mr-1 inline h-4 w-4" />
                Editor
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm ${view === "graph" ? "bg-panel text-white" : "text-steel hover:text-white"}`}
                onClick={() => setView("graph")}
              >
                <Network className="mr-1 inline h-4 w-4" />
                Graph
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm ${view === "split" ? "bg-panel text-white" : "text-steel hover:text-white"}`}
                onClick={() => setView("split")}
              >
                <Columns3 className="mr-1 inline h-4 w-4" />
                Split
              </button>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="cm-icon-button" title="Issue-to-change workspace" aria-label="Issue-to-change workspace" onClick={() => setTaskOpen(true)}><ListTodo size={16} /></button>
              <HistoryMenu projectId={projectId} workspaceId={data.workspaceId} path={selectedPath} socket={socketRef.current} canRestore={data.permissions.includes("workspace.review")} />
              <button className="cm-workspace-export hidden items-center gap-1.5 rounded border border-line px-2 py-1.5 text-xs text-steel hover:border-mint hover:text-white sm:flex" type="button" title="Export architecture graph" onClick={() => exportGraph(data.project.name, data.graph)}>
                <Download className="h-3.5 w-3.5" /> Export graph
              </button>
              <div className="cm-workspace-activepath hidden min-w-0 items-center gap-2 sm:flex"><span className="text-xs text-steel">Editing</span><div className="truncate font-mono text-xs text-steel">{selectedPath}</div></div>
            </div>
          </div>
          <div className="h-[calc(100%-2.75rem)]">
            {view === "editor" && (
              <EditorPane {...editorProps} />
            )}
            {view === "graph" && (
              <GraphView graph={data.graph} annotations={data.annotations} selectedPath={selectedPath} selectedNodeId={selectedNode?.id} onOpenSource={openGraphSource} onSelectNode={(node) => {
                setSelectedNode(node);
                if (node.filePath) selectSource(node.filePath, node.range?.startLine);
              }} />
            )}
            {view === "split" && (
              <div className={`grid h-full ${compact ? "grid-cols-1 grid-rows-2" : ""}`} style={compact ? undefined : { gridTemplateColumns: `minmax(0, ${panelSizes.graphPercent}fr) minmax(0, ${100 - panelSizes.graphPercent}fr)` }}>
                <div className="min-w-0 border-r border-line">
                  <GraphView graph={data.graph} annotations={data.annotations} selectedPath={selectedPath} selectedNodeId={selectedNode?.id} onOpenSource={openGraphSource} onSelectNode={(node) => {
                    setSelectedNode(node);
                    if (node.filePath) selectSource(node.filePath, node.range?.startLine);
                  }} />
                </div>
                <div className="min-w-0">
                  <EditorPane {...editorProps} />
                </div>
              </div>
            )}
          </div>
        </main>
        <aside className={`cm-workspace-rail cm-copilot-rail flex min-h-0 flex-col overflow-hidden border-l border-line bg-panel ${assistantPanelOpen ? "opacity-100" : "pointer-events-none border-transparent opacity-0"}`} aria-hidden={!assistantPanelOpen} inert={!assistantPanelOpen}>
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              graph={data.graph}
              annotations={data.annotations}
              currentUserId={user.id}
              projectId={projectId}
              workspaceId={data.workspaceId}
              socket={socketRef.current}
              sourceContent={docReady ? content : selectedDoc?.content ?? data.files.find((file) => file.path === selectedPath)?.content ?? ""}
              canManage={data.role === "owner" || data.role === "maintainer"}
            />
          )}
          <RepositoryAssistant
            projectId={projectId}
            activeFilePath={selectedPath}
            activeEntity={selectedNode ?? undefined}
            canReview={data.permissions.includes("workspace.review")}
            initialPrompt={taskPrompt}
            onOpenFile={(path, line) => {
              selectSource(path, line);
              if (compact) setAssistantPanelOpen(false);
              if (selectedNode?.filePath !== path) setSelectedNode(null);
              setView("editor");
            }}
            onRevealEntity={(path, line) => {
              selectSource(path, line);
              setView("graph");
              if (compact) setAssistantPanelOpen(false);
            }}
          />
          <ChatPanel projectId={projectId} userId={user.id} workspaceId={data.workspaceId} messages={data.chat} socket={socketRef.current} canPost={data.permissions.includes("discussion.post")} connected={connection === "connected"} />
        </aside>
      </div>
    </section>
  );
}

function EditorPane({ path, files, content, canEdit, onMount, onChange, onSelectPath, pinned, onPin, onFilter, modelKey, saveStatus, recoveryActions, projectId, canReview, connected, onApplied }: { path: string; files: RepoFile[]; content: string; canEdit: boolean; onMount: OnMount; onChange(value: string): void; onSelectPath(path: string): void; pinned: string[]; onPin(path: string): void; onFilter(prefix: string): void; modelKey: string; saveStatus: string; recoveryActions: React.ReactNode; projectId: string; canReview: boolean; connected: boolean; onApplied(): void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {recoveryActions}
      <WorkspaceTabs path={path} paths={files.map((file) => file.path)} pinned={pinned} onSelect={onSelectPath} onPin={onPin} onFilter={onFilter} />
      <InlineCopilot key={modelKey} projectId={projectId} path={path} content={content} canReview={canReview} connected={connected} onApplied={onApplied} />
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={modelKey}
          language={languageForPath(path)}
          theme="vs-dark"
          value={content}
          onMount={onMount}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", readOnly: !canEdit, glyphMargin: true, smoothScrolling: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, automaticLayout: true }}
          onChange={(value) => onChange(value ?? "")}
        />
      </div>
      <div className="cm-editor-save-status" role="status"><span className={saveStatus === "Saved" ? "text-mint" : "text-amber"}>{saveStatus}</span><span>{content.split("\n").length} lines</span></div>
    </div>
  );
}

function GraphView({
  graph,
  annotations,
  selectedPath,
  selectedNodeId,
  onOpenSource,
  onSelectNode
}: {
  graph: RepositoryGraph;
  annotations: CodeAnnotation[];
  selectedPath: string;
  selectedNodeId?: string;
  onOpenSource(path: string, line?: number): void;
  onSelectNode(node: GraphNode): void;
}) {
  const [exploring, setExploring] = useState(false);
  const nodes = useMemo<Node[]>(() => layoutGraphNodes(graph.nodes, selectedPath, selectedNodeId).map((node) => {
    const source = node.data.graphNode as GraphNode;
    const count = annotationsForNode(annotations, source).filter((note) => !note.resolved).length;
    return { ...node, data: { ...node.data, label: <span className="cm-annotated-node" title={source.label}><span>{source.label}</span>{count > 0 && <em title={`${count} open annotations`}><MessageSquareText size={10} />{count}</em>}</span> } };
  }), [graph.nodes, annotations, selectedNodeId, selectedPath]);
  const edges = useMemo<Edge[]>(() => graph.edges.map(toFlowEdge), [graph.edges]);
  const toggle = <button type="button" className="absolute right-3 top-3 z-20 grid h-7 w-7 place-items-center rounded border border-line bg-ink/90 text-steel hover:border-mint hover:text-white" title={exploring ? "Use original graph view" : "Explore connections"} aria-label={exploring ? "Use original graph view" : "Explore connections"} aria-pressed={exploring} onClick={() => setExploring((value) => !value)}><Network size={14} /></button>;
  if (exploring) return <div className="flex h-full flex-col"><div className="flex items-center justify-between border-b border-line bg-ink px-3 py-2 text-xs text-steel"><span>Connection explorer</span><button type="button" className="grid h-7 w-7 place-items-center rounded border border-line hover:border-mint hover:text-white" title="Use original graph view" aria-label="Use original graph view" onClick={() => setExploring(false)}><Network size={14} /></button></div><div className="min-h-0 flex-1"><RepositoryGraphCanvas graph={graph} selectedPath={selectedPath} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onOpenSource={onOpenSource} /></div></div>;
  return (
    <div className="relative h-full">
      {toggle}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-4rem)] flex-wrap gap-x-3 gap-y-1 rounded border border-line bg-ink/90 px-3 py-2 font-mono text-[10px] text-steel backdrop-blur">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-mint" />Function</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet" />Class</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan" />File</span>
        <span className="text-cyan">― Calls</span><span className="text-amber">┈ Imports</span><span>╌ Contains</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        panOnScroll
        onNodeClick={(_event: MouseEvent, node: Node) => {
          onSelectNode(node.data.graphNode as GraphNode);
        }}
      >
        <Background color="#263445" />
        <Controls />
        <MiniMap pannable zoomable nodeColor={(node) => String(node.style?.borderColor ?? "#64778b")} maskColor="rgba(8, 13, 20, 0.72)" />
      </ReactFlow>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-ink/90 px-3 py-1.5 font-mono text-[10px] text-steel backdrop-blur">
        <span className="flex gap-3"><span className="text-mint">Functions: {graph.nodes.filter((node) => node.symbolKind === "function").length}</span><span className="text-violet">Classes: {graph.nodes.filter((node) => node.symbolKind === "class").length}</span><span className="text-cyan">Files: {graph.nodes.filter((node) => node.type === "file").length}</span></span>
        <span className="truncate">Active: {selectedPath}</span>
      </div>
    </div>
  );
}

function layoutGraphNodes(graphNodes: GraphNode[], selectedPath: string, selectedNodeId?: string): Node[] {
  const order: GraphNode["type"][] = ["repository", "folder", "file", "symbol"];
  const columns: Record<GraphNode["type"], number> = { repository: 1, folder: 5, file: 5, symbol: 6 };
  const offsets = new Map<GraphNode["type"], number>();
  let nextY = 70;
  for (const type of order) {
    offsets.set(type, nextY);
    const count = graphNodes.filter((node) => node.type === type).length;
    nextY += Math.max(1, Math.ceil(count / columns[type])) * 105 + 35;
  }
  const counters: Record<GraphNode["type"], number> = { repository: 0, folder: 0, file: 0, symbol: 0 };
  return graphNodes.map((node) => {
    const index = counters[node.type]++;
    const color = node.type === "file"
      ? "#56c7e8"
      : node.symbolKind === "class"
        ? "#a78bfa"
        : node.symbolKind === "function"
          ? "#64d6af"
          : node.type === "folder"
            ? "#f2b86b"
            : "#ef746f";
    const selected = node.id === selectedNodeId;
    return {
      id: node.id,
      data: { label: node.label, filePath: node.filePath, graphNode: node },
      position: { x: (index % columns[node.type]) * 190, y: (offsets.get(node.type) ?? 0) + Math.floor(index / columns[node.type]) * 105 },
      style: {
        width: 160,
        borderColor: selected || node.filePath === selectedPath ? color : "#314154",
        borderWidth: selected ? 2 : 1,
        background: `${color}12`,
        color: selected ? "#ffffff" : "#d7e1ea",
        boxShadow: selected ? `0 0 0 3px ${color}22` : "none"
      }
    };
  });
}

function toFlowEdge(edge: GraphEdge): Edge {
  const relationship = edge.label === "calls" ? "calls" : edge.type;
  const stroke = relationship === "calls" ? "#56c7e8" : relationship === "imports" ? "#f2b86b" : "#64778b";
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: relationship === "contains" ? undefined : relationship,
    animated: relationship === "calls" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    style: { stroke, strokeDasharray: relationship === "imports" ? "2 5" : relationship === "contains" ? "7 5" : undefined },
    labelStyle: { fill: stroke, fontSize: 9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
  };
}

function NodeInspector({
  node,
  graph,
  annotations,
  currentUserId,
  projectId,
  workspaceId,
  socket,
  sourceContent,
  canManage
}: {
  node: GraphNode;
  graph: RepositoryGraph;
  annotations: CodeAnnotation[];
  currentUserId: string;
  projectId: string;
  workspaceId: string;
  socket: Socket | null;
  sourceContent: string;
  canManage: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<NonNullable<CodeAnnotation["kind"]>>("comment");
  const [pending, setPending] = useState(false);
  const related = annotationsForNode(annotations, node);
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const outgoing = graph.edges.filter((edge) => edge.source === node.id);
  const affectedFiles = new Set(
    graph.nodes
      .filter((candidate) => incoming.some((edge) => edge.source === candidate.id) || outgoing.some((edge) => edge.target === candidate.id))
      .map((candidate) => candidate.filePath)
      .filter(Boolean)
  );

  function addAnnotation() {
    if (!socket?.connected || !node.filePath || body.trim().length < 2) return;
    setError("");
    setPending(true);
    const sent = body;
    socket.timeout(8000).emit("annotation:create", {
      projectId,
      workspaceId,
      filePath: node.filePath,
      symbolId: node.symbolId,
      range: node.range ?? { startLine: 1, startColumn: 1, endLine: Math.max(1, sourceContent.split("\n").length), endColumn: 1 },
      body: body.trim(),
      sourceRevision: "workspace",
      kind
    }, (error: Error | null, response: { ok: boolean; error?: string }) => {
      setPending(false);
      if (!error && response?.ok) setBody((current) => current === sent ? "" : current);
      else setError(response?.error ?? "Annotation could not be saved.");
    });
  }

  return (
    <section className="max-h-64 shrink-0 overflow-y-auto border-b border-line p-3" aria-label="Selected graph node">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="eyebrow"><MessageSquareText className="h-3.5 w-3.5" /> Selected node</div>
          <h2 className="mt-1 truncate text-sm font-semibold text-white">{node.label}</h2>
          <p className="mt-1 truncate font-mono text-[10px] text-steel">{node.filePath ?? node.type}</p>
        </div>
        <StatusPill tone={incoming.length + outgoing.length > 7 ? "warn" : "good"}>{incoming.length + outgoing.length > 7 ? "high impact" : "focused"}</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-y border-line py-2 text-center text-[10px] text-steel">
        <div><strong className="block text-sm text-white">{incoming.length}</strong>incoming</div>
        <div><strong className="block text-sm text-white">{outgoing.length}</strong>outgoing</div>
        <div><strong className="block text-sm text-white">{affectedFiles.size}</strong>files</div>
      </div>
      <div className="mt-2 space-y-1.5">
        {related.map((annotation) => (
          <div key={annotation.id} className={`cm-graph-note cm-note-${annotation.kind ?? "comment"} ${annotation.resolved ? "is-resolved" : ""}`}>
            <div><span>{annotation.kind ?? "comment"}{annotation.resolved ? " - resolved" : ""}{annotation.outdated ? " - source changed" : ""}</span><p>{annotation.body}</p></div>
            {(annotation.authorId === currentUserId || canManage) && socket && <div className="cm-note-actions"><button type="button" disabled={!socket.connected} title={annotation.resolved ? "Reopen annotation" : "Resolve annotation"} aria-label={annotation.resolved ? "Reopen annotation" : "Resolve annotation"} onClick={() => socket.timeout(8000).emit("annotation:resolve", { projectId, workspaceId, annotationId: annotation.id, resolved: !annotation.resolved }, (error: Error | null, response: { ok: boolean; error?: string }) => { if (error || !response?.ok) setError(response?.error ?? "Annotation update timed out."); })}><Check size={14} /></button><button type="button" disabled={!socket.connected} title="Remove annotation" aria-label="Remove annotation" onClick={() => socket.timeout(8000).emit("annotation:delete", { projectId, workspaceId, annotationId: annotation.id }, (error: Error | null, response: { ok: boolean; error?: string }) => { if (error || !response?.ok) setError(response?.error ?? "Annotation removal timed out."); })}><Trash2 size={14} /></button></div>}
          </div>
        ))}
      </div>
      {node.filePath && (
        <div className="cm-note-composer">
          <select aria-label="Annotation type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="comment">Comment</option><option value="question">Question</option><option value="decision">Decision</option></select>
          <input className="field min-w-0 py-1.5 text-xs" aria-label="Graph annotation" value={body} maxLength={1000} placeholder="Add a node annotation" onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAnnotation(); }} />
          <button className="rounded bg-violet px-2 text-ink disabled:opacity-40" type="button" title="Add annotation" aria-label="Add annotation" disabled={!socket?.connected || pending || body.trim().length < 2} onClick={addAnnotation}><MessageSquareText className="h-4 w-4" /></button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-coral">{error}</p>}
    </section>
  );
}

type RevisionSummary = { id: string; path: string; version: number; reason: string; createdAt: string };

function HistoryMenu({ projectId, workspaceId, path, socket, canRestore }: { projectId: string; workspaceId: string; path: string; socket: Socket | null; canRestore: boolean }) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["workspace-history", projectId, path],
    queryFn: () => api<RevisionSummary[]>(`/api/projects/${projectId}/workspace/history?path=${encodeURIComponent(path)}`),
    enabled: Boolean(path)
  });

  return (
    <details className="cm-workspace-history relative hidden sm:block">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded border border-line px-2 py-1.5 text-xs text-steel hover:border-mint hover:text-white"><History className="h-3.5 w-3.5" /> History</summary>
      <div className="cm-popover absolute right-0 top-9 z-40 w-72 p-3">
        <div className="text-xs font-semibold text-white">File history</div>
        <div className="mt-1 truncate font-mono text-[10px] text-steel">{path}</div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {history.isLoading && <div className="text-xs text-steel">Loading snapshots...</div>}
          {!history.isLoading && history.data?.length === 0 && <div className="text-xs leading-5 text-steel">Snapshots appear automatically as collaborative edits are persisted.</div>}
          {history.data?.map((revision) => (
            <div key={revision.id} className="flex items-center justify-between gap-2 border-t border-line pt-2">
              <div className="min-w-0"><div className="text-xs text-white">Version {revision.version}</div><div className="truncate text-[10px] text-steel">{revision.reason} · {relativeTime(revision.createdAt)}</div></div>
              <button className="cm-icon-button h-7 w-7 shrink-0" type="button" title="Restore revision" aria-label={`Restore version ${revision.version}`} disabled={!canRestore || !socket} onClick={() => socket?.emit("doc:restore", { projectId, workspaceId, revisionId: revision.id }, (response: { ok: boolean }) => { if (response.ok) void queryClient.invalidateQueries({ queryKey: ["workspace-history", projectId, path] }); })}><RotateCcw className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function ChatPanel({ projectId, userId, workspaceId, messages, socket, connected, canPost }: { projectId: string; userId: string; workspaceId: string; messages: ChatMessage[]; socket: Socket | null; connected: boolean; canPost: boolean }) {
  const { text: body, setText: setBody, saved } = useComposerDraft({ projectId, userId, workspaceId, kind: "chat", path: "message" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="cm-workspace-chat shrink-0 border-t border-line p-3">
      <button type="button" className="flex w-full items-center gap-2 text-left font-semibold text-white" aria-expanded={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
        <MessageSquare className="h-4 w-4 text-mint" />
        Workspace chat
        <span className="ml-auto text-xs text-steel">{messages.length}</span>
      </button>
      {chatOpen && <div className="cm-workspace-chat-body">
      <div className="cm-scrollbar mt-3 flex-1 space-y-2 overflow-auto">
        {messages.map((message) => (
          <div key={message.id} className="rounded border border-line bg-ink px-2 py-1.5 text-sm">
            <div className="text-xs text-steel">{relativeTime(message.createdAt)}</div>
            <div className="mt-1 text-slate-100">{message.body}</div>
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim() || !socket?.connected || !canPost || !connected || pending) return;
          const sent = body; setPending(true); setError("");
          socket.timeout(8000).emit("workspace:chat:send", { projectId, workspaceId, body }, (error: Error | null, response: { ok: boolean; error?: string }) => {
            setPending(false);
            if (!error && response?.ok) setBody((current) => current === sent ? "" : current);
            else setError(response?.error ?? "Message not confirmed. Draft retained; check chat before retrying.");
          });
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 text-sm text-white"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Message"
          aria-label="Workspace message"
          maxLength={4000}
        />
        <button className="rounded border border-line px-2 text-steel hover:text-white disabled:opacity-40" title="Send workspace message" aria-label="Send workspace message" disabled={!canPost || !connected || pending || !body.trim()}>
          <GitPullRequest className="h-4 w-4" />
        </button>
      </form>
      {(error || !saved || !connected) && <p className="mt-1 text-[10px] text-amber" role="status">{error || (!saved ? "Device storage unavailable; keep this draft open." : "Offline - message draft retained")}</p>}
      </div>}
    </div>
  );
}

function languageForPath(path: string) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".py")) return "python";
  return "plaintext";
}

function baseName(path: string) {
  return path.split("/").pop() ?? path;
}

function exportGraph(projectName: string, graph: RepositoryGraph) {
  const payload = JSON.stringify({ project: projectName, exportedAt: new Date().toISOString(), graph }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "codaventra"}-architecture.json`;
  link.click();
  URL.revokeObjectURL(url);
}

