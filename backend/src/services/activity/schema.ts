import { z } from "zod";
import { DEVICE_ID_RE, ULID_RE } from "./tokens";

/**
 * Wire format of an activity batch (plan §5.1, §15). Validation is deliberately strict
 * on shape and size, and lenient on content: an unknown feature key is kept as
 * "<app>.other" rather than rejecting the whole batch.
 */
export const EVENT_NAME_RE = /^[a-z][a-z0-9_.]{0,63}$/;

const paramValue = z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]);

export const eventSchema = z.object({
  id: z.string().regex(ULID_RE),
  n: z.string().regex(EVENT_NAME_RE),
  t: z.number().int().positive(),
  pv: z.string().max(16).optional(),
  r: z.string().max(191).optional(),
  f: z.string().max(80).optional(),
  p: z
    .record(z.string().max(40), paramValue)
    .refine((o) => Object.keys(o).length <= 20, "too many params")
    .optional(),
});
export type WireEvent = z.infer<typeof eventSchema>;

export const beatSchema = z.object({
  r: z.string().max(191).optional(),
  f: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  vis: z.enum(["visible", "hidden", "gone"]),
  idle: z.boolean().optional(),
  standalone: z.boolean().optional(),
  net: z.string().max(12).optional(),
});
export type WireBeat = z.infer<typeof beatSchema>;

export const envelopeSchema = z.object({
  v: z.literal(1),
  app: z.string().max(10).optional(),
  did: z.string().regex(DEVICE_ID_RE),
  dt: z.string().max(64).optional(),
  tab: z.string().max(32).optional(),
  rel: z.string().max(40).optional(),
  sent_at: z.number().int().positive(),
  tz: z.string().max(40).optional(),
  lang: z.string().max(35).optional(),
  scr: z.string().max(24).optional(),
  vp: z.string().max(24).optional(),
  env: z
    .object({ auto: z.union([z.literal(0), z.literal(1)]).optional(), standalone: z.boolean().optional() })
    .optional(),
  events: z.array(eventSchema).max(100).default([]),
  beat: beatSchema.optional(),
  ticket: z.string().max(200).optional(),
  // Present only so it can be ignored: a browser never decides identity.
  user_id: z.unknown().optional(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

/** Events a browser without a session may send (plan §5.6). */
export const ANONYMOUS_EVENTS = new Set([
  "page_view",
  "user_engagement",
  "scroll",
  "click",
  "file_download",
  "form_submit",
  "web_vital",
  "js_error",
  "location_fix",
  "location_denied",
]);
export const ANONYMOUS_MAX_EVENTS = 50;

export const relayBatchSchema = z.object({
  app: z.string().max(10).optional(),
  batches: z
    .array(
      z.object({
        user_id: z.number().int().positive().nullable(),
        ip: z.string().max(64).nullable().optional(),
        ua: z.string().max(512).nullable().optional(),
        lang: z.string().max(35).nullable().optional(),
        envelope: z.unknown(),
      }),
    )
    .max(500)
    .default([]),
  server_events: z
    .array(
      z.object({
        id: z.string().regex(ULID_RE),
        n: z.string().regex(EVENT_NAME_RE),
        t: z.number().int().positive(),
        user_id: z.number().int().positive().nullable().optional(),
        did: z.string().regex(DEVICE_ID_RE).nullable().optional(),
        ip: z.string().max(64).nullable().optional(),
        p: z.record(z.string().max(40), paramValue).optional(),
      }),
    )
    .max(500)
    .default([]),
});
export type RelayBatch = z.infer<typeof relayBatchSchema>;

/** A route must be a pattern, never a concrete path carrying ids or personal data. */
export const sanitizeRoute = (r: string | undefined | null): string | null => {
  if (!r) return null;
  let s = r.split(/[?#]/)[0].slice(0, 191);
  if (!s.startsWith("/")) s = `/${s}`;
  const bad = s
    .split("/")
    .some(
      (seg) =>
        /^\d{3,}$/.test(seg) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ||
        /@/.test(seg) ||
        /^[A-Za-z0-9_-]{24,}$/.test(seg),
    );
  return bad ? "(invalid)" : s;
};
