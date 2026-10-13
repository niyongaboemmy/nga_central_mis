import type { PlaygroundBlock } from "./playgroundData";

/**
 * Opening the playground from anywhere — a lesson code window's Run button (plain DOM),
 * a playground block, the editor — without wiring props through every reader:
 * CodePlaygroundHost (mounted once in App) subscribes and shows the modal.
 */
export interface PlaygroundRequest {
  /** Starts as an exercise when mode is "exercise". */
  block: PlaygroundBlock;
  /** Run as soon as it opens (the Run button on a lesson's code). */
  autoRun?: boolean;
  /** Where it came from, for the header ("From the lesson"). */
  source?: string;
  /** The editor's block: Save writes the code back. */
  onSave?: (block: PlaygroundBlock) => void;
}

type Listener = (req: PlaygroundRequest | null) => void;
const listeners = new Set<Listener>();
let current: PlaygroundRequest | null = null;

export function openPlayground(req: PlaygroundRequest): void {
  current = req;
  listeners.forEach((l) => l(current));
}

export function closePlayground(): void {
  current = null;
  listeners.forEach((l) => l(null));
}

export function subscribePlayground(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

/** Whether a host is mounted (else a Run button has nowhere to open). */
export const playgroundAvailable = () => listeners.size > 0;
