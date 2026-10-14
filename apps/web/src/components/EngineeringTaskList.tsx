import { useState } from "react";
import { Search } from "lucide-react";
import type { PublicEngineeringRun } from "@codemesh/shared";
import { filterEngineeringTasks } from "../lib/engineeringTasks";

const statuses: PublicEngineeringRun["status"][] = ["queued", "running", "needs_input", "awaiting_review", "completed", "failed", "cancelled"];

export function EngineeringTaskList({ runs, selectedId, onSelect }: {
  runs: PublicEngineeringRun[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState<PublicEngineeringRun["status"] | "">("");
  const visible = filterEngineeringTasks(runs, search, status);
  return <aside className="studio-run-list" aria-label="Task runs">
    <div className="studio-task-filters">
      <label>Search tasks<span className="studio-task-search"><Search size={15} aria-hidden="true" /><input className="field" type="search" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} /></span></label>
      <label>Task status<select className="field" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <output aria-live="polite" aria-label="Matching task count">{visible.length} / {runs.length} tasks</output>
    </div>
    <div className="studio-task-results">{visible.map((item) => <button key={item.id} className={selectedId === item.id ? "is-selected" : ""} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>
      <strong>{item.objective}</strong><span><span className="studio-badge" data-state={item.status}>{item.status.replaceAll("_", " ")}</span>{item.attempts}/{item.maxAttempts}</span><small>{new Date(item.createdAt).toLocaleString()}</small>
    </button>)}</div>
    {!visible.length && <p className="studio-empty">{runs.length ? "No matching tasks" : "No task runs"}</p>}
  </aside>;
}
