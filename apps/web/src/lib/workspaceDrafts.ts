import { z } from "zod";

export type DraftScope = { userId: string; projectId: string; workspaceId: string; kind: "code" | "chat" | "assistant"; path: string };
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const prefix = "codemesh-draft:v1:";
const ttl = 7 * 24 * 60 * 60 * 1000;
const draftSchema = z.object({ content: z.string().max(500_000), baseContent: z.string().max(500_000), revision: z.string().max(200), savedAt: z.number().nonnegative() }).strict();
export type LocalDraft = z.infer<typeof draftSchema>;

export function draftKey(scope: DraftScope) {
  return prefix + [scope.userId, scope.projectId, scope.workspaceId, scope.kind, scope.path].map(encodeURIComponent).join(":");
}

export function readDraft(storage: DraftStorage, scope: DraftScope, now = Date.now()): LocalDraft | null {
  try {
    const key = draftKey(scope), raw = storage.getItem(key);
    const parsed = draftSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (!parsed.success || parsed.data.savedAt > now + 60_000 || now - parsed.data.savedAt > ttl) {
      if (raw) storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

export function writeDraft(storage: DraftStorage, scope: DraftScope, draft: LocalDraft): boolean {
  try {
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success || scope.userId === "guest") return false;
    const key = draftKey(scope);
    if (!draft.content && scope.kind !== "code") { storage.removeItem(key); return true; }
    // Bounded device cache: evict expired entries first, then oldest drafts.
    const entries: Array<{ key: string; size: number; savedAt: number }> = [];
    for (let index = 0; index < storage.length; index++) {
      const candidate = storage.key(index);
      if (!candidate?.startsWith(prefix) || candidate === key) continue;
      const raw = storage.getItem(candidate) ?? "";
      let savedAt = 0;
      try { savedAt = Number(JSON.parse(raw).savedAt) || 0; } catch { /* Invalid cache entries are first to be evicted. */ }
      entries.push({ key: candidate, size: raw.length, savedAt });
    }
    const encoded = JSON.stringify(parsed.data);
    if (encoded.length > 2_000_000) return false;
    let total = entries.reduce((size, entry) => size + entry.size, encoded.length);
    let count = entries.length + 1;
    for (const entry of entries.sort((a, b) => a.savedAt - b.savedAt)) {
      if (total <= 2_000_000 && count <= 20 && draft.savedAt - entry.savedAt <= ttl) break;
      storage.removeItem(entry.key); total -= entry.size; count--;
    }
    storage.setItem(key, encoded);
    return true;
  } catch { return false; }
}

export function clearUserDrafts(storage: DraftStorage, userId: string) {
  const userPrefix = prefix + encodeURIComponent(userId) + ":";
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(userPrefix)));
    keys.forEach((key) => storage.removeItem(key));
  } catch { /* Blocked device storage cannot be cleared here. */ }
}

export function classifyDraft(draft: LocalDraft, remoteContent: string, revision: string) {
  if (draft.content === remoteContent) return "synced" as const;
  if (draft.revision === revision && draft.baseContent === remoteContent) return "recoverable" as const;
  return "conflict" as const;
}
