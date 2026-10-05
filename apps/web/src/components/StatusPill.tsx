import clsx from "clsx";

type Tone = "neutral" | "good" | "warn" | "danger";

export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-line bg-panel text-steel",
        tone === "good" && "border-mint/40 bg-mint/10 text-mint",
        tone === "warn" && "border-amber/40 bg-amber/10 text-amber",
        tone === "danger" && "border-coral/40 bg-coral/10 text-coral"
      )}
    >
      {children}
    </span>
  );
}
