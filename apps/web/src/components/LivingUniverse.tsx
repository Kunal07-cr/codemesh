import { useRef, type CSSProperties, type PointerEvent } from "react";

type UniversePoint = {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  size: number;
  tone: "core" | "frontend" | "backend" | "database" | "ai" | "external" | "critical";
};

const points: UniversePoint[] = [
  { id: "core", label: "CodeMesh", kind: "repository core", x: 53, y: 45, size: 1.35, tone: "core" },
  { id: "web", label: "web", kind: "frontend", x: 27, y: 25, size: 1, tone: "frontend" },
  { id: "api", label: "api", kind: "backend", x: 75, y: 23, size: 1.08, tone: "backend" },
  { id: "graph", label: "graph index", kind: "architecture", x: 72, y: 59, size: 1.18, tone: "database" },
  { id: "ai", label: "Mesh AI", kind: "intelligence", x: 36, y: 67, size: 1.12, tone: "ai" },
  { id: "auth", label: "auth", kind: "critical path", x: 55, y: 18, size: 0.9, tone: "critical" },
  { id: "github", label: "GitHub", kind: "external API", x: 88, y: 43, size: 0.84, tone: "external" },
  { id: "editor", label: "workspace", kind: "collaboration", x: 15, y: 51, size: 0.92, tone: "frontend" },
  { id: "review", label: "review", kind: "change safety", x: 55, y: 79, size: 0.88, tone: "critical" }
];

const links = [
  ["core", "web"], ["core", "api"], ["core", "graph"], ["core", "ai"],
  ["core", "auth"], ["api", "github"], ["api", "graph"], ["ai", "graph"],
  ["web", "editor"], ["editor", "review"], ["ai", "review"], ["auth", "api"]
] as const;

export function LivingUniverse() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  function moveUniverse(event: PointerEvent<HTMLDivElement>) {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    root.style.setProperty("--mesh-shift-x", `${x * 18}px`);
    root.style.setProperty("--mesh-shift-y", `${y * 14}px`);
    root.style.setProperty("--mesh-light-x", `${(x + 0.5) * 100}%`);
    root.style.setProperty("--mesh-light-y", `${(y + 0.5) * 100}%`);
  }

  return (
    <div
      ref={rootRef}
      className="cm-living-universe"
      onPointerMove={moveUniverse}
      onPointerLeave={() => {
        rootRef.current?.style.setProperty("--mesh-shift-x", "0px");
        rootRef.current?.style.setProperty("--mesh-shift-y", "0px");
      }}
      aria-hidden="true"
    >
      <div className="cm-universe-stars">
        {Array.from({ length: 42 }, (_, index) => (
          <i key={index} style={{ "--star-index": index } as CSSProperties} />
        ))}
      </div>
      <div className="cm-universe-contours">
        {Array.from({ length: 4 }, (_, index) => (
          <i key={index} style={{ "--contour-index": index } as CSSProperties} />
        ))}
      </div>
      <svg className="cm-universe-links" viewBox="0 0 100 100" preserveAspectRatio="none">
        {links.map(([fromId, toId], index) => {
          const from = points.find((point) => point.id === fromId)!;
          const to = points.find((point) => point.id === toId)!;
          return (
            <g key={`${fromId}-${toId}`} style={{ "--link-index": index } as CSSProperties}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <circle r="0.42"><animateMotion dur={`${3.4 + (index % 4) * 0.7}s`} repeatCount="indefinite" path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} /></circle>
            </g>
          );
        })}
      </svg>
      <div className="cm-universe-cluster">
        {points.map((point, index) => (
          <div
            key={point.id}
            className="cm-universe-point"
            data-tone={point.tone}
            style={{
              "--point-x": `${point.x}%`,
              "--point-y": `${point.y}%`,
              "--point-scale": point.size,
              "--point-index": index
            } as CSSProperties}
          >
            <span className="cm-universe-core"><i /></span>
            <strong>{point.label}</strong>
            <small>{point.kind}</small>
          </div>
        ))}
      </div>
      <div className="cm-universe-readout"><span /> live repository model <b>45 links</b></div>
    </div>
  );
}
