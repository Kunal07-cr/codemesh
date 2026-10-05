export function LoadingState({ label = "Loading content", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 ${compact ? "py-5" : "py-8"}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="cm-skeleton h-3 w-32 rounded" />
      <div className="cm-skeleton mt-4 h-9 w-72 max-w-full rounded" />
      <div className="cm-skeleton mt-3 h-4 w-[32rem] max-w-full rounded" />
      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="surface-panel p-4">
            <div className="cm-skeleton h-9 w-9 rounded" />
            <div className="cm-skeleton mt-5 h-4 w-28 rounded" />
            <div className="cm-skeleton mt-3 h-3 w-full rounded" />
            <div className="cm-skeleton mt-2 h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
