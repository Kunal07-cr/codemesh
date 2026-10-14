import type { JsonStore } from "../db/store.js";
import { conflict } from "../errors.js";

const pending = new WeakMap<JsonStore, Set<string>>();
export async function withEngineeringSubmission<T>(store: JsonStore, key: string, action: () => Promise<T>): Promise<T> {
  const locks = pending.get(store) ?? new Set<string>();
  pending.set(store, locks);
  if (locks.has(key)) throw conflict("This submission is already in progress.");
  locks.add(key);
  try { return await action(); } finally { locks.delete(key); }
}
