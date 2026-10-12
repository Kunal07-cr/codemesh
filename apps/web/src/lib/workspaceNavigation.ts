import type { CodeAnnotation, GraphNode } from "@codemesh/shared";

export type FileTreeEntry = { path: string; name: string; children?: FileTreeEntry[] };
export function buildFileTree(paths: string[]): FileTreeEntry[] {
  const root: FileTreeEntry[] = [];
  const entriesByPath = new Map<string, FileTreeEntry>();
  for (const path of [...new Set(paths)].sort()) {
    const parts = path.split("/");
    let siblings = root;
    parts.forEach((name, index) => {
      const fullPath = parts.slice(0, index + 1).join("/");
      let entry = entriesByPath.get(fullPath);
      if (!entry) { entry = { path: fullPath, name, children: index < parts.length - 1 ? [] : undefined }; siblings.push(entry); entriesByPath.set(fullPath, entry); }
      if (entry.children) siblings = entry.children;
    });
  }
  const sort = (entries: FileTreeEntry[]) => {
    entries.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name));
    entries.forEach((entry) => { if (entry.children) sort(entry.children); });
  };
  sort(root);
  return root;
}

export function nodeAtLine(nodes: GraphNode[], path: string, line: number) {
  return nodes.filter((node) => node.filePath === path && node.range && node.range.startLine <= line && node.range.endLine >= line)
    .sort((a, b) => (a.range!.endLine - a.range!.startLine) - (b.range!.endLine - b.range!.startLine))[0]
    ?? nodes.find((node) => node.type === "file" && node.filePath === path);
}

export function annotationsForNode(annotations: CodeAnnotation[], node: GraphNode) {
  return annotations.filter((annotation) => annotation.filePath === node.filePath && (node.symbolId ? annotation.symbolId === node.symbolId : !annotation.symbolId));
}

export function parsePinnedPaths(raw: string | null, knownPaths: string[]) {
  try {
    const value: unknown = JSON.parse(raw ?? "[]"), known = new Set(knownPaths);
    return Array.isArray(value) ? [...new Set(value.filter((path): path is string => typeof path === "string" && known.has(path)))].slice(0, 12) : [];
  } catch { return []; }
}
