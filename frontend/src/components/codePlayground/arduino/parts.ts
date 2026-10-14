import { parsePin, pinName } from "./pins";

/**
 * What is wired to the Uno: the parts a sketch talks to and the pins they use. Kept in the
 * project as diagram.json (like Wokwi's), so saving, sharing and downloading keep the circuit.
 */
export type PartType = "led" | "rgb-led" | "button" | "switch" | "potentiometer" | "buzzer" | "servo" | "lcd-i2c" | "lcd";

export interface Part {
  id: string;
  type: PartType;
  label?: string;
  /** LED colour (red, green, blue, yellow, orange, white, purple). */
  color?: string;
  /** Role → Arduino pin number (D0–D13 = 0–13, A0–A5 = 14–19). */
  pins: Record<string, number>;
  /** Buttons: to GND (with INPUT_PULLUP) or to 5 V (with a pull-down resistor). */
  wiring?: "to-gnd" | "to-5v";
  /** I²C LCD backpack address (0x27 or 0x3F). */
  address?: number;
}

export interface Circuit {
  version: 1;
  board: "uno";
  parts: Part[];
}

export const DIAGRAM_FILE = "diagram.json";
export const EMPTY_CIRCUIT: Circuit = { version: 1, board: "uno", parts: [] };

export const PART_INFO: Record<PartType, { label: string; roles: string[]; hint: string }> = {
  led: { label: "LED", roles: ["pin"], hint: "digitalWrite / analogWrite (brightness)" },
  "rgb-led": { label: "RGB LED", roles: ["r", "g", "b"], hint: "analogWrite on three PWM pins" },
  button: { label: "Push button", roles: ["pin"], hint: "digitalRead" },
  switch: { label: "Slide switch", roles: ["pin"], hint: "digitalRead (stays on/off)" },
  potentiometer: { label: "Potentiometer", roles: ["pin"], hint: "analogRead on A0–A5" },
  buzzer: { label: "Buzzer", roles: ["pin"], hint: "tone / noTone" },
  servo: { label: "Servo", roles: ["pin"], hint: "Servo.attach / write" },
  "lcd-i2c": { label: "LCD 16×2 (I²C)", roles: [], hint: "LiquidCrystal_I2C (SDA A4, SCL A5)" },
  lcd: { label: "LCD 16×2", roles: ["rs", "en", "d4", "d5", "d6", "d7"], hint: "LiquidCrystal(rs, en, d4, d5, d6, d7)" },
};

const TYPES = Object.keys(PART_INFO) as PartType[];
const COLORS = ["red", "green", "blue", "yellow", "orange", "white", "purple"];
/** PWM pins on the Uno (analogWrite). */
export const PWM_PINS = [3, 5, 6, 9, 10, 11];

let seq = 0;
export const newPartId = (type: PartType) => `${type}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** diagram.json → a circuit; anything unknown or broken is left out (never throws). */
export function parseCircuit(text: string | null | undefined): Circuit {
  if (!text) return { ...EMPTY_CIRCUIT, parts: [] };
  try {
    const raw = JSON.parse(text) as { parts?: unknown };
    const parts: Part[] = [];
    for (const p of Array.isArray(raw?.parts) ? raw.parts : []) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const type = String(o.type) as PartType;
      if (!TYPES.includes(type)) continue;
      const pins: Record<string, number> = {};
      for (const role of PART_INFO[type].roles) {
        const n = parsePin(((o.pins as Record<string, unknown>) ?? {})[role] as string | number);
        if (n !== null) pins[role] = n;
      }
      if (PART_INFO[type].roles.some((r) => pins[r] === undefined)) continue;
      parts.push({
        id: typeof o.id === "string" && o.id ? o.id.slice(0, 60) : newPartId(type),
        type,
        ...(typeof o.label === "string" && o.label.trim() ? { label: o.label.trim().slice(0, 40) } : {}),
        ...(type === "led" ? { color: COLORS.includes(String(o.color)) ? String(o.color) : "red" } : {}),
        pins,
        ...(type === "button" ? { wiring: o.wiring === "to-5v" ? "to-5v" : "to-gnd" } : {}),
        ...(type === "lcd-i2c" ? { address: o.address === 0x3f || o.address === "0x3F" || o.address === "0x3f" ? 0x3f : 0x27 } : {}),
      } as Part);
    }
    return { version: 1, board: "uno", parts };
  } catch {
    return { ...EMPTY_CIRCUIT, parts: [] };
  }
}

/** A circuit → diagram.json (pins written as on the board: "D9", "A0"). */
export function serializeCircuit(c: Circuit): string {
  return `${JSON.stringify(
    {
      version: 1,
      board: "uno",
      parts: c.parts.map((p) => ({
        id: p.id,
        type: p.type,
        ...(p.label ? { label: p.label } : {}),
        ...(p.color ? { color: p.color } : {}),
        pins: Object.fromEntries(Object.entries(p.pins).map(([r, n]) => [r, pinName(n)])),
        ...(p.wiring ? { wiring: p.wiring } : {}),
        ...(p.address !== undefined ? { address: `0x${p.address.toString(16).toUpperCase()}` } : {}),
      })),
    },
    null,
    2,
  )}\n`;
}

/** Pins two parts both claim (a mistake worth pointing out). */
export function pinClashes(c: Circuit): Map<number, string[]> {
  const by = new Map<number, string[]>();
  for (const p of c.parts) for (const n of Object.values(p.pins)) by.set(n, [...(by.get(n) ?? []), p.id]);
  for (const p of c.parts) if (p.type === "lcd-i2c") for (const n of [18, 19]) by.set(n, [...(by.get(n) ?? []), p.id]);
  return new Map([...by].filter(([, ids]) => new Set(ids).size > 1));
}

// ---------------------------------------------------------------------------- from the code

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** `const int ledPin = 9;`, `#define BUTTON 2`, `int sensor = A0;` → name → pin. */
function pinNames(code: string): Map<string, number> {
  const names = new Map<string, number>();
  const re = /(?:#define\s+([A-Za-z_]\w*)\s+(A?\d{1,2})\b)|(?:(?:const\s+)?(?:static\s+)?(?:unsigned\s+)?(?:int|byte|uint8_t|short|long|char)\s+([A-Za-z_]\w*)\s*=\s*(A?\d{1,2})\s*;)/g;
  for (const m of code.matchAll(re)) {
    const name = m[1] ?? m[3];
    const n = parsePin(m[2] ?? m[4]);
    if (name && n !== null) names.set(name, n);
  }
  return names;
}

/**
 * Parts the sketch seems to use, so a student who pressed Run sees their LED light without
 * wiring anything: pinMode/digitalWrite/analogWrite → LED, INPUT(_PULLUP) → button, analogRead →
 * potentiometer, tone → buzzer, Servo.attach → servo, LiquidCrystal(_I2C) → LCD. Pins 0/1
 * (Serial) and 13 (the board's own LED) are left alone.
 */
export function suggestParts(code: string): Part[] {
  const src = stripComments(code);
  const names = pinNames(src);
  const pin = (tok: string): number | null => parsePin(tok.trim()) ?? names.get(tok.trim()) ?? null;
  const parts: Part[] = [];
  const used = new Set<number>([0, 1]);
  const add = (p: Omit<Part, "id">) => {
    const pins = Object.values(p.pins);
    if (pins.some((n) => used.has(n))) return;
    pins.forEach((n) => used.add(n));
    parts.push({ id: newPartId(p.type), ...p });
  };
  const toneTo = new Set([...src.matchAll(/\btone\s*\(\s*([\w]+)/g)].map((m) => pin(m[1])).filter((n): n is number => n !== null));
  const servoTo = new Set([...src.matchAll(/\.attach\s*\(\s*([\w]+)/g)].map((m) => pin(m[1])).filter((n): n is number => n !== null));

  // LCDs first (their pins are not LEDs).
  const i2c = /LiquidCrystal_I2C\s+\w+\s*\(\s*(0x[0-9a-fA-F]+|\d+)/.exec(src);
  if (i2c) {
    parts.push({ id: newPartId("lcd-i2c"), type: "lcd-i2c", pins: {}, address: parseInt(i2c[1]) === 0x3f ? 0x3f : 0x27 });
    used.add(18);
    used.add(19);
  }
  const par = /\bLiquidCrystal\s+\w+\s*\(([^)]*)\)/.exec(src);
  if (par) {
    const ps = par[1].split(",").map(pin);
    if (ps.length === 6 && ps.every((n) => n !== null)) {
      const [rs, en, d4, d5, d6, d7] = ps as number[];
      add({ type: "lcd", pins: { rs, en, d4, d5, d6, d7 } });
    }
  }
  for (const n of servoTo) add({ type: "servo", pins: { pin: n } });
  for (const n of toneTo) add({ type: "buzzer", pins: { pin: n } });

  // An RGB LED: three PWM outputs named red/green/blue.
  const colour = (re: RegExp) => [...names].find(([k]) => re.test(k))?.[1];
  const [r, g, b] = [colour(/red|^r(?:Pin)?$/i), colour(/green|^g(?:Pin)?$/i), colour(/blue|^b(?:Pin)?$/i)];
  if (r !== undefined && g !== undefined && b !== undefined && new RegExp(`analogWrite`).test(src)) add({ type: "rgb-led", pins: { r, g, b } });

  for (const m of src.matchAll(/\bpinMode\s*\(\s*([\w]+)\s*,\s*(INPUT_PULLUP|INPUT|OUTPUT)\s*\)/g)) {
    const n = pin(m[1]);
    if (n === null || n === 13) continue;
    if (m[2] === "OUTPUT") {
      if (n >= 14) continue;
      const name = [...names].find(([, v]) => v === n)?.[0] ?? "";
      add({ type: "led", pins: { pin: n }, color: /green/i.test(name) ? "green" : /blue/i.test(name) ? "blue" : /yellow/i.test(name) ? "yellow" : "red" });
    } else {
      add({ type: "button", pins: { pin: n }, wiring: m[2] === "INPUT_PULLUP" ? "to-gnd" : "to-5v" });
    }
  }
  for (const m of src.matchAll(/\banalogWrite\s*\(\s*([\w]+)/g)) {
    const n = pin(m[1]);
    if (n !== null && n !== 13 && n < 14) add({ type: "led", pins: { pin: n }, color: "red" });
  }
  for (const m of src.matchAll(/\banalogRead\s*\(\s*([\w]+)\s*\)/g)) {
    let n = pin(m[1]);
    if (n !== null && n < 6 && /^\d$/.test(m[1].trim())) n += 14; // analogRead(0) means A0
    if (n !== null && n >= 14) add({ type: "potentiometer", pins: { pin: n } });
  }
  return parts;
}
