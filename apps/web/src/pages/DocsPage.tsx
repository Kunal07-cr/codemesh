import { useState } from "react";
import { Bot, BrainCircuit, Check, Clipboard, Code2, FlaskConical, FolderPlus, GitPullRequest, KeyRound, Orbit, Play, Rocket, ShieldCheck, Users } from "lucide-react";

const quickStart = `npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run dev`;

const geminiConfig = `GEMINI_API_KEY=your-key
GEMINI_MODEL=your-model`;

const compatibleConfig = `LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=not-needed
LLM_MODEL=qwen2.5-coder:14b
LLM_TEMPERATURE=0.3
MAX_CONTEXT_MESSAGES=30`;

const apiGroups = [
  {
    title: "Authentication",
    routes: ["GET /api/auth/me", "POST /api/auth/login", "POST /api/auth/register", "POST /api/auth/logout"]
  },
  {
    title: "Projects",
    routes: ["GET /api/projects/dashboard", "POST /api/projects", "GET /api/projects/:projectId/workspace", "GET /api/projects/:projectId/intelligence", "GET /api/projects/:projectId/labs", "GET /api/projects/:projectId/advanced", "POST /api/projects/:projectId/advanced/runs", "POST /api/projects/:projectId/advanced/traces", "POST /api/projects/:projectId/advanced/decisions", "POST /api/projects/:projectId/import/zip"]
  },
  {
    title: "AI and review",
    routes: ["POST /api/projects/:projectId/ai/ask", "POST /api/projects/:projectId/ai/stream", "GET /api/projects/:projectId/ai/conversations", "GET /api/projects/:projectId/ai/dataset", "POST /api/projects/:projectId/patches/:patchId/apply", "POST /api/projects/:projectId/patches/:patchId/reject"]
  },
  {
    title: "Delivery and agents",
    routes: ["GET /api/projects/:projectId/delivery", "POST /api/projects/:projectId/delivery/reviews", "POST /api/projects/:projectId/delivery/futures", "POST /api/projects/:projectId/delivery/futures/:runId/reconcile", "POST /api/projects/:projectId/delivery/sandbox", "POST /api/projects/:projectId/delivery/incidents", "POST /api/projects/:projectId/delivery/tokens", "POST /api/mcp"]
  }
];

export function DocsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="border-b border-line pb-6">
        <p className="text-sm font-semibold uppercase text-mint">CodeMesh documentation</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Build, understand, and edit repositories</h1>
        <p className="mt-3 max-w-3xl leading-7 text-steel">Use this guide to run CodeMesh, create a project, work with the repository assistant, and review changes safely.</p>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 text-sm" aria-label="Documentation sections">
            {[
              ["getting-started", "Getting started"],
              ["projects", "Projects"],
              ["intelligence", "Graph intelligence"],
              ["labs", "Engineering Labs"],
              ["advanced", "Advanced Operations"],
              ["delivery", "Delivery Hub"],
              ["assistant", "AI Assistant"],
              ["collaboration", "Collaboration"],
              ["api", "API reference"],
              ["configuration", "Configuration"]
            ].map(([id, label]) => (
              <a key={id} className="block border-l border-line px-3 py-2 text-steel hover:border-mint hover:text-white" href={`#${id}`}>{label}</a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 space-y-12">
          <DocSection id="getting-started" icon={Play} title="Getting started">
            <p>Run these commands from the CodeMesh project directory. On Windows, use <code className="text-mint">npm.cmd</code> because PowerShell may block <code className="text-mint">npm.ps1</code>.</p>
            <CodeBlock code={quickStart} />
            <p>Open <a className="text-mint hover:underline" href="http://localhost:4200">http://localhost:4200</a>. The seeded accounts use password <code className="text-mint">CodeMesh123!</code>.</p>
            <div className="overflow-x-auto border-y border-line">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-steel"><tr><th className="px-3 py-3 font-medium">Account</th><th className="px-3 py-3 font-medium">Role</th><th className="px-3 py-3 font-medium">Purpose</th></tr></thead>
                <tbody className="divide-y divide-line text-slate-100">
                  <RoleRow email="owner@codemesh.dev" role="Owner" purpose="Full project and review access" />
                  <RoleRow email="maintainer@codemesh.dev" role="Maintainer" purpose="Edit, review, and manage tasks" />
                  <RoleRow email="contributor@codemesh.dev" role="Contributor" purpose="Edit drafts and ask the assistant" />
                  <RoleRow email="viewer@codemesh.dev" role="Viewer" purpose="Read projects and ask questions" />
                </tbody>
              </table>
            </div>
          </DocSection>

          <DocSection id="projects" icon={FolderPlus} title="Projects">
            <ol className="space-y-4">
              <Step number="1" title="Create">Open Dashboard and select New project. Enter a name, description, visibility, tags, and contribution guidelines.</Step>
              <Step number="2" title="Import">Use the starter repository for a ready-to-explore example, or import a ZIP archive through the project API.</Step>
              <Step number="3" title="Explore">Open the workspace to browse files, edit code, and inspect the architecture graph.</Step>
              <Step number="4" title="Review">Turn assistant edits into reviewable patches, then apply or reject them before preparing a contribution.</Step>
            </ol>
          </DocSection>

          <DocSection id="intelligence" icon={BrainCircuit} title="Graph intelligence">
            <p>Open a project and choose <strong className="text-white">Intelligence</strong> for repository health, semantic graph search, suggested tests, the audit timeline, and integration status.</p>
            <ol className="space-y-4">
              <Step number="1" title="Use Split view">The workspace places the interactive graph beside Monaco. File tabs keep frequently inspected source within reach.</Step>
              <Step number="2" title="Select a node">Function and class nodes open their source file, highlight the exact indexed line range, and reveal incoming, outgoing, and affected-file counts.</Step>
              <Step number="3" title="Annotate in context">Attach review or onboarding notes directly to the selected node. Notes synchronize through the collaboration room and persist with the project.</Step>
              <Step number="4" title="Analyze and fix">The copilot produces a grounded correction as a side-by-side patch. A reviewer must explicitly apply or reject it.</Step>
            </ol>
          </DocSection>

          <DocSection id="labs" icon={FlaskConical} title="Engineering Labs">
            <p>Open <strong className="text-white">Engineering Labs</strong> from a project to turn the repository index into six decision workbenches. Every result links back to indexed files, graph nodes, audit events, or captured snapshots.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Feature icon={BrainCircuit} title="Impact and evolution">Estimate a symbol's blast radius, query the graph in plain language, compare architecture snapshots, and follow quality over time.</Feature>
              <Feature icon={Check} title="Quality planning">Generate evidence-based test cases and review dependency upgrade risk from manifests and actual import usage.</Feature>
              <Feature icon={ShieldCheck} title="Guardrails">Check architectural policies and trace source-to-sink security paths across repository relationships.</Feature>
              <Feature icon={Users} title="Team and studio">Find high-connectivity hotspots, build an onboarding path, generate project notes, and run specialist review perspectives.</Feature>
            </div>
            <div className="border-l-2 border-amber bg-amber/5 px-4 py-3">
              <h3 className="font-semibold text-white">How to read the results</h3>
              <p className="mt-1 text-sm leading-6 text-steel">Counts, paths, files, commits, and graph links are measured evidence. Risk levels, proposed stewards, test ideas, and reviewer verdicts are deterministic heuristics for human review, not proof that code is correct or vulnerable.</p>
            </div>
          </DocSection>

          <DocSection id="advanced" icon={Orbit} title="Advanced Operations">
            <p>Advanced Operations combines six repository-aware workbenches for higher-risk engineering decisions. Open it from the project command center and move between Autonomy, Merge &amp; Risk, Runtime, Security, AI Evals, and Decisions.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Feature icon={Bot} title="Autonomous planning">Create an evidence-linked change plan, staged repair loop, and verification queue before editing code.</Feature>
              <Feature icon={GitPullRequest} title="Merge and PR risk">Review symbol-level overlap, affected files, suggested reviewers, and a deterministic merge gate.</Feature>
              <Feature icon={BrainCircuit} title="Runtime intelligence">Map OpenTelemetry-style spans back to source and compare connected repositories by language and tags.</Feature>
              <Feature icon={ShieldCheck} title="Security and governance">Inspect likely secret exposures, unsafe APIs, dependency inventory, AI retrieval quality, and saved architecture decisions.</Feature>
            </div>
            <div className="border-l-2 border-amber bg-amber/5 px-4 py-3">
              <h3 className="font-semibold text-white">Safe execution boundary</h3>
              <p className="mt-1 text-sm leading-6 text-steel">The virtual sandbox performs static parsing, manifest, graph, secret, and test-presence checks. It queues recommended commands but never executes arbitrary scripts from an imported repository.</p>
            </div>
          </DocSection>

          <DocSection id="delivery" icon={Rocket} title="Delivery Hub">
            <p>Delivery Hub turns repository intelligence into repeatable engineering workflows without replacing the existing graph, workspace, labs, or control room.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Feature icon={GitPullRequest} title="Review and sync">Select changed files, calculate graph impact, generate targeted tests, and queue an incremental index refresh.</Feature>
              <Feature icon={FlaskConical} title="Repository Futures Lab">Compare three implementation strategies before editing, preserve a prediction receipt, and reconcile the forecast against observed repository outcomes.</Feature>
              <Feature icon={ShieldCheck} title="Secure verification">Run static gates everywhere. Repository commands execute only when a dedicated restricted worker is explicitly enabled.</Feature>
              <Feature icon={KeyRound} title="MCP and VS Code">Create scoped, expiring agent tokens for repository search, impact analysis, documentation, incident tracing, and guarded plans.</Feature>
              <Feature icon={Bot} title="Incidents and automation">Map stack traces to source, build response runbooks, and turn natural-language objectives into reviewable missions.</Feature>
            </div>
            <p>Owners can create expiring read-only architecture reports. Shared reports contain health and structure evidence, but never source contents, cookies, or credentials.</p>
          </DocSection>

          <DocSection id="assistant" icon={Bot} title="AI Assistant">
            <p>The project overview includes an AI Assistant button. Select a repository file, then choose a mode:</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Mode title="Explain" description="Trace behavior and dependencies with source citations." />
              <Mode title="Investigate" description="Find relevant code, risks, and implementation details." />
              <Mode title="Edit" description="Generate a patch for review without modifying code immediately." />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Mode title="Project only" description="Use the imported repository, live workspace, and graph as the complete evidence boundary." />
              <Mode title="Project + dataset" description="Add relevant examples from the bundled repository-intelligence fixtures while keeping project claims separate." />
              <Mode title="Dataset lab" description="Explore 12 synthetic repositories, source chunks, issues, pull requests, activity, contributors, and graph records." />
            </div>
            <div className="border-l-2 border-mint bg-mint/5 px-4 py-3">
              <h3 className="font-semibold text-white">Applying an edit</h3>
              <p className="mt-1 text-sm leading-6 text-steel">Inspect every changed file and the suggested verification steps. Apply is permission-gated and rejects stale patches when the workspace changed after generation.</p>
            </div>
            <p>Responses stream token by token and conversations persist per user and project. Every answer keeps repository citations and proposed edits remain reviewable patches.</p>
            <p>Dataset source chips are violet and cannot be opened as project files. The bundled records are synthetic fixtures for retrieval and evaluation; they are not trained weights, real GitHub history, or proof of model generalization.</p>
            <p>Without external credentials, local mode supports repository retrieval and explicit instructions such as <code className="text-mint">replace `old` with `new`</code>, rename, append, prepend, or rewrite. Gemini or an OpenAI-compatible endpoint enables free-form multi-file generation.</p>
          </DocSection>

          <DocSection id="collaboration" icon={Users} title="Collaboration">
            <div className="grid gap-5 sm:grid-cols-2">
              <Feature icon={Code2} title="Live workspace">Yjs and Socket.IO synchronize active documents, presence, and workspace chat.</Feature>
              <Feature icon={GitPullRequest} title="Contributions">Applied patches create contribution records that can move into review and pull-request workflows.</Feature>
              <Feature icon={ShieldCheck} title="Permissions">Server middleware enforces project access, editing, review, member management, and publishing.</Feature>
              <Feature icon={Check} title="Patch safety">Base hashes detect stale files before generated changes can be applied.</Feature>
            </div>
          </DocSection>

          <DocSection id="api" icon={Code2} title="API reference">
            <p>Successful requests return <code className="text-mint">{"{ data: ... }"}</code>. Errors include a code, message, details, and request ID. Unsafe authenticated requests require the CSRF header issued during login.</p>
            <div className="divide-y divide-line border-y border-line">
              {apiGroups.map((group) => (
                <div key={group.title} className="grid gap-3 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <h3 className="font-semibold text-white">{group.title}</h3>
                  <div className="space-y-2">{group.routes.map((route) => <div key={route} className="font-mono text-xs text-steel">{route}</div>)}</div>
                </div>
              ))}
            </div>
          </DocSection>

          <DocSection id="configuration" icon={ShieldCheck} title="Configuration">
            <p>CodeMesh runs with the local repository assistant by default. To enable Gemini, place these values in the project <code className="text-mint">.env</code> file and restart the API.</p>
            <CodeBlock code={geminiConfig} />
            <p>Alternatively, connect any OpenAI-compatible service such as Ollama, LM Studio, vLLM, or a hosted gateway. The endpoint must expose <code className="text-mint">/chat/completions</code>.</p>
            <CodeBlock code={compatibleConfig} />
            <p>The bundled assistant dataset loads automatically. Set <code className="text-mint">ASSISTANT_DATASET_PATH</code> only when you need to point the API at another directory using the same JSON schema.</p>
            <p>A configured GitHub App enables private-file refresh and pull-request Check annotations. Branch creation and upstream pull-request publishing remain separate write operations. Local review, MCP tools, and static verification continue to work without GitHub credentials.</p>
          </DocSection>
        </article>
      </div>
    </section>
  );
}

function DocSection({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line pb-12 last:border-0">
      <h2 className="flex items-center gap-3 text-2xl font-semibold text-white"><Icon className="h-5 w-5 text-mint" />{title}</h2>
      <div className="mt-5 space-y-5 leading-7 text-steel">{children}</div>
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative overflow-hidden rounded border border-line bg-[#090d12]">
      <button
        className="absolute right-2 top-2 rounded p-2 text-steel hover:bg-panel hover:text-white"
        type="button"
        title="Copy"
        aria-label="Copy code"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4 text-mint" /> : <Clipboard className="h-4 w-4" />}
      </button>
      <pre className="cm-scrollbar overflow-x-auto p-4 pr-12 font-mono text-sm leading-6 text-slate-100">{code}</pre>
    </div>
  );
}

function RoleRow({ email, role, purpose }: { email: string; role: string; purpose: string }) {
  return <tr><td className="px-3 py-3 font-mono text-xs">{email}</td><td className="px-3 py-3">{role}</td><td className="px-3 py-3 text-steel">{purpose}</td></tr>;
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-3"><span className="grid h-8 w-8 place-items-center rounded border border-mint/40 font-mono text-sm text-mint">{number}</span><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-steel">{children}</p></div></li>;
}

function Mode({ title, description }: { title: string; description: string }) {
  return <div className="border-t border-mint pt-3"><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-steel">{description}</p></div>;
}

function Feature({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return <div className="border-t border-line pt-4"><Icon className="h-4 w-4 text-mint" /><h3 className="mt-2 font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-steel">{children}</p></div>;
}
