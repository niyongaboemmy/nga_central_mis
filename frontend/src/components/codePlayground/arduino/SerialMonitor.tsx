import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Clock, LineChart, Send, Terminal, Trash2 } from "lucide-react";
import SelectField from "../../ui/SelectField";

/**
 * The Serial Monitor and Serial Plotter, as in the Arduino IDE: what the sketch prints, a line
 * to send (with the line ending the sketch expects), and numbers drawn as live graphs.
 */
export interface SerialLine {
  /** Simulated time when the line ended (ms). */
  t: number;
  text: string;
}

export interface SerialMonitorProps {
  lines: SerialLine[];
  /** The line still being printed (no newline yet). */
  partial: string;
  baud: number;
  running: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
}

const ENDINGS = { nl: { label: "Newline", s: "\n" }, none: { label: "No line ending", s: "" }, cr: { label: "Carriage return", s: "\r" }, both: { label: "Both NL & CR", s: "\r\n" } } as const;
type Ending = keyof typeof ENDINGS;

/** Arduino's plotter format: "12 34", "12,34", "temp:21.5 hum:40" → named values. */
export function plotValues(line: string): Record<string, number> | null {
  const parts = line.trim().split(/[\s,\t]+/).filter(Boolean);
  if (!parts.length) return null;
  const out: Record<string, number> = {};
  parts.forEach((p, i) => {
    const m = /^([^:]+):(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.exec(p);
    if (m) out[m[1]] = Number(m[2]);
    else if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(p)) out[`value ${i + 1}`] = Number(p);
  });
  return Object.keys(out).length ? out : null;
}

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2"];
const POINTS = 300;

const Plotter: React.FC<{ lines: SerialLine[] }> = ({ lines }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => {
    const map = new Map<string, number[]>();
    const rows = lines.map((l) => plotValues(l.text)).filter((r): r is Record<string, number> => !!r).slice(-POINTS);
    rows.forEach((r, i) => {
      for (const [k, v] of Object.entries(r)) {
        if (!map.has(k)) map.set(k, Array(i).fill(NaN));
        map.get(k)!.push(v);
      }
      for (const [k, arr] of map) if (!(k in r)) arr.push(NaN);
    });
    return map;
  }, [lines]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const all = [...series.values()].flat().filter((v) => Number.isFinite(v));
    if (!all.length) return;
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const dark = document.documentElement.classList.contains("dark");
    g.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
    g.fillStyle = dark ? "#94a3b8" : "#64748b";
    g.font = "10px ui-monospace, monospace";
    for (let i = 0; i <= 4; i++) {
      const y = 8 + ((h - 16) * i) / 4;
      g.beginPath();
      g.moveTo(40, y);
      g.lineTo(w, y);
      g.stroke();
      g.fillText(String(Number((hi - ((hi - lo) * i) / 4).toPrecision(4))), 2, y + 3);
    }
    let k = 0;
    for (const [, values] of series) {
      g.strokeStyle = COLORS[k++ % COLORS.length];
      g.lineWidth = 1.6;
      g.beginPath();
      let pen = false;
      values.forEach((v, i) => {
        if (!Number.isFinite(v)) return void (pen = false);
        const x = 40 + ((w - 44) * i) / Math.max(1, POINTS - 1);
        const y = 8 + (h - 16) * (1 - (v - lo) / (hi - lo));
        if (pen) g.lineTo(x, y);
        else g.moveTo(x, y);
        pen = true;
      });
      g.stroke();
    }
  }, [series]);

  if (!series.size)
    return (
      <p className="p-4 text-xs text-slate-500 dark:text-slate-400" data-testid="arduino-plotter-empty">
        Print numbers to draw them: <code className="font-mono">Serial.println(value);</code> or several on one line,{" "}
        <code className="font-mono">Serial.print("temp:"); Serial.println(t);</code>
      </p>
    );
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="arduino-plotter">
      <div className="flex flex-wrap gap-3 px-3 pt-2 text-[11px]">
        {[...series.keys()].map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-3 h-0.5 rounded" style={{ background: COLORS[i % COLORS.length] }} />
            {k}
          </span>
        ))}
      </div>
      <canvas ref={canvas} className="flex-1 min-h-[120px] w-full" aria-label={`Graph of ${[...series.keys()].join(", ")}`} role="img" />
    </div>
  );
};

const SerialMonitor: React.FC<SerialMonitorProps> = ({ lines, partial, baud, running, onSend, onClear }) => {
  const [view, setView] = useState<"monitor" | "plotter">("monitor");
  const [text, setText] = useState("");
  const [ending, setEnding] = useState<Ending>("nl");
  const [stamps, setStamps] = useState(false);
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, partial, follow, view]);

  const send = () => {
    if (!running) return;
    onSend(text + ENDINGS[ending].s);
    setText("");
  };
  const tab = (id: "monitor" | "plotter", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium ${view === id ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"}`}
      data-testid={`arduino-${id}-tab`}
    >
      {icon}
      {label}
    </button>
  );
  const iconBtn = "inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10";

  return (
    <section className="flex flex-col min-h-0 h-full" aria-label="Serial Monitor" data-testid="arduino-serial">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
        <div role="tablist" aria-label="Serial" className="inline-flex p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/5">
          {tab("monitor", "Serial Monitor", <Terminal className="w-3.5 h-3.5" />)}
          {tab("plotter", "Plotter", <LineChart className="w-3.5 h-3.5" />)}
        </div>
        <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400" data-testid="arduino-baud">
          {baud ? `${baud.toLocaleString()} baud` : "Serial.begin not called yet"}
        </span>
        <span className="flex-1" />
        {view === "monitor" && (
          <>
            <button type="button" className={`${iconBtn} ${stamps ? "text-brand-600 dark:text-brand-200" : ""}`} onClick={() => setStamps((s) => !s)} aria-pressed={stamps} title="Show the time of each line" aria-label="Show timestamps">
              <Clock className="w-3.5 h-3.5" />
            </button>
            <button type="button" className={`${iconBtn} ${follow ? "text-brand-600 dark:text-brand-200" : ""}`} onClick={() => setFollow((f) => !f)} aria-pressed={follow} title="Follow new output" aria-label="Autoscroll">
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <button type="button" className={iconBtn} onClick={onClear} title="Clear" aria-label="Clear the Serial Monitor">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {view === "monitor" ? (
        <div ref={box} role="log" aria-live="polite" tabIndex={0} aria-label="Serial output" className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100" data-testid="arduino-serial-output">
          {!lines.length && !partial && <span className="font-sans text-xs text-slate-500 dark:text-slate-400">What the sketch prints with Serial.print shows here.</span>}
          {lines.map((l, i) => (
            <div key={i}>
              {stamps && <span className="mr-2 text-slate-400 select-none">{(l.t / 1000).toFixed(3)} →</span>}
              {l.text || " "}
            </div>
          ))}
          {partial && <div>{partial}</div>}
        </div>
      ) : (
        <Plotter lines={lines} />
      )}
      <form
        className="flex items-center gap-1.5 px-2 py-1.5 border-t border-slate-200 dark:border-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={running ? "Message to the sketch (Enter to send)" : "Start the simulation to send"}
          disabled={!running}
          aria-label="Message to send to the sketch over Serial"
          className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-sm font-mono outline-none focus:border-brand-500 disabled:opacity-60"
          data-testid="arduino-serial-input"
        />
        <SelectField aria-label="Line ending" value={ending} onChange={(e) => setEnding(e.target.value as Ending)} searchable={false} className="h-8 w-[150px] text-xs">
          {(Object.keys(ENDINGS) as Ending[]).map((k) => (
            <option key={k} value={k}>
              {ENDINGS[k].label}
            </option>
          ))}
        </SelectField>
        <button type="submit" disabled={!running} className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50" data-testid="arduino-serial-send">
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </section>
  );
};

export default SerialMonitor;
