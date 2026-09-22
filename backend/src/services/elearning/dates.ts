/**
 * mysql2 hands DATE columns back as JS Date objects (local midnight) while raw inserts and
 * the API speak "YYYY-MM-DD". Everything in the e-learning services normalises through here.
 */
export const toDateOnly = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
};

/** Local midnight for a date-only value (used for section unlock times). */
export const dateOnlyToLocalMidnight = (value: unknown): Date | null => {
  const s = toDateOnly(value);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

export const todayDateOnly = (now = new Date()): string => toDateOnly(now)!;
