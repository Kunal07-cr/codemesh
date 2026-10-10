export type TrailWaypoint = {
  href: string;
  label: string;
  source: string;
  visitedAt: string;
  pinned: boolean;
  note: string;
};

const sections: Record<string, string> = {
  workspace: "Source workspace", universe: "Code universe", assistant: "AI Assistant",
  intelligence: "Intelligence", labs: "Engineering labs", advanced: "Advanced operations",
  "control-room": "Control room", delivery: "Delivery hub", operations: "Production center",
  tasks: "Tasks", discussions: "Discussions", contributions: "Contributions", settings: "Settings"
};

export function trailLocation(projectId: string, location: string): Pick<TrailWaypoint, "href" | "label" | "source"> | null {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  if (!location.startsWith(base) || location.length > 4000 || /[\\\r\n]/.test(location)) return null;
  const url = new URL(location, "https://codemesh.local");
  if (url.origin !== "https://codemesh.local" || (url.pathname !== base && !url.pathname.startsWith(`${base}/`))) return null;
  const section = url.pathname.slice(base.length + 1);
  if (section && !sections[section]) return null;
  const query = new URLSearchParams();
  for (const key of ["path", "line", "lab", "tab", "view"]) {
    const value = url.searchParams.get(key);
    if (value && value.length <= 1000) query.set(key, value);
  }
  const source = query.get("path") ?? "";
  const labLabels: Record<string, string> = { invariants: "Invariant Ledger", challenge: "Repository Challenge Room", viva: "Viva Simulator" };
  const label = (section === "labs" ? labLabels[query.get("lab") ?? ""] : undefined) ?? sections[section] ?? "Project overview";
  return { href: `${url.pathname}${query.size ? `?${query}` : ""}`, label, source };
}

export function parseTrail(projectId: string, raw: string | null): TrailWaypoint[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.href !== "string") return [];
      const location = trailLocation(projectId, item.href);
      if (!location || seen.has(location.href)) return [];
      seen.add(location.href);
      return [{ ...location, pinned: item.pinned === true, note: typeof item.note === "string" ? item.note.slice(0, 2000) : "", visitedAt: typeof item.visitedAt === "string" && Number.isFinite(Date.parse(item.visitedAt)) ? item.visitedAt : new Date(0).toISOString() }];
    }).slice(0, 40);
  } catch { return []; }
}

export function recordTrailVisit(trail: TrailWaypoint[], projectId: string, href: string, visitedAt = new Date().toISOString()): TrailWaypoint[] {
  const location = trailLocation(projectId, href);
  if (!location || trail[0]?.href === location.href) return trail;
  const previous = trail.find((item) => item.href === location.href);
  const next = [{ ...location, visitedAt, pinned: previous?.pinned ?? false, note: previous?.note ?? "" }, ...trail.filter((item) => item.href !== location.href)];
  // Keep pinned research when the history reaches its limit.
  while (next.length > 40) {
    let removable = -1;
    for (let index = next.length - 1; index > 0; index--) {
      if (!next[index]!.pinned) { removable = index; break; }
    }
    next.splice(removable >= 0 ? removable : next.length - 1, 1);
  }
  return next;
}

export function exportTrail(projectName: string, trail: TrailWaypoint[]): string {
  const text = (value: string) => value.replace(/[\r\n]/g, " ").replace(/[<>]/g, "");
  return [`# ${text(projectName)}: Investigation Trail`, "", "Local source locations and investigation notes.", "", ...trail.flatMap((item, index) => [
    `## ${index + 1}. ${text(item.label)}${item.pinned ? " (pinned)" : ""}`,
    `Location: ${text(item.href)}`, `Visited: ${item.visitedAt}`, ...(item.note ? ["", item.note.replace(/[<>]/g, "")] : []), ""
  ])].join("\n");
}
