import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, Pin, PinOff } from "lucide-react";
import { buildFileTree, type FileTreeEntry } from "../lib/workspaceNavigation";

export function WorkspaceFileTree({ paths, selectedPath, filtered, onSelect }: { paths: string[]; selectedPath: string; filtered: boolean; onSelect(path: string): void }) {
  const tree = useMemo(() => buildFileTree(paths), [paths]);
  return <nav aria-label="Repository files" className="cm-file-tree">{tree.map((entry) => <TreeItem key={entry.path} entry={entry} selectedPath={selectedPath} filtered={filtered} onSelect={onSelect} depth={0} />)}</nav>;
}

function TreeItem({ entry, selectedPath, filtered, onSelect, depth }: { entry: FileTreeEntry; selectedPath: string; filtered: boolean; onSelect(path: string): void; depth: number }) {
  const [open, setOpen] = useState(depth < 1 || selectedPath.startsWith(entry.path + "/"));
  if (!entry.children) return <button type="button" className={selectedPath === entry.path ? "is-selected" : ""} title={entry.path} aria-current={selectedPath === entry.path ? "page" : undefined} style={{ paddingLeft: Math.min(depth, 6) * 12 + 8 }} onClick={() => onSelect(entry.path)}><FileCode2 size={13} /><span>{entry.name}</span></button>;
  const expanded = filtered || open;
  return <div><button type="button" aria-expanded={expanded} title={entry.path} style={{ paddingLeft: Math.min(depth, 6) * 12 + 8 }} onClick={() => setOpen(!open)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={13} /><span>{entry.name}</span></button>{expanded && entry.children.map((child) => <TreeItem key={child.path} entry={child} selectedPath={selectedPath} filtered={filtered} onSelect={onSelect} depth={depth + 1} />)}</div>;
}

export function WorkspaceTabs({ path, paths, pinned, onSelect, onPin, onFilter }: { path: string; paths: string[]; pinned: string[]; onSelect(path: string): void; onPin(path: string): void; onFilter(prefix: string): void }) {
  const tabs = [...new Set([...pinned, path, ...paths])].filter((candidate) => paths.includes(candidate)).slice(0, Math.max(pinned.length + 1, 6));
  const parts = path.split("/");
  return <>
    <nav className="cm-source-tabs" aria-label="Open files">{tabs.map((candidate) => <div key={candidate} className={candidate === path ? "is-selected" : ""}><button type="button" title={candidate} aria-current={candidate === path ? "page" : undefined} onClick={() => onSelect(candidate)}><FileCode2 size={13} /><span>{candidate.split("/").at(-1)}</span></button><button type="button" title={pinned.includes(candidate) ? "Unpin file" : "Pin file"} aria-label={`${pinned.includes(candidate) ? "Unpin" : "Pin"} ${candidate}`} aria-pressed={pinned.includes(candidate)} onClick={() => onPin(candidate)}>{pinned.includes(candidate) ? <PinOff size={12} /> : <Pin size={12} />}</button></div>)}</nav>
    <nav className="cm-source-breadcrumbs" aria-label="Source breadcrumbs">{parts.map((part, index) => <span key={index}>{index > 0 && <ChevronRight size={11} />}{index < parts.length - 1 ? <button type="button" onClick={() => onFilter(parts.slice(0, index + 1).join("/") + "/")}>{part}</button> : <span>{part}</span>}</span>)}</nav>
  </>;
}
