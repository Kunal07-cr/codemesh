import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { ZIP_UPLOAD_LIMIT_MB } from "@codemesh/shared";
import { AuthPanel } from "../components/AuthPanel";
import { InteractiveCodeGraph } from "../components/InteractiveCodeGraph";
import { LivingUniverse } from "../components/LivingUniverse";
import { PlatformFoundations, RetrievalStudio } from "../components/RepositoryExperienceLab";
import {
  ConsolePreview,
  FeatureTiles,
  HeroTokenCard,
  InstallSteps,
  IntegrationStrip,
  QueryDemo,
  SavingsCalculator,
  SecurityPanel,
  StepTrace
} from "../components/landing/LandingSections";

const questions = [
  { question: "Does CodeMesh replace the editor?", answer: "No. It adds repository structure, team context, retrieval, and review around a full code workspace so the editor has better context." },
  { question: "Can the assistant change repository code?", answer: "It can investigate and propose edits. Changes remain visible for review, permissions, and verification before they become contribution work." },
  { question: "Can I import my own project?", answer: `Yes. Owners can connect a public GitHub repository or upload a ZIP archive up to ${ZIP_UPLOAD_LIMIT_MB} MB. The index and assistant context rebuild after import.` },
  { question: "How are answers grounded?", answer: "Repository retrieval combines text relevance with graph relationships. Every answer can carry citations to files, symbols, ranges, and the indexed revision." },
  { question: "Are the savings numbers guaranteed?", answer: "No. The token comparison and the calculator are illustrative models with visible assumptions. Real savings depend on your repository size, question mix and agent behavior." }
];

export function LandingPage() {
  const [openQuestion, setOpenQuestion] = useState(0);

  return (
    <div className="cm-landing lp-page">
      {/* Hero */}
      <section className="cm-landing-hero lp-hero">
        <LivingUniverse />
        <div className="cm-hero-content lp-hero-grid mx-auto max-w-7xl px-4 pb-14 pt-14 md:pb-20 md:pt-20">
          <div>
            <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Your codebase as a knowledge graph</div>
            <h1 className="lp-hero-title">
              Give your AI the <span>exact lines</span>, not the whole repository.
            </h1>
            <p className="lp-hero-sub">
              Agents burn tokens opening file after file to answer one question. CodeMesh indexes your repository into a
              graph of files, symbols and calls, then hands back the few spans that answer it, with citations.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link className="action-primary" to="/discover">Explore a codebase <ArrowRight className="h-4 w-4" /></Link>
              <a className="action-secondary" href="#demo">Try the live demo <ArrowDown className="h-4 w-4" /></a>
            </div>
            <ul className="lp-hero-notes">
              <li><Check className="h-3.5 w-3.5" /> Seeded sample project</li>
              <li><Check className="h-3.5 w-3.5" /> Import GitHub or ZIP</li>
              <li><Check className="h-3.5 w-3.5" /> Source-linked answers</li>
            </ul>
          </div>
          <HeroTokenCard />
        </div>
      </section>

      <IntegrationStrip />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-[210px_minmax(0,1fr)] lg:py-16">
        <aside className="hidden lg:block">
          <nav className="cm-page-index sticky top-24" aria-label="On this page">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-steel">On this page</div>
            <a href="#problem">The problem</a>
            <a href="#demo">Live demo</a>
            <a href="#repository-model">Repository model</a>
            <a href="#retrieval-lab">Retrieval lab</a>
            <a href="#calculator">Savings calculator</a>
            <a href="#how-it-works">Get started</a>
            <a href="#console">Console</a>
            <a href="#platform">Platform</a>
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#questions">Questions</a>
            <a href="#account">Start exploring</a>
          </nav>
        </aside>

        <div className="min-w-0 space-y-24">
          <section id="problem" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="The same question, side by side"
              title="Fewer steps to the answer. Far fewer tokens."
              body="A crawling agent searches, opens, scrolls and repeats. A graph walk resolves the implementation and its callers in one query."
            />
            <div className="mt-8"><StepTrace /></div>
          </section>

          <section id="demo" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Ask the graph"
              title="An answer from your code, not from training data"
              body="Pick a question and watch the spans come back with file, line and relevance. This demo runs on a bundled sample repository."
            />
            <div className="mt-8"><QueryDemo /></div>
          </section>

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

          <section id="calculator" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Estimate your own saving"
              title="Move the sliders, see what you could save"
              body="Model a team workload with assumptions you control. Only the share of spend that goes to loading repository context is counted."
            />
            <div className="mt-8"><SavingsCalculator /></div>
          </section>

          <section id="how-it-works" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Install to first answer"
              title="Up and running in three steps"
              body="Pick the setup that matches how you work. Every command has a copy button."
            />
            <div className="mt-8"><InstallSteps /></div>
          </section>

          <section id="console" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="The console, screen by screen"
              title="See what is synced and who can read it"
              body="Repository health, graph size and connected agents in one place. Pick a screen to preview it."
            />
            <div className="mt-8"><ConsolePreview /></div>
          </section>

          <section id="platform" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Platform foundations"
              title="A complete path from source intake to trusted action"
              body="The interface, indexing pipeline, permissions, and setup journey expose what is happening instead of hiding important engineering state behind a decorative dashboard."
            />
            <div className="mt-8"><PlatformFoundations /></div>
          </section>

          <section id="features" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Built for real repositories"
              title="Every feature exists to make context smaller and better"
              body="Each capability shares the same repository identity, permissions, source revision, and graph context."
            />
            <div className="mt-8"><FeatureTiles /></div>
          </section>

          <section id="security" className="scroll-mt-24" data-reveal>
            <SectionHeading
              eyebrow="Security"
              title="Smarter context without giving up control"
              body="Owner, maintainer, contributor, and viewer roles gate project management, edits, reviews, discussions, AI queries, and publishing actions."
            />
            <div className="mt-8"><SecurityPanel /></div>
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
                <div className="eyebrow">Start exploring</div>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-4xl">Stop paying your AI to read code it doesn&apos;t need.</h2>
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

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl" data-reveal>
      <div className="eyebrow">{eyebrow}</div>
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

