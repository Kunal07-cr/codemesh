import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Check, Circle, CircleCheck, Download, FileCode2, GraduationCap, RotateCcw, Sparkles, Target, X } from "lucide-react";
import type { GraphNode } from "@codemesh/shared";
import { buildChallengeDeck, exportChallengeNotes, type ChallengeCategory, type ChallengeContract, type RepositoryChallenge } from "../lib/repositoryChallenges";

type RoomProps = { project: { id: string; name: string; commitSha: string }; nodes: GraphNode[]; contracts: ChallengeContract[] };
const categoryLabels: Record<ChallengeCategory, string> = { symbols: "Symbol locations", ranges: "Source ranges", contracts: "Code contracts" };

export function RepositoryChallengeRoom(props: RoomProps) {
  const [category, setCategory] = useState<ChallengeCategory | "all">("all");
  const [round, setRound] = useState(0);
  const deck = useMemo(() => buildChallengeDeck(props.nodes, props.contracts, props.project.commitSha + ":" + round), [props.nodes, props.contracts, props.project.commitSha, round]);
  const filtered = category === "all" ? deck : deck.filter((item) => item.category === category);
  return <section className="cm-challenge-room">
    <header className="cm-challenge-header">
      <div><div className="eyebrow"><GraduationCap className="h-3.5 w-3.5" /> Repository practice</div><h2>Repository Challenge Room</h2><p>Indexed evidence only. Practice scores are separate from runtime correctness.</p></div>
      <div className="cm-challenge-settings"><label>Question set<select className="field" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="all">Mixed practice</option>{Object.entries(categoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="cm-tool-button" type="button" title="Start a new practice round" aria-label="Start a new practice round" onClick={() => setRound((value) => value + 1)}><RotateCcw className="h-4 w-4" /></button></div>
    </header>
    {filtered.length ? <ChallengeSession key={`${props.project.id}:${props.project.commitSha}:${category}:${round}`} project={props.project} deck={filtered} restart={() => setRound((value) => value + 1)} /> : <div className="cm-challenge-empty"><BookOpen className="h-7 w-7 text-cyan" /><h3>No unambiguous questions in this set</h3><p>This set needs indexed declarations and enough distinct answer choices.</p><Link className="action-secondary" to={`/projects/${props.project.id}/workspace`}><FileCode2 className="h-4 w-4" /> Open source</Link></div>}
  </section>;
}

function ChallengeSession({ project, deck, restart }: { project: RoomProps["project"]; deck: RepositoryChallenge[]; restart(): void }) {
  const [sequence, setSequence] = useState(deck);
  const [position, setPosition] = useState(0);
  const [selection, setSelection] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(false);
  const [review, setReview] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const previousQuestion = useRef(sequence[0]?.id);
  const challenge = sequence[position]!;
  const submitted = answers[challenge.id];
  const correct = submitted === challenge.answer;
  const answeredCount = sequence.filter((item) => Boolean(answers[item.id])).length;
  const correctCount = sequence.filter((item) => answers[item.id] === item.answer).length;
  const missed = sequence.filter((item) => answers[item.id] && answers[item.id] !== item.answer);

  useEffect(() => {
    if (previousQuestion.current !== challenge.id) heading.current?.focus();
    previousQuestion.current = challenge.id;
  }, [challenge.id]);

  function navigate(next: number) { setPosition(next); setSelection(""); setComplete(false); }
  function submit() {
    if (!selection || submitted) return;
    setAnswers((value) => ({ ...value, [challenge.id]: selection }));
    requestAnimationFrame(() => feedback.current?.focus());
  }
  function next() { if (position === sequence.length - 1) setComplete(true); else navigate(position + 1); }
  function retryMissed() { setSequence(missed); setAnswers({}); setPosition(0); setSelection(""); setComplete(false); setReview(true); }
  function download() {
    const url = URL.createObjectURL(new Blob([exportChallengeNotes(project.name, project.commitSha, sequence, answers)], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "codemesh-challenge-notes.md";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <div className="cm-challenge-progress"><div><span>{review ? "Missed-question round" : "Practice round"}</span><strong>{answeredCount} / {sequence.length} answered</strong></div><progress aria-label="Practice progress" value={answeredCount} max={sequence.length} /></div>
    <div className="cm-challenge-layout">
      <div className="cm-challenge-workbench">
        {complete ? <div className="cm-challenge-recap" role="status"><CircleCheck className="h-10 w-10 text-mint" /><div className="eyebrow">Round complete</div><h3>{correctCount} of {sequence.length} correct</h3><p>{missed.length ? `${missed.length} source locations need another look.` : "Every answer in this round matches the index."}</p><div className="cm-challenge-recap-actions">{missed.length > 0 && <button className="action-primary" type="button" onClick={retryMissed}><RotateCcw className="h-4 w-4" /> Retry missed</button>}<button className="action-secondary" type="button" onClick={restart}><Sparkles className="h-4 w-4" /> New round</button><button className="action-secondary" type="button" onClick={download}><Download className="h-4 w-4" /> Study notes</button></div></div> : <>
          <div className="cm-challenge-question" key={challenge.id}><div className="cm-challenge-kicker"><span>{categoryLabels[challenge.category]}</span><span>{String(position + 1).padStart(2, "0")} / {sequence.length}</span></div><h3 ref={heading} tabIndex={-1}>{challenge.question}</h3>
            <fieldset className="cm-challenge-choices"><legend className="sr-only">Choose an answer</legend>{challenge.choices.map((choice, index) => {
              const isSelected = (submitted || selection) === choice;
              const isAnswer = Boolean(submitted) && choice === challenge.answer;
              const isWrong = Boolean(submitted) && isSelected && !isAnswer;
              return <label key={choice} className={`cm-challenge-choice ${isSelected ? "is-selected" : ""} ${isAnswer ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}><input className="sr-only" type="radio" name={`challenge-${challenge.id}`} value={choice} checked={isSelected} disabled={Boolean(submitted)} onChange={() => setSelection(choice)} /><span className="cm-challenge-letter">{String.fromCharCode(65 + index)}</span><span className="cm-challenge-choice-text">{choice}</span>{isAnswer ? <Check className="h-4 w-4" /> : isWrong ? <X className="h-4 w-4" /> : isSelected ? <CircleCheck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</label>;
            })}</fieldset>
          </div>
          {submitted && <div className={`cm-challenge-feedback ${correct ? "is-correct" : "is-wrong"}`} ref={feedback} tabIndex={-1} role="status"><strong>{correct ? "Matches the index" : "Source evidence differs"}</strong><p>{challenge.explanation}</p><Link className="cm-challenge-source" to={`/projects/${project.id}/workspace?path=${encodeURIComponent(challenge.source.filePath)}&line=${challenge.source.line}`}><FileCode2 className="h-4 w-4" /><span>{challenge.source.filePath}:{challenge.source.line}</span><ArrowRight className="h-4 w-4" /></Link>{challenge.source.excerpt && <pre><code>{challenge.source.excerpt}</code></pre>}<Link className="cm-challenge-discuss" to={`/projects/${project.id}/assistant?path=${encodeURIComponent(challenge.source.filePath)}&prompt=${encodeURIComponent(`Explain the indexed declaration at ${challenge.source.filePath}:${challenge.source.line} and how it fits into this repository. Cite the source and distinguish inferred behavior from verified behavior.`)}`}><Sparkles className="h-3.5 w-3.5" /> Discuss with assistant</Link></div>}
          <div className="cm-challenge-footer"><button className="cm-tool-button" type="button" title="Previous question" aria-label="Previous question" disabled={position === 0} onClick={() => navigate(position - 1)}><ArrowLeft className="h-4 w-4" /></button>{submitted ? <button className="action-primary" type="button" onClick={next}>{position === sequence.length - 1 ? "Finish round" : "Next question"}<ArrowRight className="h-4 w-4" /></button> : <button className="action-primary" type="button" disabled={!selection} onClick={submit}><Check className="h-4 w-4" /> Check answer</button>}</div>
        </>}
      </div>
      <aside className="cm-challenge-map"><div className="eyebrow"><Target className="h-3.5 w-3.5" /> Question map</div><div className="cm-challenge-score"><strong>{correctCount}</strong><span>correct / {answeredCount} checked</span></div><div className="cm-challenge-dots" role="group" aria-label="Question navigation">{sequence.map((item, index) => <button key={item.id} type="button" title={`Question ${index + 1}: ${categoryLabels[item.category]}`} aria-label={`Question ${index + 1}${answers[item.id] ? answers[item.id] === item.answer ? ", correct" : ", needs review" : ", not answered"}`} aria-current={!complete && position === index ? "step" : undefined} disabled={index > position && !answers[item.id]} data-result={answers[item.id] ? answers[item.id] === item.answer ? "correct" : "wrong" : "pending"} onClick={() => navigate(index)}>{String(index + 1).padStart(2, "0")}</button>)}</div><div className="cm-challenge-map-legend"><span><Check className="h-3 w-3 text-mint" />Correct</span><span><X className="h-3 w-3 text-coral" />Review</span></div><p className="cm-challenge-revision">Revision <code>{project.commitSha}</code></p><button className="cm-challenge-export" type="button" onClick={download}><Download className="h-4 w-4" /> Download study notes</button></aside>
    </div>
  </>;
}
