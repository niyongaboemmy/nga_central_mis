/**
 * The offline copy of "Now & Next" (WEB-ISO-7).
 *
 * The service worker keeps it in its own cache ("nga-agenda-v1", public/sw.js),
 * keyed by school + person, and lib/tenant.ts clears that cache whenever the
 * signed-in identity changes. The page falls back to it only when the server could
 * not be reached at all: a 401/403/5xx is an answer, and an answer never shows the
 * previous person's agenda.
 */
import type { Agenda } from "../../api/reminders";
import { readIdentity } from "../../lib/tenant";

export const AGENDA_CACHE_PATH = "/__nga/agenda.json";

/** `t<tid>.u<uid>` for the signed-in identity, or null. */
export function agendaCacheId(identity: { tid: number; userId: number } | null = readIdentity()): string | null {
  return identity && identity.tid > 0 && identity.userId > 0 ? `t${identity.tid}.u${identity.userId}` : null;
}

export const agendaCacheUrl = (id: string) => `${AGENDA_CACHE_PATH}?id=${encodeURIComponent(id)}`;

/** Only a network failure (no HTTP response at all) may show the offline copy. */
export function shouldUseOfflineAgenda(error: unknown): boolean {
  const e = error as { response?: unknown; status?: unknown } | null | undefined;
  if (!e) return false;
  return e.response === undefined || e.response === null;
}

/** The last agenda the worker cached for THIS identity (null when none / not signed in). */
export async function cachedAgenda(id: string | null = agendaCacheId()): Promise<Agenda | null> {
  if (!id) return null;
  try {
    const res = await fetch(agendaCacheUrl(id));
    return res.ok ? ((await res.json()) as Agenda | null) : null;
  } catch {
    return null;
  }
}
