import React, { useEffect, useRef } from "react";

/**
 * A Wokwi element (web component from @wokwi/elements: the Uno, an LED, a servo…). Their state
 * is set as DOM properties (value, brightness, characters…), which React won't do for custom
 * elements, so they're assigned here on every render; events are listened to the same way.
 * The elements are drawings: what they show comes from the simulation.
 */
export interface WokwiProps {
  tag: string;
  props?: Record<string, unknown>;
  events?: Record<string, (e: Event) => void>;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

const Wokwi: React.FC<WokwiProps> = ({ tag, props, events, className, style, label }) => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current as unknown as Record<string, unknown> | null;
    if (!el || !props) return;
    for (const [k, v] of Object.entries(props)) if (el[k] !== v) el[k] = v;
  });

  const handlers = useRef(events);
  handlers.current = events;
  const names = Object.keys(events ?? {}).join(",");
  useEffect(() => {
    const el = ref.current;
    if (!el || !names) return;
    const bound = names.split(",").map((n) => [n, (e: Event) => handlers.current?.[n]?.(e)] as const);
    for (const [n, h] of bound) el.addEventListener(n, h);
    return () => {
      for (const [n, h] of bound) el.removeEventListener(n, h);
    };
  }, [names]);

  return React.createElement(tag, { ref, class: className, style, ...(label ? { "aria-label": label, role: "img" } : {}) });
};

export default Wokwi;

let loading: Promise<unknown> | null = null;
/** Registers the Wokwi elements (once, on first use: only Arduino pages pay for them). */
export const loadWokwiElements = () => (loading ??= import("@wokwi/elements"));
