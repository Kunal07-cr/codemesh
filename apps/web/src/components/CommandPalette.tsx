import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Command, Gauge, Home, Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const commands = [
  { label: "Home", hint: "Return to the CodeMesh overview", path: "/", icon: Home },
  { label: "Dashboard", hint: "Open your project control room", path: "/dashboard", icon: Gauge },
  { label: "Discover projects", hint: "Search public repositories", path: "/discover", icon: Search },
  { label: "Documentation", hint: "Review API and workflow notes", path: "/docs", icon: BookOpen }
];

export function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter((item) => !needle || `${item.label} ${item.hint}`.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery("");
  }, [open]);

  function run(path: string) {
    setOpen(false);
    if (path !== location.pathname) navigate(path);
  }

  return (
    <>
      <button
        className="hidden items-center gap-2 rounded border border-line px-2.5 py-1.5 text-xs text-steel transition hover:border-mint hover:text-white lg:flex"
        type="button"
        title="Open command palette"
        onClick={() => setOpen(true)}
      >
        <Command className="h-3.5 w-3.5" />
        Quick open
        <kbd className="rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[14vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="cm-page-enter w-full max-w-xl overflow-hidden rounded-lg border border-line bg-panel shadow-2xl" role="dialog" aria-modal="true" aria-label="Command palette">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-mint" />
              <input
                ref={inputRef}
                className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-steel"
                placeholder="Jump to a CodeMesh surface..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="rounded p-1.5 text-steel hover:bg-ink hover:text-white" type="button" title="Close" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.path} className="flex w-full items-center gap-3 rounded px-3 py-3 text-left transition hover:bg-ink" type="button" onClick={() => run(item.path)}>
                    <div className="grid h-8 w-8 place-items-center rounded border border-line bg-ink"><Icon className="h-4 w-4 text-mint" /></div>
                    <div className="min-w-0"><div className="text-sm font-semibold text-white">{item.label}</div><div className="truncate text-xs text-steel">{item.hint}</div></div>
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="px-3 py-8 text-center text-sm text-steel">No matching command.</div>}
            </div>
            <div className="border-t border-line px-4 py-2 text-[11px] text-steel">Press <span className="font-mono text-white">Esc</span> to close</div>
          </div>
        </div>
      )}
    </>
  );
}
