import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";

type Accent = "spectrum" | "mint" | "cyan" | "violet" | "coral";
type Motion = "full" | "reduced";
type Density = "comfortable" | "compact";

type Preferences = {
  accent: Accent;
  motion: Motion;
  density: Density;
};

const STORAGE_KEY = "codemesh-appearance-v2";
const defaults: Preferences = { accent: "spectrum", motion: "full", density: "comfortable" };
const accents: Array<{ value: Accent; color: string; label: string }> = [
  { value: "spectrum", color: "linear-gradient(135deg, #64d6af 4%, #56c7e8 29%, #a78bfa 53%, #f472b6 76%, #f2b86b 100%)", label: "Prism" },
  { value: "mint", color: "#64d6af", label: "Mint" },
  { value: "cyan", color: "#56c7e8", label: "Cyan" },
  { value: "violet", color: "#a78bfa", label: "Violet" },
  { value: "coral", color: "#ef746f", label: "Coral" }
];

export function AppearancePanel() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Preferences> | null;
      return saved ? { ...defaults, ...saved } : defaults;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return defaults;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.accent = preferences.accent;
    document.documentElement.dataset.motion = preferences.motion;
    document.documentElement.dataset.density = preferences.density;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        className="cm-icon-button"
        type="button"
        title="Appearance"
        aria-label="Appearance"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <div className="cm-popover absolute right-0 top-11 z-40 w-72 p-4" role="dialog" aria-label="Appearance settings">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Appearance</h2>
            <button className="cm-icon-button h-7 w-7" type="button" title="Reset appearance" aria-label="Reset appearance" onClick={() => setPreferences(defaults)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase text-steel">Accent</div>
            <div className="mt-2 flex gap-2">
              {accents.map((accent) => (
                <button
                  key={accent.value}
                  className={`cm-accent-swatch grid h-8 w-8 place-items-center rounded-full border border-white/15 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/40 ${preferences.accent === accent.value ? "is-active" : ""}`}
                  style={{ background: accent.color }}
                  type="button"
                  title={accent.label}
                  aria-label={`${accent.label} accent`}
                  aria-pressed={preferences.accent === accent.value}
                  onClick={() => setPreferences((current) => ({ ...current, accent: accent.value }))}
                >
                  {preferences.accent === accent.value && <Check className={`h-4 w-4 ${accent.value === "spectrum" ? "text-white" : "text-ink"}`} />}
                </button>
              ))}
            </div>
          </div>
          <PreferenceGroup
            label="Motion"
            value={preferences.motion}
            options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }]}
            onChange={(motion) => setPreferences((current) => ({ ...current, motion }))}
          />
          <PreferenceGroup
            label="Density"
            value={preferences.density}
            options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
            onChange={(density) => setPreferences((current) => ({ ...current, density }))}
          />
        </div>
      )}
    </div>
  );
}

function PreferenceGroup<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase text-steel">{label}</div>
      <div className="mt-2 grid grid-cols-2 rounded border border-line bg-ink p-1">
        {options.map((option) => (
          <button
            key={option.value}
            className={`rounded px-2 py-1.5 text-xs transition ${value === option.value ? "bg-panel text-white shadow-sm" : "text-steel hover:text-white"}`}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

