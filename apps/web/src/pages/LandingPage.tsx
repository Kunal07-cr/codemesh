import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronDown,
  Code2,
  FileArchive,
  GitBranch,
  GitPullRequest,
  Network,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import { ZIP_UPLOAD_LIMIT_MB } from "@codemesh/shared";
import { AuthPanel } from "../components/AuthPanel";
import { InteractiveCodeGraph } from "../components/InteractiveCodeGraph";
import { LivingUniverse } from "../components/LivingUniverse";
import { EfficiencyCalculator, PlatformFoundations, RetrievalStudio } from "../components/RepositoryExperienceLab";

const capabilities = [
  { icon: Network, title: "Source-linked graph", body: "Navigate files, symbols, imports, calls, and impact paths as one connected system.", tone: "cm-tone-cyan" },
  { icon: Bot, title: "Grounded assistant", body: "Ask repository questions and inspect citations that point back to exact source ranges.", tone: "cm-tone-rose" },
  { icon: UsersRound, title: "Live collaboration", body: "Share focused workspaces with presence, conversation, tasks, and role-aware access.", tone: "cm-tone-violet" },
  { icon: GitPullRequest, title: "Review-first changes", body: "Turn AI suggestions and team edits into inspectable contribution work before publishing.", tone: "cm-tone-coral" },
  { icon: Braces, title: "Repository intelligence", body: "Inspect health, hotspots, architecture policy, security flows, dependencies, and test plans.", tone: "cm-tone-mint" },
  { icon: FileArchive, title: "Flexible imports", body: `Start from a public GitHub repository or a ZIP archive up to ${ZIP_UPLOAD_LIMIT_MB} MB.`, tone: "cm-tone-amber" }
];

const workflow = [
  { number: "01", icon: FileArchive, title: "Bring the repository", body: "Import a public GitHub branch, upload a ZIP, or open the seeded TaskPilot project." },
  { number: "02", icon: Network, title: "Build the mesh", body: "CodeMesh indexes files and symbols, then resolves calls, imports, and containment links." },
  { number: "03", icon: Sparkles, title: "Investigate with context", body: "Explore the graph, trace impact, or ask the assistant with source-linked evidence." },
  { number: "04", icon: ShieldCheck, title: "Change with confidence", body: "Edit together, validate proposed patches, assign work, and keep an auditable review trail." }
];

const questions = [
  { question: "Does CodeMesh replace the editor?", answer: "No. It adds repository structure, team context, retrieval, and review around a full code workspace so the editor has better context." },
  { question: "Can the assistant change repository code?", answer: "It can investigate and propose edits. Changes remain visible for review, permissions, and verification before they become contribution work." },
  { question: "Can I import my own project?", answer: `Yes. Owners can connect a public GitHub repository or upload a ZIP archive up to ${ZIP_UPLOAD_LIMIT_MB} MB. The index and assistant context rebuild after import.` },
  { question: "How are answers grounded?", answer: "Repository retrieval combines text relevance with graph relationships. Every answer can carry citations to files, symbols, ranges, and the indexed revision." }
];

export function LandingPage() {
  const [openQuestion, setOpenQuestion] = useState(0);

  return (
    <div className="cm-landing">
      <section className="cm-landing-hero">
        <LivingUniverse />
        <div className="cm-hero-content mx-auto max-w-7xl px-4 pb-14 pt-14 md:pb-20 md:pt-20">
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Enter the living codebase</div>
          <div className="mt-5 max-w-4xl">
            <h1 className="cm-brand-title text-5xl font-bold leading-none text-white md:text-7xl">CodeMesh</h1>
            <p className="mt-5 max-w-3xl text-3xl font-semibold leading-tight text-white md:text-5xl">
              Your codebase isn&apos;t a folder tree. <span className="text-steel">It&apos;s a living system.</span>
            </p>
            <p className="mt-6 max-w-3xl text-base leading-7 text-steel md:text-lg">
              CodeMesh transforms complex repositories into an interactive visual map powered by AI, helping developers understand architecture, dependencies, complexity, and code evolution at a glance.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link className="action-primary" to="/discover">Explore your codebase <ArrowRight className="h-4 w-4" /></Link>
            <a className="action-secondary" href="#how-it-works">See how it works <ArrowDown className="h-4 w-4" /></a>
          </div>
          <div className="cm-short-answer mt-10" data-reveal>
            <div className="cm-short-answer-icon"><Code2 className="h-5 w-5" /></div>
            <div>
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-cyan">The short answer</div>
              <p className="mt-2 max-w-5xl text-base font-medium leading-7 text-slate-200 md:text-lg">
                A repository becomes a navigable digital ecosystem: modules form cores, dependencies carry energy, risk changes the atmosphere, and grounded AI follows the same paths you can inspect.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="cm-proof-strip border-y border-line" aria-label="TaskPilot sample metrics">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 md:grid-cols-4">
          <Metric value="9" label="Indexed files" tone="text-cyan" />
          <Metric value="45" label="Graph links" tone="text-violet" />
          <Metric value="4" label="Collaboration roles" tone="text-rose" />
          <Metric value={`${ZIP_UPLOAD_LIMIT_MB} MB`} label="ZIP import ceiling" tone="text-amber" />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-[210px_minmax(0,1fr)] lg:py-16">
        <aside className="hidden lg:block">
          <nav className="cm-page-index sticky top-24" aria-label="On this page">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-steel">On this page</div>
            <a href="#repository-model">Repository model</a>
            <a href="#retrieval-lab">Retrieval lab</a>
            <a href="#how-it-works">How it works</a>
            <a href="#efficiency">Context efficiency</a>
            <a href="#platform">Platform foundations</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#questions">Common questions</a>
            <a href="#account">Start exploring</a>
          </nav>
        </aside>

        <div className="min-w-0 space-y-20">
          <section id="repository-model" className="scroll-mt-24">
            <SectionHeading
              eyebrow="Repository model"
              title="See architecture as a living system"
              body="Files are only one layer. CodeMesh exposes the relationships between symbols, services, permissions, work, and proposed changes so you can investigate from the system level down to a source range."
            />
            <div className="mt-8"><InteractiveCodeGraph /></div>
          </section>

          <section id="retrieval-lab" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Context retrieval lab"
              title="Ask once. See exactly how the answer was assembled."
              body="Compare a broad repository crawl with a graph-guided path, then inspect the source-linked answer produced from the focused context."
            />
            <div className="mt-8"><RetrievalStudio /></div>
          </section>

          <section id="how-it-works" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="How it works"
              title="From repository to reviewed change"
              body="The workflow keeps discovery, reasoning, collaboration, and verification connected instead of scattering them across unrelated tools."
            />
            <div className="cm-workflow mt-9 grid gap-0 md:grid-cols-4">
              {workflow.map((step, index) => (
                <div key={step.number} className="cm-workflow-step" data-reveal>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-steel">{step.number}</span>
                    <step.icon className="h-5 w-5 text-mint" />
                  </div>
                  <h3 className="mt-7 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-steel">{step.body}</p>
                  {index < workflow.length - 1 && <ArrowRight className="cm-workflow-arrow h-4 w-4" aria-hidden="true" />}
                </div>
              ))}
            </div>
          </section>

          <section id="efficiency" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Context efficiency"
              title="Model the cost of repository understanding"
              body="Explore how question volume and file breadth affect context size. The simulator makes its assumptions visible so the result is useful without pretending to be a universal benchmark."
            />
            <div className="mt-8"><EfficiencyCalculator /></div>
          </section>

          <section id="platform" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Platform foundations"
              title="A complete path from source intake to trusted action"
              body="The interface, indexing pipeline, permissions, and setup journey expose what is happening instead of hiding important engineering state behind a decorative dashboard."
            />
            <div className="mt-8"><PlatformFoundations /></div>
          </section>

          <section id="capabilities" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Connected capabilities"
              title="One surface for understanding and delivery"
              body="Each capability shares the same repository identity, permissions, source revision, and graph context."
            />
            <div className="cm-stagger mt-9 grid gap-3 md:grid-cols-2">
              {capabilities.map((capability) => (
                <article key={capability.title} className={`surface-panel cm-accent-card ${capability.tone} p-5`} data-reveal>
                  <capability.icon className="cm-icon-motion h-5 w-5" />
                  <h3 className="mt-5 text-base font-semibold text-white">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-steel">{capability.body}</p>
                </article>
              ))}
            </div>
            <div className="cm-data-note mt-5" data-reveal>
              <ShieldCheck className="h-5 w-5 shrink-0 text-mint" />
              <div>
                <h3 className="font-semibold text-white">Review and permissions stay in the loop</h3>
                <p className="mt-1 text-sm leading-6 text-steel">Owner, maintainer, contributor, and viewer roles gate project management, edits, reviews, discussions, AI queries, and publishing actions.</p>
              </div>
            </div>
          </section>

          <section id="questions" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Common questions"
              title="A clearer way to work with a codebase"
              body="The important boundaries are explicit, so the platform is easier to explain in a demo and safer to use in a team."
            />
            <div className="mt-8 divide-y divide-line border-y border-line">
              {questions.map((item, index) => {
                const open = openQuestion === index;
                return (
                  <div key={item.question} className="cm-faq-item">
                    <button type="button" aria-expanded={open} onClick={() => setOpenQuestion(open ? -1 : index)}>
                      <span>{item.question}</span>
                      <ChevronDown className={`h-4 w-4 ${open ? "rotate-180" : ""}`} />
                    </button>
                    <div className={`cm-faq-answer ${open ? "is-open" : ""}`}>
                      <p>{item.answer}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="account" className="scroll-mt-24 border-t border-line pt-12" data-reveal>
            <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
              <div className="max-w-2xl">
                <div className="eyebrow"><Activity className="h-3.5 w-3.5" /> Start exploring</div>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-4xl">Put the graph beside the code.</h2>
                <p className="mt-4 text-base leading-7 text-steel">Create a CodeMesh account or use a demo identity, then open TaskPilot to explore the graph, ask the assistant, and inspect the full collaborative workflow.</p>
                <div className="mt-7 space-y-3 text-sm text-slate-200">
                  <Benefit>New accounts receive viewer access to the sample repository.</Benefit>
                  <Benefit>Assistant answers include repository citations.</Benefit>
                  <Benefit>Every protected action is checked against project permissions.</Benefit>
                </div>
              </div>
              <AuthPanel />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="cm-metric">
      <strong className={tone}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl" data-reveal>
      <div className="eyebrow"><GitBranch className="h-3.5 w-3.5" /> {eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-steel">{body}</p>
    </div>
  );
}

function Benefit({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-mint/35 bg-mint/10"><Check className="h-3 w-3 text-mint" /></span>
      <span>{children}</span>
    </div>
  );
}
