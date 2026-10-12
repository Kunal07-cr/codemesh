import { useEffect, useState } from "react";
import { draftKey, readDraft, writeDraft, type DraftScope } from "./workspaceDrafts";

export function useComposerDraft(scope: DraftScope) {
  const key = draftKey(scope);
  const [text, setText] = useState(() => readDraft(localStorage, scope)?.content ?? "");
  const [saved, setSaved] = useState(true);
  useEffect(() => { setSaved(writeDraft(localStorage, scope, { content: text, baseContent: "", revision: "composer", savedAt: Date.now() })); }, [key, text]);
  return { text, setText, saved };
}
