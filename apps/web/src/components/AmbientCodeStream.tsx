import type { CSSProperties } from "react";

type MeshTone = "mint" | "cyan" | "violet" | "rose" | "amber" | "coral";

const meshNodes: Array<{ x: number; y: number; size: number; delay: number; tone: MeshTone }> = [
  { x: 4, y: 21, size: 7, delay: -1.4, tone: "cyan" },
  { x: 17, y: 13, size: 9, delay: -3.1, tone: "violet" },
  { x: 29, y: 28, size: 6, delay: -0.7, tone: "coral" },
  { x: 42, y: 17, size: 8, delay: -4.2, tone: "amber" },
  { x: 55, y: 32, size: 7, delay: -2.2, tone: "mint" },
  { x: 69, y: 14, size: 9, delay: -5.3, tone: "violet" },
  { x: 82, y: 29, size: 6, delay: -1.8, tone: "cyan" },
  { x: 96, y: 19, size: 8, delay: -3.8, tone: "rose" },
  { x: 9, y: 68, size: 8, delay: -4.7, tone: "mint" },
  { x: 24, y: 79, size: 6, delay: -2.6, tone: "cyan" },
  { x: 40, y: 65, size: 9, delay: -1.1, tone: "violet" },
  { x: 57, y: 81, size: 7, delay: -5.8, tone: "amber" },
  { x: 73, y: 66, size: 8, delay: -3.5, tone: "coral" },
  { x: 90, y: 78, size: 6, delay: -0.3, tone: "mint" }
];

const meshLinks: Array<{ x: number; y: number; length: number; angle: number; delay: number; duration: number; tone: MeshTone }> = [
  { x: 4, y: 21, length: 14, angle: -18, delay: -2.1, duration: 7.2, tone: "cyan" },
  { x: 17, y: 13, length: 16, angle: 32, delay: -5.4, duration: 8.4, tone: "violet" },
  { x: 29, y: 28, length: 15, angle: -24, delay: -1.3, duration: 6.8, tone: "coral" },
  { x: 42, y: 17, length: 17, angle: 29, delay: -4.8, duration: 9.1, tone: "amber" },
  { x: 55, y: 32, length: 17, angle: -31, delay: -6.2, duration: 7.7, tone: "mint" },
  { x: 69, y: 14, length: 16, angle: 34, delay: -2.9, duration: 8.8, tone: "violet" },
  { x: 82, y: 29, length: 15, angle: -24, delay: -0.8, duration: 7.4, tone: "cyan" },
  { x: 9, y: 68, length: 17, angle: 27, delay: -3.7, duration: 8.1, tone: "mint" },
  { x: 24, y: 79, length: 18, angle: -25, delay: -5.9, duration: 9.4, tone: "cyan" },
  { x: 40, y: 65, length: 19, angle: 31, delay: -2.4, duration: 7.9, tone: "violet" },
  { x: 57, y: 81, length: 18, angle: -28, delay: -4.4, duration: 8.6, tone: "amber" },
  { x: 73, y: 66, length: 19, angle: 26, delay: -1.7, duration: 7.1, tone: "coral" }
];

export function AmbientCodeStream() {
  return (
    <div className="cm-code-stream" aria-hidden="true">
      <div className="cm-dependency-mesh">
        {meshLinks.map((link, index) => (
          <span
            className="cm-mesh-link"
            data-tone={link.tone}
            key={`link-${index}`}
            style={{
              "--mesh-x": `${link.x}%`,
              "--mesh-y": `${link.y}%`,
              "--mesh-length": `${link.length}vw`,
              "--mesh-angle": `${link.angle}deg`,
              "--mesh-delay": `${link.delay}s`,
              "--mesh-duration": `${link.duration}s`
            } as CSSProperties}
          >
            <i />
          </span>
        ))}
        {meshNodes.map((node, index) => (
          <span
            className="cm-mesh-node"
            data-tone={node.tone}
            key={`node-${index}`}
            style={{
              "--mesh-x": `${node.x}%`,
              "--mesh-y": `${node.y}%`,
              "--mesh-size": `${node.size}px`,
              "--mesh-delay": `${node.delay}s`
            } as CSSProperties}
          >
            <i />
          </span>
        ))}
      </div>
      <div className="cm-mesh-telemetry">
        {Array.from({ length: 8 }, (_, index) => (
          <i
            key={index}
            style={{
              "--telemetry-height": `${4 + (index % 5) * 3}px`,
              "--telemetry-delay": `${index * -0.17}s`
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

