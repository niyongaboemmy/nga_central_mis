import { TenantScopedMap } from "../../tenancy/scoped";
import type { Response } from "express";

/**
 * Live register (plan §16.4): an in-memory SSE topic per session so QR
 * check-ins and a co-teacher's marks appear on the host's screen at once.
 * Single pm2 process, like the e-learning presence stream; clients fall back
 * to polling if the stream drops.
 */
// Session ids repeat across school databases: one topic map per tenant.
const subscribers = new TenantScopedMap<number, Set<Response>>();

export const subscribeSession = (sessionId: number, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 5000\n\n");
  const mine = subscribers.current(); // the close handler may run outside the request context
  const set = mine.get(sessionId) ?? new Set<Response>();
  set.add(res);
  mine.set(sessionId, set);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  ping.unref?.();
  res.on("close", () => {
    clearInterval(ping);
    set.delete(res);
    if (!set.size && mine.get(sessionId) === set) mine.delete(sessionId);
  });
};

export const publishSession = (sessionId: number, event: string, data: unknown) => {
  const set = subscribers.get(sessionId);
  if (!set) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
  return set.size;
};

export const liveSubscriberCount = (sessionId: number) => subscribers.get(sessionId)?.size ?? 0;
