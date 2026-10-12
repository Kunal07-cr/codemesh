import { useEffect, useRef } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { X } from "lucide-react";
import "../lib/monaco";

export function WorkspaceDiff({ title, path, before, after, onClose, children }: { title: string; path: string; before: string; after: string; onClose(): void; children?: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  const language = path.endsWith(".ts") || path.endsWith(".tsx") ? "typescript" : path.endsWith(".py") ? "python" : path.endsWith(".json") ? "json" : path.endsWith(".md") ? "markdown" : "javascript";
  return <dialog ref={dialogRef} className="cm-work-diff" onCancel={(event) => { event.preventDefault(); onClose(); }} aria-label={title}>
    <header><div><strong>{title}</strong><p>{path}</p></div><button className="cm-icon-button" type="button" aria-label="Close diff" title="Close diff" onClick={onClose}><X size={16} /></button></header>
    <div className="cm-work-diff-editor"><DiffEditor height="100%" language={language} original={before} modified={after} theme="vs-dark" options={{ readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: window.matchMedia("(min-width: 768px)").matches, minimap: { enabled: false }, wordWrap: "on", fontSize: 12, renderIndicators: true }} /></div>
    <footer>{children}</footer>
  </dialog>;
}
