import { useMemo, useState, type CSSProperties } from "react";
import {
  Bot,
  Braces,
  Boxes,
  FileCode2,
  GitPullRequest,
  Network,
  ShieldCheck,
  UsersRound,
  type LucideIcon
} from "lucide-react";

type GraphMode = "structure" | "retrieval" | "collaboration";

type GraphNode = {
  id: string;
  label: string;
  kind: string;
  detail: string;
  x: number;
  y: number;
  tone: "mint" | "cyan" | "violet" | "rose" | "amber" | "coral";
  icon: LucideIcon;
};

const nodes: GraphNode[] = [
  { id: "repo", label: "TaskPilot", kind: "Repository", detail: "The indexed source boundary and root of every graph traversal.", x: 50, y: 10, tone: "mint", icon: Boxes },
  { id: "api", label: "server.ts", kind: "Entry point", detail: "Bootstraps HTTP routes, security middleware, realtime sync, and the assistant.", x: 18, y: 38, tone: "cyan", icon: FileCode2 },
  { id: "routes", label: "projectRoutes", kind: "Function", detail: "Connects repository imports, files, graph queries, and project permissions.", x: 50, y: 38, tone: "violet", icon: Braces },
  { id: "assistant", label: "askRepository", kind: "AI pipeline", detail: "Retrieves source-linked context and returns answers with citations.", x: 82, y: 38, tone: "rose", icon: Bot },
  { id: "auth", label: "authorize", kind: "Security", detail: "Evaluates role permissions before protected repository operations run.", x: 18, y: 65, tone: "amber", icon: ShieldCheck },
  { id: "tasks", label: "tasks", kind: "Collaboration", detail: "Tracks scoped work from backlog through review and completion.", x: 40, y: 66, tone: "cyan", icon: UsersRound },
  { id: "graph", label: "code graph", kind: "Index", detail: "Links files, symbols, imports, calls, and containment relationships.", x: 63, y: 66, tone: "mint", icon: Network },
  { id: "review", label: "patch review", kind: "Contribution", detail: "Turns proposed changes into inspectable, permission-aware contribution work.", x: 82, y: 65, tone: "coral", icon: GitPullRequest }
];

const edges = [
  { from: "repo", to: "api" },
  { from: "repo", to: "routes" },
  { from: "repo", to: "assistant" },
  { from: "api", to: "auth" },
  { from: "routes", to: "tasks" },
  { from: "routes", to: "graph" },
  { from: "assistant", to: "graph" },
  { from: "assistant", to: "review" },
  { from: "tasks", to: "review" },
  { from: "auth", to: "review" }
];

const modeDetails: Record<GraphMode, { label: string; eyebrow: string; description: string; nodes: string[] }> = {
  structure: {
    label: "Structure",
    eyebrow: "Repository model",
    description: "Explore how files, functions, services, and workflows fit together before opening an editor.",
    nodes: nodes.map((node) => node.id)
  },
  retrieval: {
    label: "Retrieval",
    eyebrow: "Grounded context",
    description: "Follow the focused path used to assemble source-linked evidence for an assistant answer.",
    nodes: ["repo", "routes", "assistant", "graph"]
  },
  collaboration: {
    label: "Collaboration",
    eyebrow: "Change workflow",
    description: "See the permission, task, and review surfaces that carry an idea into a verified contribution.",
    nodes: ["repo", "api", "auth", "tasks", "assistant", "review"]
  }
};

export function InteractiveCodeGraph() {
  const [mode, setMode] = useState<GraphMode>("structure");
  const [activeNodeId, setActiveNodeId] = useState("repo");
  const activeNode = nodes.find((node) => node.id === activeNodeId) ?? nodes[0]!;
  const modeNodeIds = useMemo(() => new Set(modeDetails[mode].nodes), [mode]);

  return (
    <div className="cm-graph-experience" data-reveal>
      <div className="cm-graph-toolbar">
        <div>
          <div className="eyebrow"><Network className="h-3.5 w-3.5" /> Interactive repository graph</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Trace the system, not a pile of files</h3>
        </div>
        <div className="cm-segmented" role="tablist" aria-label="Graph view">
          {(Object.keys(modeDetails) as GraphMode[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={mode === key ? "is-active" : ""}
              onClick={() => {
                setMode(key);
                setActiveNodeId(modeDetails[key].nodes[0]!);
              }}
            >
              {modeDetails[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="cm-graph-stage" aria-label={`${modeDetails[mode].label} repository graph`}>
        <svg className="cm-graph-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
          {edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from)!;
            const to = nodes.find((node) => node.id === edge.to)!;
            const highlighted = modeNodeIds.has(edge.from) && modeNodeIds.has(edge.to);
            return (
              <g key={`${edge.from}-${edge.to}`} className={highlighted ? "is-active" : ""}>
                <line x1={from.x * 10} y1={from.y * 6.2} x2={to.x * 10} y2={to.y * 6.2} />
                {highlighted && <circle r="3" className="cm-graph-packet"><animateMotion dur="2.8s" repeatCount="indefinite" path={`M ${from.x * 10} ${from.y * 6.2} L ${to.x * 10} ${to.y * 6.2}`} /></circle>}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const Icon = node.icon;
          const isInMode = modeNodeIds.has(node.id);
          return (
            <button
              key={node.id}
              type="button"
              className={`cm-graph-node ${activeNodeId === node.id ? "is-selected" : ""} ${isInMode ? "is-in-mode" : ""}`}
              data-tone={node.tone}
              style={{ "--node-x": `${node.x}%`, "--node-y": `${node.y}%` } as CSSProperties}
              aria-pressed={activeNodeId === node.id}
              onClick={() => setActiveNodeId(node.id)}
            >
              <span className="cm-graph-node-icon"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 text-left">
                <span className="cm-graph-node-label block text-xs font-semibold text-white">{node.label}</span>
                <span className="cm-graph-node-kind block font-mono text-[10px] text-steel">{node.kind}</span>
              </span>
            </button>
          );
        })}

        <div className="cm-graph-caption" aria-live="polite">
          <div className="font-mono text-[10px] uppercase text-mint">{modeDetails[mode].eyebrow}</div>
          <div className="mt-1 text-sm font-semibold text-white">{activeNode.label}</div>
          <p className="mt-1 text-xs leading-5 text-steel">{activeNode.detail}</p>
        </div>
      </div>

      <div className="cm-graph-footer">
        <p>{modeDetails[mode].description}</p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-steel">
          <span><i className="bg-mint" /> Files</span>
          <span><i className="bg-violet" /> Symbols</span>
          <span><i className="bg-rose" /> AI context</span>
          <span><i className="bg-coral" /> Review</span>
        </div>
      </div>
    </div>
  );
}
