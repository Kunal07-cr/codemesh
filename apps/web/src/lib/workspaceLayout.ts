export type WorkspaceLayout = {
  version: 1;
  view: "editor" | "graph" | "split";
  filesOpen: boolean;
  assistantOpen: boolean;
  fileWidth: number;
  assistantWidth: number;
  graphPercent: number;
};

export const workspacePresets: Record<"coding" | "explore" | "review", WorkspaceLayout> = {
  coding: { version: 1, view: "editor", filesOpen: true, assistantOpen: false, fileWidth: 240, assistantWidth: 360, graphPercent: 45 },
  explore: { version: 1, view: "split", filesOpen: true, assistantOpen: true, fileWidth: 260, assistantWidth: 360, graphPercent: 50 },
  review: { version: 1, view: "editor", filesOpen: false, assistantOpen: true, fileWidth: 240, assistantWidth: 400, graphPercent: 40 }
};

export function parseWorkspaceLayout(raw: string | null): WorkspaceLayout {
  const fallback = { ...workspacePresets.explore };
  try {
    const value = JSON.parse(raw ?? "null") as Partial<WorkspaceLayout> | null;
    if (!value || value.version !== 1 || !["editor", "graph", "split"].includes(value.view ?? "") || typeof value.filesOpen !== "boolean" || typeof value.assistantOpen !== "boolean") return fallback;
    const clamp = (input: unknown, min: number, max: number, defaultValue: number) => typeof input === "number" && Number.isFinite(input) ? Math.max(min, Math.min(max, Math.round(input))) : defaultValue;
    return { version: 1, view: value.view!, filesOpen: value.filesOpen, assistantOpen: value.assistantOpen,
      fileWidth: clamp(value.fileWidth, 180, 320, fallback.fileWidth), assistantWidth: clamp(value.assistantWidth, 280, 440, fallback.assistantWidth), graphPercent: clamp(value.graphPercent, 25, 75, fallback.graphPercent) };
  } catch { return fallback; }
}

export const workspaceLayoutKey = (userId: string, projectId: string) => `codemesh-layout:v1:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
