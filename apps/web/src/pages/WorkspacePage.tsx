import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Code2, Columns3, Download, FileSearch, GitPullRequest, History, Maximize2, MessageSquare, MessageSquareText, Minimize2, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Radio, RotateCcw, Search, Trash2, SlidersHorizontal, Save, X } from "lucide-react";
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
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { API_URL, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relativeTime } from "../lib/format";
import { parseWorkspaceLayout, workspaceLayoutKey, workspacePresets, type WorkspaceLayout } from "../lib/workspaceLayout";
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
  const socketRef = useRef<Socket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const selectedPathRef = useRef(selectedPath);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationIds = useRef<string[]>([]);
  const applyingRemote = useRef(false);

  selectedPathRef.current = selectedPath;

  const workspace = useQuery({
    queryKey: ["workspace", projectId],
    queryFn: () => api<WorkspacePayload>(`/api/projects/${projectId}/workspace`),
    enabled: Boolean(user)
  });
  const data = workspace.data;
  const selectedDoc = data?.docs.find((doc) => doc.path === selectedPath);
  const canEdit = data?.permissions.includes("workspace.edit") ?? false;
  const focusMode = !filePanelOpen && !assistantPanelOpen;
  const visibleFiles = useMemo(() => {
    const needle = fileFilter.trim().toLowerCase();
    return data?.files.filter((file) => !needle || file.path.toLowerCase().includes(needle)) ?? [];
  }, [data?.files, fileFilter]);

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
    const matchingNode = data.graph.nodes.find((node) =>
      node.filePath === requestedPath && node.range && requestedLine >= node.range.startLine && requestedLine <= node.range.endLine
    ) ?? data.graph.nodes.find((node) => node.filePath === requestedPath && node.type === "file");
    setSelectedNode(matchingNode ?? null);
    setSelectedPath(requestedPath);
  }, [data, requestedLine, requestedPath]);

  function selectSource(path: string, line?: number) {
    setSelectedPath(path);
    const next = new URLSearchParams(searchParams);
    next.set("path", path);
    if (line) next.set("line", String(line));
    else next.delete("line");
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (!data || !user) return;
    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnection("connected");
      socket.emit("workspace:join", { projectId, workspaceId: data.workspaceId }, () => undefined);
    });
    socket.on("disconnect", () => setConnection("reconnecting"));
    socket.on("connect_error", (error) => setConnection(error.message));
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
      setContent(docRef.current.getText("content").toString());
      applyingRemote.current = false;
    });
    socket.on("doc:restored", (payload: { path: string; update: number[] }) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-history", projectId, payload.path] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
      if (payload.path !== selectedPathRef.current || !docRef.current) return;
      applyingRemote.current = true;
      Y.applyUpdate(docRef.current, Uint8Array.from(payload.update));
      setContent(docRef.current.getText("content").toString());
      applyingRemote.current = false;
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [data?.workspaceId, projectId, queryClient, user]);

  useEffect(() => {
    if (!data || !selectedPath || !socketRef.current) {
      setContent(selectedDoc?.content ?? "");
      return;
    }
    const doc = new Y.Doc();
    docRef.current = doc;
    socketRef.current.emit(
      "doc:open",
      { projectId, workspaceId: data.workspaceId, path: selectedPath },
      (response: { ok: boolean; update?: number[]; error?: string }) => {
        if (response.ok && response.update) {
          Y.applyUpdate(doc, Uint8Array.from(response.update));
          setContent(doc.getText("content").toString());
        } else {
          setContent(selectedDoc?.content ?? "");
        }
      }
    );
    socketRef.current.emit("presence:update", { projectId, workspaceId: data.workspaceId, path: selectedPath });
    return () => {
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [data, projectId, selectedDoc?.content, selectedPath]);

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
    if (range) editor.revealLinesInCenter(range.startLine, range.endLine);
  }, [content, selectedNode, selectedPath, view]);

  const mountEditor: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  function updateEditor(value = "") {
    setContent(value);
    if (!canEdit || applyingRemote.current || !docRef.current || !data || !socketRef.current) return;
    const text = docRef.current.getText("content");
    docRef.current.transact(() => {
      text.delete(0, text.length);
      text.insert(0, value);
    }, "local-editor");
    const update = Array.from(Y.encodeStateAsUpdate(docRef.current));
    socketRef.current.emit("doc:update", { projectId, workspaceId: data.workspaceId, path: selectedPath, update }, () => undefined);
  }

  if (!user) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-steel">Sign in to join a workspace.</div>;
  }
  if (workspace.isLoading || !data) {
    return <LoadingState label="Loading collaborative workspace" />;
  }

  return (
    <section className="cm-code-workspace h-[calc(100vh-3.5rem)] overflow-hidden bg-ink" data-compact={compact} onKeyDown={(event) => { if (event.key === "Escape") { setLayoutMenuOpen(false); if (compact) { setFilePanelOpen(false); setAssistantPanelOpen(false); } } }}>
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
        <aside className={`cm-workspace-rail cm-file-rail min-h-0 overflow-hidden border-r border-line bg-panel ${filePanelOpen ? "opacity-100" : "pointer-events-none border-transparent opacity-0"}`} aria-hidden={!filePanelOpen} inert={!filePanelOpen}>
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
          <div className="cm-scrollbar h-full overflow-auto p-2">
            {visibleFiles.map((file) => (
              <button
                key={file.path}
                className={`mb-1 block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs ${
                  file.path === selectedPath ? "bg-mint/15 text-mint" : "text-steel hover:bg-ink hover:text-white"
                }`}
                onClick={() => {
                  selectSource(file.path);
                  if (compact) setFilePanelOpen(false);
                  setView("editor");
                }}
              >
                {file.path}
              </button>
            ))}
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
              <HistoryMenu projectId={projectId} workspaceId={data.workspaceId} path={selectedPath} socket={socketRef.current} canRestore={data.permissions.includes("workspace.review")} />
              <button className="cm-workspace-export hidden items-center gap-1.5 rounded border border-line px-2 py-1.5 text-xs text-steel hover:border-mint hover:text-white sm:flex" type="button" title="Export architecture graph" onClick={() => exportGraph(data.project.name, data.graph)}>
                <Download className="h-3.5 w-3.5" /> Export graph
              </button>
              <div className="cm-workspace-activepath hidden min-w-0 items-center gap-2 sm:flex"><span className="text-xs text-steel">Editing</span><div className="truncate font-mono text-xs text-steel">{selectedPath}</div></div>
            </div>
          </div>
          <div className="h-[calc(100%-2.75rem)]">
            {view === "editor" && (
              <EditorPane path={selectedPath} files={data.files} content={content} canEdit={canEdit} onMount={mountEditor} onChange={updateEditor} onSelectPath={selectSource} />
            )}
            {view === "graph" && (
              <GraphView graph={data.graph} selectedPath={selectedPath} selectedNodeId={selectedNode?.id} onSelectNode={(node) => {
                setSelectedNode(node);
                if (node.filePath) selectSource(node.filePath, node.range?.startLine);
              }} />
            )}
            {view === "split" && (
              <div className={`grid h-full ${compact ? "grid-cols-1 grid-rows-2" : ""}`} style={compact ? undefined : { gridTemplateColumns: `minmax(0, ${panelSizes.graphPercent}fr) minmax(0, ${100 - panelSizes.graphPercent}fr)` }}>
                <div className="min-w-0 border-r border-line">
                  <GraphView graph={data.graph} selectedPath={selectedPath} selectedNodeId={selectedNode?.id} onSelectNode={(node) => {
                    setSelectedNode(node);
                    if (node.filePath) selectSource(node.filePath, node.range?.startLine);
                  }} />
                </div>
                <div className="min-w-0">
                  <EditorPane path={selectedPath} files={data.files} content={content} canEdit={canEdit} onMount={mountEditor} onChange={updateEditor} onSelectPath={selectSource} />
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
            />
          )}
          <RepositoryAssistant
            projectId={projectId}
            activeFilePath={selectedPath}
            canReview={data.permissions.includes("workspace.review")}
            onOpenFile={(path) => {
              selectSource(path);
              if (compact) setAssistantPanelOpen(false);
              if (selectedNode?.filePath !== path) setSelectedNode(null);
              setView("editor");
            }}
          />
          <ChatPanel projectId={projectId} workspaceId={data.workspaceId} messages={data.chat} socket={socketRef.current} />
        </aside>
      </div>
    </section>
  );
}

function EditorPane({ path, files, content, canEdit, onMount, onChange, onSelectPath }: { path: string; files: RepoFile[]; content: string; canEdit: boolean; onMount: OnMount; onChange(value: string): void; onSelectPath(path: string): void }) {
  const tabs = [files.find((file) => file.path === path), ...files.filter((file) => file.path !== path)].filter((file): file is RepoFile => Boolean(file)).slice(0, 6);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="cm-scrollbar flex h-9 shrink-0 overflow-x-auto border-b border-line bg-panel/70">
        {tabs.map((file) => <button key={file.path} className={`flex shrink-0 items-center gap-2 border-r border-line px-3 font-mono text-[11px] ${file.path === path ? "bg-ink text-white" : "text-steel hover:bg-ink/60 hover:text-white"}`} type="button" title={file.path} onClick={() => onSelectPath(file.path)}><span className={`h-1.5 w-1.5 rounded-full ${file.language === "python" ? "bg-mint" : file.language === "typescript" ? "bg-cyan" : file.language === "javascript" ? "bg-amber" : "bg-violet"}`} />{baseName(file.path)}</button>)}
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={languageForPath(path)}
          theme="vs-dark"
          value={content}
          onMount={onMount}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", readOnly: !canEdit, glyphMargin: true, smoothScrolling: true }}
          onChange={(value) => onChange(value ?? "")}
        />
      </div>
    </div>
  );
}

function GraphView({
  graph,
  selectedPath,
  selectedNodeId,
  onSelectNode
}: {
  graph: RepositoryGraph;
  selectedPath: string;
  selectedNodeId?: string;
  onSelectNode(node: GraphNode): void;
}) {
  const nodes = useMemo<Node[]>(() => layoutGraphNodes(graph.nodes, selectedPath, selectedNodeId), [graph.nodes, selectedNodeId, selectedPath]);
  const edges = useMemo<Edge[]>(() => graph.edges.map(toFlowEdge), [graph.edges]);
  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded border border-line bg-ink/90 px-3 py-2 font-mono text-[10px] text-steel backdrop-blur">
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
    animated: relationship === "calls",
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
  socket
}: {
  node: GraphNode;
  graph: RepositoryGraph;
  annotations: CodeAnnotation[];
  currentUserId: string;
  projectId: string;
  workspaceId: string;
  socket: Socket | null;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const related = annotations.filter((annotation) => annotation.symbolId === node.symbolId || (!node.symbolId && annotation.filePath === node.filePath));
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const outgoing = graph.edges.filter((edge) => edge.source === node.id);
  const affectedFiles = new Set(
    graph.nodes
      .filter((candidate) => incoming.some((edge) => edge.source === candidate.id) || outgoing.some((edge) => edge.target === candidate.id))
      .map((candidate) => candidate.filePath)
      .filter(Boolean)
  );

  function addAnnotation() {
    if (!socket || !node.filePath || !node.range || body.trim().length < 2) return;
    setError("");
    socket.emit("annotation:create", {
      projectId,
      workspaceId,
      filePath: node.filePath,
      symbolId: node.symbolId,
      range: node.range,
      body: body.trim(),
      sourceRevision: "workspace"
    }, (response: { ok: boolean; error?: string }) => {
      if (response.ok) setBody("");
      else setError(response.error ?? "Annotation could not be saved.");
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
          <div key={annotation.id} className="flex gap-2 border-l-2 border-violet pl-2 text-xs leading-5 text-steel">
            <span className="min-w-0 flex-1">{annotation.body}</span>
            {annotation.authorId === currentUserId && socket && (
              <button type="button" className="shrink-0 text-steel hover:text-coral" title="Remove annotation" aria-label="Remove annotation" onClick={() => socket.emit("annotation:delete", { projectId, workspaceId, annotationId: annotation.id }, () => undefined)}><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
      </div>
      {node.filePath && node.range && (
        <div className="mt-2 flex gap-2">
          <input className="field min-w-0 py-1.5 text-xs" value={body} maxLength={1000} placeholder="Add a node annotation" onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAnnotation(); }} />
          <button className="rounded bg-violet px-2 text-ink disabled:opacity-40" type="button" title="Add annotation" aria-label="Add annotation" disabled={!socket || body.trim().length < 2} onClick={addAnnotation}><MessageSquareText className="h-4 w-4" /></button>
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

function ChatPanel({ projectId, workspaceId, messages, socket }: { projectId: string; workspaceId: string; messages: ChatMessage[]; socket: Socket | null }) {
  const [body, setBody] = useState("");
  return (
    <div className="flex min-h-0 flex-[2] flex-col p-3">
      <div className="flex items-center gap-2 font-semibold text-white">
        <MessageSquare className="h-4 w-4 text-mint" />
        Workspace chat
      </div>
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
          if (!body.trim() || !socket) return;
          socket.emit("workspace:chat:send", { projectId, workspaceId, body }, () => setBody(""));
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 text-sm text-white"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Message"
        />
        <button className="rounded border border-line px-2 text-steel hover:text-white">
          <GitPullRequest className="h-4 w-4" />
        </button>
      </form>
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
  link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "codemesh"}-architecture.json`;
  link.click();
  URL.revokeObjectURL(url);
}
