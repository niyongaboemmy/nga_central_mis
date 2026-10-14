import { parseIntelHex } from "./intelHex";
import { HD44780, lcdI2C, lcdParallel, type LcdState } from "./lcd";
import type { Circuit, Part } from "./parts";
import { ArduinoUno, FREQ_HZ } from "./uno";

/**
 * A running sketch: the Uno, the circuit around it, and a clock.
 *  - live: paced to real time in short slices on animation frames (the page stays smooth); if the
 *    device can't keep up, it runs slower and says so (speed < 100 %);
 *  - headless: as fast as possible, for checking an exercise's Serial output.
 */
export interface PartView {
  /** LEDs: 0–1 (PWM duty). RGB: r/g/b 0–1. */
  brightness?: number;
  rgb?: [number, number, number];
  /** Buzzer: frequency in Hz (0 = silent). */
  frequency?: number;
  /** Servo: 0–180°. */
  angle?: number;
  lcd?: LcdState;
  /** Inputs: as the student set them. */
  pressed?: boolean;
  value?: number;
}

export interface SimView {
  timeMs: number;
  /** Simulated speed against real time over the last second (1 = real time). */
  speed: number;
  running: boolean;
  led13: number;
  tx: boolean;
  rx: boolean;
  baud: number;
  parts: Record<string, PartView>;
}

const SERVO_MIN_US = 544;
const SERVO_MAX_US = 2400;
const MAX_SLICE_MS = 12; // real time spent simulating per frame, at most

export class Simulation {
  readonly uno: ArduinoUno;
  readonly flashUsed: number;
  private lcds = new Map<string, HD44780>();
  private inputs = new Map<string, { pressed?: boolean; value?: number }>();
  private undo: (() => void)[] = [];
  private raf = 0;
  private lastReal = 0;
  private speedSamples: { real: number; sim: number }[] = [];
  private txSeen = 0;
  private rxSeen = 0;
  private angles = new Map<string, number>();
  running = false;
  onFrame: ((view: SimView) => void) | null = null;

  constructor(
    hex: string,
    private circuit: Circuit,
  ) {
    const { bytes, used } = parseIntelHex(hex);
    this.flashUsed = used;
    this.uno = new ArduinoUno(bytes);
    this.wire();
  }

  /** Connects the parts to the Uno (again, after the circuit changed). */
  private wire() {
    for (const u of this.undo) u();
    this.undo = [];
    const keep = new Map(this.lcds);
    this.lcds.clear();
    for (const p of this.circuit.parts) {
      if (p.type === "lcd-i2c" || p.type === "lcd") {
        const lcd = keep.get(p.id) ?? new HD44780();
        this.lcds.set(p.id, lcd);
        this.undo.push(p.type === "lcd-i2c" ? lcdI2C(this.uno, lcd, p.address ?? 0x27) : lcdParallel(this.uno, lcd, p.pins as never));
      }
      this.applyInput(p);
    }
  }

  setCircuit(c: Circuit) {
    // Parts that went away let go of their pins.
    for (const p of this.circuit.parts) if (!c.parts.some((q) => q.id === p.id)) for (const n of Object.values(p.pins)) this.uno.setDigital(n, null);
    this.circuit = c;
    this.wire();
  }

  private applyInput(p: Part) {
    const s = this.inputs.get(p.id) ?? {};
    const pin = p.pins.pin;
    if (p.type === "button") {
      // To GND: pressed pulls LOW, released lets the pull-up win. To 5 V (pull-down resistor): pressed HIGH, else LOW.
      this.uno.setDigital(pin, p.wiring === "to-5v" ? !!s.pressed : s.pressed ? false : null);
    } else if (p.type === "switch") {
      this.uno.setDigital(pin, !!s.pressed);
    } else if (p.type === "potentiometer") {
      this.uno.setAnalog(pin - 14, ((s.value ?? 512) / 1023) * 5);
    }
  }

  /** A button held down or let go, a switch flipped. */
  press(partId: string, pressed: boolean) {
    this.inputs.set(partId, { ...this.inputs.get(partId), pressed });
    const p = this.circuit.parts.find((x) => x.id === partId);
    if (p) this.applyInput(p);
  }
  /** A potentiometer turned (0–1023). */
  turn(partId: string, value: number) {
    this.inputs.set(partId, { ...this.inputs.get(partId), value: Math.max(0, Math.min(1023, Math.round(value))) });
    const p = this.circuit.parts.find((x) => x.id === partId);
    if (p) this.applyInput(p);
  }
  inputOf(partId: string) {
    return this.inputs.get(partId) ?? {};
  }

  // ------------------------------------------------------------------ live

  start() {
    if (this.running) return;
    this.running = true;
    this.lastReal = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      // A hidden tab gets no frames: don't try to catch up minutes of simulated time.
      const realDelta = Math.min(now - this.lastReal, 100);
      this.lastReal = now;
      const target = this.uno.cpu.cycles + (realDelta * FREQ_HZ) / 1000;
      const t0 = performance.now();
      const before = this.uno.cpu.cycles;
      while (this.uno.cpu.cycles < target && performance.now() - t0 < MAX_SLICE_MS) this.uno.run(Math.min(FREQ_HZ / 1000, target - this.uno.cpu.cycles));
      this.speedSamples.push({ real: realDelta, sim: ((this.uno.cpu.cycles - before) / FREQ_HZ) * 1000 });
      if (this.speedSamples.length > 60) this.speedSamples.shift();
      this.onFrame?.(this.view());
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.onFrame?.(this.view());
  }

  dispose() {
    this.pause();
    for (const u of this.undo) u();
    this.onFrame = null;
  }

  view(): SimView {
    const uno = this.uno;
    const real = this.speedSamples.reduce((n, s) => n + s.real, 0);
    const sim = this.speedSamples.reduce((n, s) => n + s.sim, 0);
    const parts: Record<string, PartView> = {};
    for (const p of this.circuit.parts) {
      const pin = p.pins.pin;
      if (p.type === "led") parts[p.id] = { brightness: uno.takeDuty(pin) };
      else if (p.type === "rgb-led") parts[p.id] = { rgb: [uno.takeDuty(p.pins.r), uno.takeDuty(p.pins.g), uno.takeDuty(p.pins.b)] };
      else if (p.type === "buzzer") parts[p.id] = { frequency: Math.round(uno.frequency(pin)) };
      else if (p.type === "servo") {
        const us = uno.pulseMicros(pin);
        // No pulses (detached): the horn stays where it was.
        if (us > 0) this.angles.set(p.id, Math.max(0, Math.min(180, ((us - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US)) * 180)));
        parts[p.id] = { angle: this.angles.get(p.id) ?? 90 };
      } else if (p.type === "lcd-i2c" || p.type === "lcd") parts[p.id] = { lcd: this.lcds.get(p.id)!.state() };
      else parts[p.id] = { ...this.inputOf(p.id) };
    }
    const tx = uno.txCount !== this.txSeen;
    const rx = uno.rxCount !== this.rxSeen;
    this.txSeen = uno.txCount;
    this.rxSeen = uno.rxCount;
    return { timeMs: uno.timeMs, speed: real > 0 ? sim / real : 1, running: this.running, led13: uno.takeDuty(13), tx, rx, baud: uno.baud, parts };
  }

  lcdText(partId: string) {
    return this.lcds.get(partId)?.text() ?? null;
  }
}

/**
 * Runs firmware without a screen, as fast as the device allows, and returns its Serial output:
 * how an exercise's expected output is checked. Stops early once there is enough output, and
 * yields to the page now and then so it stays responsive.
 */
export async function runHeadless(
  hex: string,
  circuit: Circuit,
  opts: { ms: number; input?: string; stopAfterChars?: number; signal?: AbortSignal },
): Promise<{ serial: string; timeMs: number }> {
  const sim = new Simulation(hex, circuit);
  let serial = "";
  sim.uno.onSerial((t) => (serial += t));
  if (opts.input) sim.uno.serialWrite(opts.input);
  const end = opts.ms;
  while (sim.uno.timeMs < end) {
    if (opts.signal?.aborted) break;
    sim.uno.runMs(Math.min(50, end - sim.uno.timeMs));
    if (opts.stopAfterChars && serial.length >= opts.stopAfterChars) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  sim.dispose();
  return { serial: serial.replace(/\r\n/g, "\n"), timeMs: sim.uno.timeMs };
}
