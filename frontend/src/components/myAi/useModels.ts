import { useEffect, useState } from "react";
import { myAiApi, type AiTask, type MyAiModel } from "../../api/myAi";

/**
 * The models each of my keys offers for a task (GET /my-ai/credentials/:id/models?task=),
 * fetched once per key and task while the page is open.
 */
const cache = new Map<string, Promise<MyAiModel[]>>();

export const forgetModels = (credentialId?: number) => {
  if (credentialId == null) cache.clear();
  else for (const k of [...cache.keys()]) if (k.startsWith(`${credentialId}|`)) cache.delete(k);
};

export function loadModels(credentialId: number, task: AiTask | "*"): Promise<MyAiModel[]> {
  const k = `${credentialId}|${task}`;
  let p = cache.get(k);
  if (!p) {
    p = myAiApi
      .models(credentialId, task)
      .then((r) => r.data.data ?? [])
      .catch(() => {
        cache.delete(k);
        return [] as MyAiModel[];
      });
    cache.set(k, p);
  }
  return p;
}

/** { [credentialId]: models } for these keys and this task; undefined entries are loading. */
export function useModels(credentialIds: number[], task: AiTask | "*", enabled = true): Record<number, MyAiModel[] | undefined> {
  const [out, setOut] = useState<Record<number, MyAiModel[] | undefined>>({});
  const key = credentialIds.join(",");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    for (const id of credentialIds) {
      void loadModels(id, task).then((models) => live && setOut((o) => ({ ...o, [id]: models })));
    }
    return () => {
      live = false;
    };
  }, [key, task, enabled]);
  return out;
}
