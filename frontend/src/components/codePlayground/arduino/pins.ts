/** Arduino Uno pin numbers (no simulator code: parts and diagram.json use this without avr8js). */
export const PIN_COUNT = 20;

export type Port = "B" | "C" | "D";
/** D0–D7 PORTD, D8–D13 PORTB0–5, A0–A5 (D14–D19) PORTC0–5. */
export function pinPort(pin: number): { port: Port; bit: number } | null {
  if (!Number.isInteger(pin) || pin < 0 || pin >= PIN_COUNT) return null;
  if (pin < 8) return { port: "D", bit: pin };
  if (pin < 14) return { port: "B", bit: pin - 8 };
  return { port: "C", bit: pin - 14 };
}
export const pinName = (pin: number) => (pin >= 14 ? `A${pin - 14}` : `D${pin}`);
/** "A0" / "13" / "D13" → 14 / 13 / 13. */
export function parsePin(name: string | number): number | null {
  if (typeof name === "number") return pinPort(name) ? name : null;
  const m = /^(?:(A)|D)?(\d{1,2})$/i.exec(name.trim());
  if (!m) return null;
  const n = Number(m[2]) + (m[1] ? 14 : 0);
  return pinPort(n) ? n : null;
}
