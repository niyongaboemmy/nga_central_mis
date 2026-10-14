import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Cpu, Download, Loader2, Pause, Play, Plus, RotateCcw, Settings2, Sparkles, Trash2, Undo2, Usb, Volume2, VolumeX, X } from "lucide-react";
import SelectField from "../../ui/SelectField";
import Wokwi, { loadWokwiElements } from "./Wokwi";
import SerialMonitor, { type SerialLine } from "./SerialMonitor";
import { Simulation, type SimView } from "./sim";
import { PART_INFO, PWM_PINS, newPartId, pinClashes, suggestParts, type Circuit, type Part, type PartType } from "./parts";
import { pinName } from "./pins";
import { parseIntelHex } from "./intelHex";
import { canUploadFromBrowser, uploadToBoard, UploadError, type SerialPortLike, type UploadProgress } from "./stk500";
import { saveBlob } from "../saveCode";
import type { Firmware } from "../useRunner";

/**
 * The Arduino Uno simulator: the compiled sketch runs on a simulated ATmega328P (avr8js) wired
 * to the parts in diagram.json — LEDs light, buttons press, a potentiometer turns, a servo moves,
 * a buzzer sounds, an LCD shows text — with the Serial Monitor and Plotter beside it. The same
 * firmware can go to a real board (Web Serial) or be downloaded as a .hex.
 */
export interface ArduinoSimulatorProps {
  firmware: Firmware | null;
  compiling: boolean;
  circuit: Circuit;
  onCircuitChange: (c: Circuit) => void;
  /** The sketch, for "parts your code uses". */
  code: string;
  /** For the .hex's name. */
  sketchName: string;
  onRun: () => void;
}

const SERIAL_MAX_LINES = 2000;
const VIEW_EVERY_MS = 33;
const DIGITAL = Array.from({ length: 12 }, (_, i) => i + 2); // D2–D13 (D0/D1 are Serial)
const ANALOG = Array.from({ length: 6 }, (_, i) => 14 + i);
const LED_COLORS = ["red", "green", "blue", "yellow", "orange", "white", "purple"];

const SOUND_KEY = "codePlayground.arduinoSound";
const readSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
};

/** Pins a new part of this kind may use, best first. */
function preferredPins(type: PartType): number[] {
  if (type === "potentiometer") return ANALOG.slice(0, 4);
  if (type === "led" || type === "servo" || type === "rgb-led") return [...PWM_PINS, ...DIGITAL];
  if (type === "button" || type === "switch") return [2, 4, 7, 8, 12, ...DIGITAL];
  return [8, ...DIGITAL];
}

function freshPart(type: PartType, circuit: Circuit): Part {
  const taken = new Set(circuit.parts.flatMap((p) => Object.values(p.pins)));
  if (circuit.parts.some((p) => p.type === "lcd-i2c")) [18, 19].forEach((n) => taken.add(n));
  const next = (prefs: number[]) => {
    const n = prefs.find((x) => !taken.has(x)) ?? prefs[0];
    taken.add(n);
    return n;
  };
  const pins: Record<string, number> = {};
  if (type === "lcd") Object.assign(pins, { rs: 12, en: 11, d4: 5, d5: 4, d6: 3, d7: 2 });
  else if (type === "rgb-led") Object.assign(pins, { r: next([9, ...PWM_PINS]), g: next([10, ...PWM_PINS]), b: next([11, ...PWM_PINS]) });
  else for (const role of PART_INFO[type].roles) pins[role] = next(preferredPins(type));
  return {
    id: newPartId(type),
    type,
    pins,
    ...(type === "led" ? { color: LED_COLORS[circuit.parts.filter((p) => p.type === "led").length % LED_COLORS.length] } : {}),
    ...(type === "button" ? { wiring: "to-gnd" as const } : {}),
    ...(type === "lcd-i2c" ? { address: 0x27 } : {}),
  };
}

const describe = (p: Part) => `${PART_INFO[p.type].label}${Object.keys(p.pins).length ? ` on ${Object.entries(p.pins).map(([r, n]) => (r === "pin" ? pinName(n) : `${r.toUpperCase()} ${pinName(n)}`)).join(", ")}` : p.address !== undefined ? ` at 0x${p.address.toString(16).toUpperCase()}` : ""}`;
const samePart = (a: Part, b: Part) => a.type === b.type && JSON.stringify(a.pins) === JSON.stringify(b.pins);

const ArduinoSimulator: React.FC<ArduinoSimulatorProps> = ({ firmware, compiling, circuit, onCircuitChange, code, sketchName, onRun }) => {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<SimView | null>(null);
  const [lines, setLines] = useState<SerialLine[]>([]);
  const [partial, setPartial] = useState("");
  const [sound, setSound] = useState(readSound);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [autoAdded, setAutoAdded] = useState<Part[] | null>(null);
  const [upload, setUpload] = useState(false);
  const [error, setError] = useState("");
  const sim = useRef<Simulation | null>(null);
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const audio = useRef<{ ctx: AudioContext; osc: Map<string, OscillatorNode> } | null>(null);

  useEffect(() => {
    let alive = true;
    loadWokwiElements().then(
      () => alive && setReady(true),
      () => alive && setReady(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------- the simulation

  const boot = useCallback(() => {
    sim.current?.dispose();
    sim.current = null;
    setLines([]);
    setPartial("");
    setError("");
    if (!firmware) return setView(null);
    let s: Simulation;
    try {
      s = new Simulation(firmware.hex, circuitRef.current);
    } catch (e) {
      setError((e as Error).message);
      return setView(null);
    }
    sim.current = s;
    let pending = "";
    s.uno.onSerial((text) => {
      // println ends lines with \r\n, and the two may arrive in different slices: a \r at the
      // very end waits for the next slice instead of becoming a line of its own.
      pending = (pending + text).replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      if (parts.length) {
        const t = s.uno.timeMs;
        setLines((ls) => {
          const next = ls.concat(parts.map((p) => ({ t, text: p })));
          return next.length > SERIAL_MAX_LINES ? next.slice(-SERIAL_MAX_LINES) : next;
        });
      }
      setPartial(pending.replace(/\r$/, ""));
    });
    let lastView = 0;
    s.onFrame = (v) => {
      const now = performance.now();
      if (now - lastView < VIEW_EVERY_MS && v.running) return;
      lastView = now;
      setView(v);
    };
    s.start();
    setView(s.view());
  }, [firmware]);

  // A new build: start it (and give parts the sketch uses, when the circuit is empty).
  useEffect(() => {
    if (firmware && !circuitRef.current.parts.length) {
      const found = suggestParts(code);
      if (found.length) {
        circuitRef.current = { ...circuitRef.current, parts: found };
        onCircuitChange(circuitRef.current);
        setAutoAdded(found);
      }
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmware?.hex]);

  useEffect(() => () => sim.current?.dispose(), []);
  useEffect(() => sim.current?.setCircuit(circuit), [circuit]);

  // Buzzers: a square wave at the pin's frequency (sound is opt-in: classrooms).
  useEffect(() => {
    const buzzers = circuit.parts.filter((p) => p.type === "buzzer");
    if (!sound || !view?.running || !buzzers.length) {
      audio.current?.osc.forEach((o) => o.stop());
      audio.current?.osc.clear();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio.current ??= { ctx: new Ctx(), osc: new Map() };
    const a = audio.current;
    for (const b of buzzers) {
      const f = view.parts[b.id]?.frequency ?? 0;
      let o = a.osc.get(b.id);
      if (f > 20 && f < 20000) {
        if (!o) {
          o = a.ctx.createOscillator();
          const gain = a.ctx.createGain();
          gain.gain.value = 0.04;
          o.type = "square";
          o.connect(gain).connect(a.ctx.destination);
          o.start();
          a.osc.set(b.id, o);
        }
        o.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.01);
      } else if (o) {
        o.stop();
        a.osc.delete(b.id);
      }
    }
  }, [view, sound, circuit.parts]);
  useEffect(
    () => () => {
      audio.current?.osc.forEach((o) => o.stop());
      void audio.current?.ctx.close();
    },
    [],
  );

  const toggleSound = () => {
    setSound((s) => {
      try {
        localStorage.setItem(SOUND_KEY, s ? "off" : "on");
      } catch {
        /* private mode */
      }
      return !s;
    });
  };

  // ---------------------------------------------------------------- circuit editing

  const setParts = (parts: Part[]) => onCircuitChange({ ...circuit, parts });
  const update = (id: string, patch: Partial<Part>) => setParts(circuit.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => {
    setParts(circuit.parts.filter((p) => p.id !== id));
    if (editing === id) setEditing(null);
  };
  const add = (type: PartType) => {
    const p = freshPart(type, circuit);
    setParts([...circuit.parts, p]);
    setAdding(false);
    setEditing(p.id);
  };
  const clashes = useMemo(() => pinClashes(circuit), [circuit]);
  const missing = useMemo(() => suggestParts(code).filter((s) => !circuit.parts.some((p) => samePart(p, s) || (s.type === "lcd-i2c" && p.type === "lcd-i2c"))), [code, circuit.parts]);

  // ---------------------------------------------------------------- render pieces

  const running = !!view?.running;
  const status = compiling ? "Compiling…" : !firmware ? "Not built yet" : error ? "Can't run" : running ? "Running" : "Paused";
  const speed = view ? Math.round(view.speed * 100) : 100;
  const btn = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none";

  const partBody = (p: Part) => {
    const v = view?.parts[p.id] ?? {};
    const s = sim.current;
    switch (p.type) {
      case "led": {
        // A PWM pin (~) shows its brightness; any other pin is on or off (a switch caught mid-window isn't "97 %").
        const pwm = PWM_PINS.includes(p.pins.pin);
        const b = v.brightness ?? 0;
        const level = pwm ? b : b >= 0.5 ? 1 : 0;
        return (
          <>
            <Wokwi tag="wokwi-led" props={{ color: p.color ?? "red", value: level > 0.02, brightness: Math.max(0.1, level) }} label={`${p.color ?? "red"} LED ${level > 0.02 ? "on" : "off"}`} />
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{level > 0.98 ? "on" : level < 0.02 ? "off" : `${Math.round(level * 100)}%`}</span>
          </>
        );
      }
      case "rgb-led": {
        const [r, g, b] = v.rgb ?? [0, 0, 0];
        return <Wokwi tag="wokwi-rgb-led" props={{ ledRed: r, ledGreen: g, ledBlue: b }} label="RGB LED" />;
      }
      case "button":
        return (
          <Wokwi
            tag="wokwi-pushbutton"
            props={{ color: "green", label: "" }}
            events={{ "button-press": () => s?.press(p.id, true), "button-release": () => s?.press(p.id, false) }}
            label={`Push button on ${pinName(p.pins.pin)}: hold to press (Space)`}
          />
        );
      case "switch":
        return (
          <button type="button" role="switch" aria-checked={!!v.pressed} onClick={() => s?.press(p.id, !s.inputOf(p.id).pressed)} className="flex flex-col items-center gap-1" aria-label={`Switch on ${pinName(p.pins.pin)}`}>
            <Wokwi tag="wokwi-slide-switch" props={{ value: v.pressed ? 1 : 0 }} />
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{v.pressed ? "HIGH" : "LOW"}</span>
          </button>
        );
      case "potentiometer": {
        const value = s?.inputOf(p.id).value ?? 512;
        return (
          <div className="flex flex-col items-center gap-1 w-full">
            <Wokwi tag="wokwi-potentiometer" props={{ min: 0, max: 1023, value }} events={{ input: (e) => s?.turn(p.id, Number((e as CustomEvent).detail ?? (e.target as HTMLInputElement).value)) }} />
            <input
              type="range"
              min={0}
              max={1023}
              value={value}
              onChange={(e) => s?.turn(p.id, Number(e.target.value))}
              aria-label={`Potentiometer on ${pinName(p.pins.pin)}: ${value} of 1023`}
              className="w-full accent-brand-600"
              data-testid="arduino-pot"
            />
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {value} · {((value / 1023) * 5).toFixed(2)} V
            </span>
          </div>
        );
      }
      case "buzzer":
        return (
          <>
            <Wokwi tag="wokwi-buzzer" props={{ hasSignal: (v.frequency ?? 0) > 0 }} label="Buzzer" />
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{v.frequency ? `${v.frequency} Hz` : "silent"}</span>
          </>
        );
      case "servo":
        return (
          <>
            <Wokwi tag="wokwi-servo" props={{ angle: v.angle ?? 90 }} label={`Servo at ${Math.round(v.angle ?? 90)}°`} />
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{Math.round(v.angle ?? 90)}°</span>
          </>
        );
      case "lcd-i2c":
      case "lcd": {
        const l = v.lcd;
        return (
          <Wokwi
            tag="wokwi-lcd1602"
            props={{ pins: p.type === "lcd-i2c" ? "i2c" : "full", characters: l?.characters ?? new Uint8Array(32).fill(32), backlight: l?.backlight ?? true, cursor: !!l?.cursor, blink: !!l?.blink, cursorX: l?.cursorX ?? 0, cursorY: l?.cursorY ?? 0 }}
            label={`LCD: ${l ? Array.from(l.characters, (c) => String.fromCharCode(c)).join("").replace(/\s+/g, " ").trim() || "blank" : "blank"}`}
            className="max-w-full"
          />
        );
      }
    }
  };

  const pinOptions = (type: PartType) => (type === "potentiometer" ? ANALOG : [...DIGITAL, ...ANALOG]);
  const editor = (p: Part) => (
    <div className="mt-2 grid gap-2 text-xs" data-testid="arduino-part-editor">
      {PART_INFO[p.type].roles.map((role) => (
        <label key={role} className="flex items-center justify-between gap-2">
          <span className="text-slate-600 dark:text-slate-300">{role === "pin" ? "Pin" : role.toUpperCase()}</span>
          <SelectField aria-label={`${PART_INFO[p.type].label} ${role}`} value={String(p.pins[role])} onChange={(e) => update(p.id, { pins: { ...p.pins, [role]: Number(e.target.value) } })} searchable={false} className="h-7 w-24">
            {pinOptions(p.type).map((n) => (
              <option key={n} value={n}>
                {pinName(n)}
                {PWM_PINS.includes(n) ? " ~" : ""}
              </option>
            ))}
          </SelectField>
        </label>
      ))}
      {p.type === "led" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-slate-600 dark:text-slate-300">Colour</span>
          <SelectField aria-label="LED colour" value={p.color ?? "red"} onChange={(e) => update(p.id, { color: e.target.value })} searchable={false} className="h-7 w-24">
            {LED_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </label>
      )}
      {p.type === "button" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-slate-600 dark:text-slate-300">Wired</span>
          <SelectField aria-label="Button wiring" value={p.wiring ?? "to-gnd"} onChange={(e) => update(p.id, { wiring: e.target.value as Part["wiring"] })} searchable={false} className="h-7 w-40">
            <option value="to-gnd">to GND (INPUT_PULLUP)</option>
            <option value="to-5v">to 5 V (pull-down)</option>
          </SelectField>
        </label>
      )}
      {p.type === "lcd-i2c" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-slate-600 dark:text-slate-300">Address</span>
          <SelectField aria-label="LCD I2C address" value={String(p.address ?? 0x27)} onChange={(e) => update(p.id, { address: Number(e.target.value) })} searchable={false} className="h-7 w-24">
            <option value={0x27}>0x27</option>
            <option value={0x3f}>0x3F</option>
          </SelectField>
        </label>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{PART_INFO[p.type].hint}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-[#0d1117]" data-testid="arduino-simulator">
      {/* ---- toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-white/10">
        <span
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold ${
            running ? "bg-success-100 text-success-700 dark:bg-green-500/15 dark:text-green-300" : compiling ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
          }`}
          data-testid="arduino-status"
        >
          {compiling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className={`w-2 h-2 rounded-full ${running ? "bg-success-500 animate-pulse" : "bg-slate-400"}`} />}
          {status}
        </span>
        {view && (
          <span className="text-[12px] tabular-nums text-slate-500 dark:text-slate-400 px-1" data-testid="arduino-clock" title="Simulated time since the sketch started, and the speed against real time">
            {(view.timeMs / 1000).toFixed(1)} s{running && <span className={speed < 90 ? "text-warning-700 dark:text-amber-300" : ""}> · {speed}%</span>}
          </span>
        )}
        <span className="flex-1" />
        {firmware && !error && (
          <>
            <button type="button" className={btn} onClick={() => (running ? sim.current?.pause() : sim.current?.start())} data-testid="arduino-pause">
              {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {running ? "Pause" : "Resume"}
            </button>
            <button type="button" className={btn} onClick={boot} title="Restart the sketch (like the board's reset button)" data-testid="arduino-restart">
              <RotateCcw className="w-3.5 h-3.5" /> Restart
            </button>
          </>
        )}
        {circuit.parts.some((p) => p.type === "buzzer") && (
          <button type="button" className={btn} onClick={toggleSound} aria-pressed={sound} title={sound ? "Mute the buzzer" : "Hear the buzzer"} aria-label={sound ? "Mute the buzzer" : "Hear the buzzer"}>
            {sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        )}
        {firmware && (
          <>
            <button type="button" className={btn} onClick={() => setUpload(true)} title="Upload to a real Arduino Uno / Nano over USB" data-testid="arduino-upload">
              <Usb className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Upload to board</span>
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => saveBlob(new Blob([firmware.hex], { type: "text/plain" }), `${sketchName.replace(/\.ino$/i, "")}.ino.hex`)}
              title="Download the firmware (.hex) for the Arduino IDE or avrdude"
              aria-label="Download the firmware (.hex)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {firmware && (firmware.flash !== null || firmware.ram !== null) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-1.5 border-b border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400" data-testid="arduino-memory">
          {[
            ["Flash", firmware.flash, firmware.flashMax],
            ["RAM", firmware.ram, firmware.ramMax],
          ].map(([label, used, max]) =>
            used !== null && max ? (
              <span key={label as string} className="inline-flex items-center gap-2" title={`${(used as number).toLocaleString()} of ${(max as number).toLocaleString()} bytes`}>
                {label}
                <span className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <span className={`block h-full rounded-full ${(used as number) / (max as number) > 0.85 ? "bg-danger-500" : "bg-brand-500"}`} style={{ width: `${Math.min(100, ((used as number) / (max as number)) * 100)}%` }} />
                </span>
                <span className="tabular-nums">{Math.round(((used as number) / (max as number)) * 100)}%</span>
              </span>
            ) : null,
          )}
        </div>
      )}

      {/* ---- circuit + serial */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-[180px] overflow-auto p-3" role="region" aria-label="Circuit" tabIndex={0}>
          {!firmware && !compiling && (
            <div className="mb-3 rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-3 text-sm text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-600" /> Press <b>Run</b> to compile your sketch and run it on the simulated Uno.
              <button type="button" onClick={onRun} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success-700 hover:bg-green-800 text-white text-xs font-semibold" data-testid="arduino-run">
                <Play className="w-3.5 h-3.5 fill-current" /> Run
              </button>
            </div>
          )}
          {error && (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-danger-100/70 dark:bg-red-500/10 px-3 py-2 text-sm text-danger-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
          {autoAdded && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 px-3 py-2 text-[12.5px] text-brand-800 dark:text-brand-100" role="status" data-testid="arduino-auto-added">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="flex-1 min-w-0">Wired what your code uses: {autoAdded.map(describe).join(", ")}.</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-brand-100 dark:hover:bg-white/10"
                onClick={() => {
                  setParts(circuit.parts.filter((p) => !autoAdded.some((a) => a.id === p.id)));
                  setAutoAdded(null);
                }}
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
              <button type="button" aria-label="Dismiss" className="p-1 rounded-md hover:bg-brand-100 dark:hover:bg-white/10" onClick={() => setAutoAdded(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {!autoAdded && missing.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-500/30 px-3 py-2 text-[12.5px] text-slate-700 dark:text-slate-200" data-testid="arduino-suggest">
              <Sparkles className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="flex-1 min-w-0">Your code also uses: {missing.map(describe).join(", ")}.</span>
              <button type="button" className="h-7 px-2.5 rounded-md bg-brand-600 text-white text-xs font-semibold" onClick={() => setParts([...circuit.parts, ...missing])} data-testid="arduino-suggest-add">
                Add {missing.length === 1 ? "it" : "them"}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-start gap-3">
            <figure className="m-0 shrink-0 flex flex-col items-center gap-1">
              {ready ? (
                <Wokwi
                  tag="wokwi-arduino-uno"
                  props={{ led13: (view?.led13 ?? 0) > 0.3, ledTX: !!view?.tx, ledRX: !!view?.rx, ledPower: true }}
                  events={{ "button-press": (e) => (e as CustomEvent).detail === "reset" && boot() }}
                  label={`Arduino Uno${(view?.led13 ?? 0) > 0.3 ? ", LED L on" : ""}`}
                  style={{ display: "block" }}
                />
              ) : (
                <div className="w-[274px] h-[202px] rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
              )}
              <figcaption className="text-[11px] text-slate-500 dark:text-slate-400">Arduino Uno · ATmega328P · 16 MHz</figcaption>
            </figure>

            {circuit.parts.map((p) => {
              const clash = Object.values(p.pins).some((n) => clashes.has(n)) || (p.type === "lcd-i2c" && [18, 19].some((n) => clashes.has(n)));
              return (
                <div
                  key={p.id}
                  className={`relative w-[150px] rounded-xl border p-2 flex flex-col items-center gap-1 bg-slate-50/60 dark:bg-white/[0.03] ${clash ? "border-warning-500" : "border-slate-200 dark:border-white/10"} ${p.type.startsWith("lcd") ? "w-[310px]" : ""}`}
                  data-testid="arduino-part"
                  data-type={p.type}
                >
                  <div className="w-full flex items-center gap-1">
                    <span className="flex-1 min-w-0 truncate text-[11.5px] font-semibold text-slate-700 dark:text-slate-200" title={describe(p)}>
                      {describe(p)}
                    </span>
                    <button type="button" aria-label={`Edit ${describe(p)}`} aria-expanded={editing === p.id} onClick={() => setEditing(editing === p.id ? null : p.id)} className="p-1 rounded text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10">
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" aria-label={`Remove ${describe(p)}`} onClick={() => remove(p.id)} className="p-1 rounded text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {ready && partBody(p)}
                  {clash && <span className="text-[10.5px] text-warning-700 dark:text-amber-300">A pin is used twice</span>}
                  {editing === p.id && <div className="w-full">{editor(p)}</div>}
                </div>
              );
            })}

            <div className="relative">
              <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className="w-[150px] h-[110px] rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-1 text-[12.5px] text-slate-500 dark:text-slate-400 hover:border-brand-500 hover:text-brand-600" data-testid="arduino-add-part">
                <Plus className="w-5 h-5" /> Add a part
              </button>
              {adding && (
                <div role="menu" aria-label="Parts" className="absolute z-30 mt-1 left-0 w-[260px] p-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-2xl">
                  {(Object.keys(PART_INFO) as PartType[]).map((t) => (
                    <button key={t} type="button" role="menuitem" onClick={() => add(t)} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10" data-testid={`arduino-add-${t}`}>
                      <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{PART_INFO[t].label}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{PART_INFO[t].hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="h-[38%] min-h-[150px] border-t border-slate-200 dark:border-white/10">
          <SerialMonitor
            lines={lines}
            partial={partial}
            baud={view?.baud ?? 0}
            running={running}
            onSend={(t) => sim.current?.uno.serialWrite(t)}
            onClear={() => {
              setLines([]);
              setPartial("");
            }}
          />
        </div>
      </div>

      {upload && firmware && <UploadDialog hex={firmware.hex} onClose={() => setUpload(false)} sketchName={sketchName} />}
    </div>
  );
};

/** Upload to a real board over USB (Web Serial), with what to do where the browser can't. */
const UploadDialog: React.FC<{ hex: string; sketchName: string; onClose: () => void }> = ({ hex, sketchName, onClose }) => {
  const [baud, setBaud] = useState("115200");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const busy = !!progress && !done && !error;
  const supported = canUploadFromBrowser();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const go = async () => {
    setError("");
    setDone(false);
    try {
      const serial = (navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
      const port = await serial.requestPort();
      const { bytes, used } = parseIntelHex(hex);
      setProgress({ stage: "connecting", fraction: 0 });
      await uploadToBoard(port, bytes, used, { baudRate: Number(baud), onProgress: setProgress });
      setDone(true);
    } catch (e) {
      if ((e as Error)?.name === "NotFoundError") return setProgress(null); // no port chosen
      setError(e instanceof UploadError ? e.message : `The upload failed: ${(e as Error)?.message ?? e}`);
    }
  };
  const label = { connecting: "Connecting to the bootloader…", writing: "Writing the sketch…", verifying: "Checking what was written…", done: "Done" } as const;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="arduino-upload-title" className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 shadow-2xl p-5 text-slate-800 dark:text-slate-100" data-testid="arduino-upload-dialog">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-200">
            <Usb className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <h2 id="arduino-upload-title" className="text-base font-semibold">
              Upload to a real board
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Arduino Uno or Nano (ATmega328P), connected with its USB cable.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        {!supported ? (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300 space-y-2" data-testid="arduino-upload-unsupported">
            <p>Uploading from the browser needs Chrome or Edge on a computer (Web Serial). Here you can download the firmware and upload it with the Arduino IDE or:</p>
            <pre className="rounded-lg bg-slate-100 dark:bg-black/40 px-3 py-2 text-[11.5px] overflow-x-auto">arduino-cli upload -p &lt;port&gt; --fqbn arduino:avr:uno --input-file {sketchName.replace(/\.ino$/i, "")}.ino.hex</pre>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Board</span>
              <SelectField aria-label="Board and bootloader" value={baud} onChange={(e) => setBaud(e.target.value)} searchable={false} className="h-8 w-56" disabled={busy}>
                <option value="115200">Uno / new Nano (115200)</option>
                <option value="57600">Nano, old bootloader (57600)</option>
              </SelectField>
            </label>
            {progress && !error && (
              <div aria-live="polite" data-testid="arduino-upload-progress">
                <p className="text-sm">{done ? "Uploaded: the sketch is running on your board." : label[progress.stage]}</p>
                <div className="mt-1.5 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${done ? "bg-success-500" : "bg-brand-500"} transition-all`} style={{ width: `${done ? 100 : progress.stage === "connecting" ? 5 + progress.fraction * 10 : progress.stage === "writing" ? 15 + progress.fraction * 60 : 75 + progress.fraction * 25}%` }} />
                </div>
              </div>
            )}
            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-danger-100/70 dark:bg-red-500/10 px-3 py-2 text-sm text-danger-700 dark:text-red-300" role="alert">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-white/10">
                {done ? "Close" : "Cancel"}
              </button>
              <button type="button" onClick={() => void go()} disabled={busy} className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-60" data-testid="arduino-upload-go">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Usb className="w-4 h-4" />}
                {done ? "Upload again" : busy ? "Uploading…" : "Choose the board's port & upload"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArduinoSimulator;
