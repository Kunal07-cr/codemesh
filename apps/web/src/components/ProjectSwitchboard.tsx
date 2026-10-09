import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Activity, ArrowRight, Bookmark, BookmarkCheck, Bot, Check, Code2, Download, FlaskConical, Gauge, GitBranch, History, Layers, MessageSquare, Orbit, Pencil, Rocket, Settings, Trash2, X } from "lucide-react";
import type { Permission, Project } from "@codemesh/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { exportTrail, parseTrail, recordTrailVisit, trailLocation, type TrailWaypoint } from "../lib/investigationTrail";

const destinations = [
  { path: "", label: "Overview", icon: Layers, tone: "mint" },
  { path: "workspace", label: "Files", icon: Code2, tone: "cyan" },
  { path: "universe", label: "Graph", icon: Orbit, tone: "cyan" },
  { path: "assistant", label: "Assistant", icon: Bot, tone: "violet" },
  { path: "intelligence", label: "Intelligence", icon: Activity, tone: "rose" },
  { path: "labs", label: "Labs", icon: FlaskConical, tone: "amber" },
  { path: "control-room", label: "Control room", icon: Gauge, tone: "coral" },
  { path: "delivery", label: "Delivery", icon: Rocket, tone: "rose" },
  { path: "advanced", label: "Advanced", icon: Orbit, tone: "violet" },
  { path: "tasks", label: "Tasks", icon: GitBranch, tone: "amber" },
  { path: "discussions", label: "Discussions", icon: MessageSquare, tone: "cyan" },
  { path: "contributions", label: "Contributions", icon: GitBranch, tone: "coral" },
  { path: "settings", label: "Settings", icon: Settings, tone: "mint" }
];

export function ProjectSwitchboard({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const details = useQuery({ queryKey: ["project", projectId], queryFn: () => api<{ project: Project; permissions: Permission[] }>(`/api/projects/${encodeURIComponent(projectId)}`) });
  if (details.isError) return null;
  if (!details.data) return <div className="cm-switchboard cm-switchboard-loading" aria-label="Loading project navigation"><span /></div>;
  return <Switchboard key={`${projectId}:${user?.id ?? "guest"}`} projectId={projectId} name={details.data.project.name} identity={user?.id ?? "guest"} manage={details.data.permissions.includes("project.manage")} />;
}

function Switchboard({ projectId, name, identity, manage }: { projectId: string; name: string; identity: string; manage: boolean }) {
  const location = useLocation();
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const current = trailLocation(projectId, location.pathname + location.search);
  const storageKey = `codemesh-investigation:${identity}:${projectId}`;
  const [trail, setTrail] = useState<TrailWaypoint[]>(() => {
    try { return parseTrail(projectId, localStorage.getItem(storageKey)); } catch { return []; }
  });
  const [storageError, setStorageError] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const nav = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const pinned = trail.find((item) => item.href === current?.href)?.pinned ?? false;

  useEffect(() => { setTrail((items) => recordTrailVisit(items, projectId, location.pathname + location.search)); }, [projectId, location.pathname, location.search]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(trail)); setStorageError(false); } catch { setStorageError(true); }
  }, [storageKey, trail]);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previous; dialog.current?.close(); };
    }
    dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && nav.current) nav.current.scrollTo({ left: active.offsetLeft - nav.current.offsetLeft - 24, behavior: "auto" });
  }, [location.pathname]);

  function pin(href: string) { setTrail((items) => items.map((item) => item.href === href ? { ...item, pinned: !item.pinned } : item)); }
  function close() { setOpen(false); toggle.current?.focus(); }
  function download() {
    const url = URL.createObjectURL(new Blob([exportTrail(name, trail)], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9]+/gi, "-")}-investigation.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <div className="cm-switchboard">
      <Link className="cm-switchboard-project" title={name} to={base}><Layers size={16} /><span>{name}</span></Link>
      <nav ref={nav} className="cm-switchboard-links cm-scrollbar" aria-label="Project navigation">
        {[...destinations, ...(manage ? [{ path: "operations", label: "Production", icon: Gauge, tone: "cyan" }] : [])].map((item) => {
          const active = location.pathname === `${base}${item.path ? `/${item.path}` : ""}`;
          return <Link key={item.path} to={`${base}${item.path ? `/${item.path}` : ""}`} aria-current={active ? "page" : undefined} data-tone={item.tone}><item.icon size={15} /><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="cm-switchboard-actions">
        <button className={pinned ? "is-pinned" : ""} type="button" title={pinned ? "Unpin current location" : "Pin current location"} aria-label={pinned ? "Unpin current location" : "Pin current location"} aria-pressed={pinned} disabled={!current} onClick={() => current && pin(current.href)}>{pinned ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
        <button ref={toggle} type="button" title="Investigation Trail" aria-label="Open Investigation Trail" aria-haspopup="dialog" onClick={() => setOpen(true)}><History size={17} /><span className="cm-trail-count">{trail.length}</span></button>
      </div>
    </div>
    <dialog ref={dialog} className="cm-trail-dialog" aria-labelledby="cm-trail-heading" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="cm-trail-content">
        <header><div><div className="eyebrow"><History size={14} /> Local investigation</div><h2 id="cm-trail-heading">Investigation Trail</h2><p>{name}</p></div><button className="cm-tool-button" type="button" aria-label="Close Investigation Trail" title="Close" onClick={close}><X size={18} /></button></header>
        <div className="cm-trail-toolbar"><div role="group" aria-label="Filter investigation"><button type="button" aria-pressed={!pinnedOnly} onClick={() => setPinnedOnly(false)}>Recent <span>{trail.length}</span></button><button type="button" aria-pressed={pinnedOnly} onClick={() => setPinnedOnly(true)}>Pinned <span>{trail.filter((item) => item.pinned).length}</span></button></div><button className="cm-tool-button" type="button" title="Export investigation notes" aria-label="Export investigation notes" disabled={!trail.length} onClick={download}><Download size={17} /></button></div>
        {storageError && <p className="cm-trail-storage-error" role="status">Browser storage is unavailable. Export notes before leaving.</p>}
        <ol className="cm-trail-list">
          {trail.filter((item) => !pinnedOnly || item.pinned).map((item) => <li key={item.href} className={item.href === current?.href ? "is-current" : ""}>
            <div className="cm-trail-waypoint"><Link to={item.href} onClick={close}><strong>{item.label}</strong><small>{item.source || new Date(item.visitedAt).toLocaleString()}{item.source && new URLSearchParams(item.href.split("?")[1]).get("line") ? `:${new URLSearchParams(item.href.split("?")[1]).get("line")}` : ""}</small></Link><button className="cm-tool-button" type="button" title={item.pinned ? "Unpin location" : "Pin location"} aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.label}`} aria-pressed={item.pinned} onClick={() => pin(item.href)}>{item.pinned ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button><button className="cm-tool-button" type="button" title="Edit note" aria-label={`Edit note for ${item.label}`} onClick={() => { setEditing(item.href); setNote(item.note); }}><Pencil size={16} /></button><button className="cm-tool-button" type="button" title="Remove from trail" aria-label={`Remove ${item.label} from trail`} onClick={() => setTrail((items) => items.filter((entry) => entry.href !== item.href))}><Trash2 size={16} /></button></div>
            {editing === item.href ? <form className="cm-trail-note-form" onSubmit={(event) => { event.preventDefault(); setTrail((items) => items.map((entry) => entry.href === item.href ? { ...entry, note: note.trim() } : entry)); setEditing(null); }}><label>Investigation note<textarea autoFocus className="field" maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label><div><button className="action-secondary" type="button" onClick={() => setEditing(null)}><X size={14} /> Cancel</button><button className="action-primary" type="submit"><Check size={14} /> Save note</button></div></form> : item.note ? <p className="cm-trail-note">{item.note}</p> : null}
          </li>)}
        </ol>
        {!trail.filter((item) => !pinnedOnly || item.pinned).length && <div className="cm-trail-empty"><Bookmark size={26} /><p>{pinnedOnly ? "No pinned locations" : "No recent locations"}</p></div>}
        <footer><span>Saved in this browser</span><Link to={`${base}/labs?lab=invariants`} onClick={close}>Invariant Ledger <ArrowRight size={14} /></Link></footer>
      </div>
    </dialog>
  </>;
}
