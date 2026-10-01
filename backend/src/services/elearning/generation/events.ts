import { EventEmitter } from "events";

/**
 * In-process fan-out of run progress to SSE listeners (one backend process — same approach
 * as livePresence.ts). Events are hints to refetch or patch; the database stays the truth,
 * so a client that misses one simply reloads the run.
 */
export interface RunEvent {
  type: "task" | "run";
  run_id: number;
  task_id?: number;
  section_id?: number;
  kind?: string;
  status: string;
  detail?: Record<string, unknown> | null;
}

const bus = new EventEmitter();
bus.setMaxListeners(500);

export function emitRunEvent(event: RunEvent): void {
  bus.emit(`run:${event.run_id}`, event);
}

export function onRunEvent(runId: number, listener: (e: RunEvent) => void): () => void {
  bus.on(`run:${runId}`, listener);
  return () => bus.off(`run:${runId}`, listener);
}
