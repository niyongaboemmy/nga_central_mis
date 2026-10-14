import type { ArduinoUno, I2CDevice } from "./uno";

/**
 * The 16×2 character LCD: an HD44780 controller, fed 4 bits at a time — through a PCF8574 I²C
 * backpack (LiquidCrystal_I2C, address 0x27 / 0x3F) or straight from pins (LiquidCrystal(rs, en,
 * d4, d5, d6, d7)). Enough of the controller for lessons: clear, home, entry mode, display/cursor/
 * blink, function set (8- then 4-bit start-up), cursor address, text and custom characters.
 */
export interface LcdState {
  /** 32 character codes: row 0 then row 1. */
  characters: Uint8Array;
  display: boolean;
  cursor: boolean;
  blink: boolean;
  cursorX: number;
  cursorY: number;
  backlight: boolean;
  /** Custom characters 0–7 (8 rows each, 5 bits used). */
  cgram: Uint8Array;
}

export class HD44780 {
  private ddram = new Uint8Array(0x80).fill(0x20);
  readonly cgram = new Uint8Array(64);
  private addr = 0;
  private cgMode = false;
  private increment = true;
  private eightBit = true;
  private pending: number | null = null;
  display = false;
  cursor = false;
  blink = false;
  backlight = true;
  /** Bumped on every change, so a view knows when to redraw. */
  version = 0;

  /** 4 data lines (D4–D7) latched on the enable pin's falling edge. */
  nibble(rs: boolean, value: number) {
    if (this.eightBit) {
      // Before "4-bit mode", each nibble is a whole byte with D0–D3 low.
      this.byte(rs, (value & 0x0f) << 4);
      return;
    }
    if (this.pending === null) {
      this.pending = value & 0x0f;
      return;
    }
    const b = (this.pending << 4) | (value & 0x0f);
    this.pending = null;
    this.byte(rs, b);
  }

  byte(rs: boolean, b: number) {
    this.version++;
    if (rs) return this.data(b);
    if (b & 0x80) {
      this.cgMode = false;
      this.addr = b & 0x7f;
    } else if (b & 0x40) {
      this.cgMode = true;
      this.addr = b & 0x3f;
    } else if (b & 0x20) {
      this.eightBit = !!(b & 0x10);
      this.pending = null;
    } else if (b & 0x10) {
      // Cursor or display shift: move the cursor (display shifting isn't shown).
      if (!(b & 0x08)) this.addr = this.wrap(this.addr + (b & 0x04 ? 1 : -1));
    } else if (b & 0x08) {
      this.display = !!(b & 0x04);
      this.cursor = !!(b & 0x02);
      this.blink = !!(b & 0x01);
    } else if (b & 0x04) {
      this.increment = !!(b & 0x02);
    } else if (b & 0x02) {
      this.addr = 0;
      this.cgMode = false;
    } else if (b & 0x01) {
      this.ddram.fill(0x20);
      this.addr = 0;
      this.cgMode = false;
      this.increment = true;
    }
  }

  private data(b: number) {
    if (this.cgMode) {
      this.cgram[this.addr & 0x3f] = b & 0x1f;
      this.addr = (this.addr + 1) & 0x3f;
      return;
    }
    this.ddram[this.addr] = b;
    this.addr = this.wrap(this.addr + (this.increment ? 1 : -1));
  }

  /** DDRAM runs 0x00–0x27 (row 0) and 0x40–0x67 (row 1). */
  private wrap(a: number) {
    if (a > 0x67) return 0;
    if (a > 0x27 && a < 0x40) return this.increment ? 0x40 : 0x27;
    if (a < 0) return 0x67;
    return a;
  }

  state(): LcdState {
    const characters = new Uint8Array(32);
    characters.set(this.ddram.subarray(0, 16), 0);
    characters.set(this.ddram.subarray(0x40, 0x50), 16);
    const row = this.addr >= 0x40 ? 1 : 0;
    return {
      characters,
      display: this.display,
      cursor: this.cursor,
      blink: this.blink,
      cursorX: (this.addr - row * 0x40) & 0x3f,
      cursorY: row,
      backlight: this.backlight,
      cgram: this.cgram,
    };
  }

  /** The text shown (custom characters as "?"), for tests and checks. */
  text(): [string, string] {
    const s = this.state();
    const row = (r: number) =>
      Array.from(s.characters.subarray(r * 16, r * 16 + 16), (c) => (c < 8 ? "?" : String.fromCharCode(c))).join("").replace(/\s+$/, "");
    return [row(0), row(1)];
  }
}

/** PCF8574 backpack: P0 RS, P1 RW, P2 EN, P3 backlight, P4–P7 = D4–D7. */
export function lcdI2C(uno: ArduinoUno, lcd: HD44780, address = 0x27) {
  let last = 0;
  const device: I2CDevice = {
    write(b) {
      lcd.backlight = !!(b & 0x08);
      // Enable's falling edge latches the nibble (writes only: RW low).
      if (last & 0x04 && !(b & 0x04) && !(b & 0x02)) lcd.nibble(!!(b & 0x01), b >> 4);
      if ((b ^ last) & 0x08) lcd.version++;
      last = b;
      return true;
    },
    read: () => last | 0xf0,
  };
  uno.i2c.devices.set(address, device);
  return () => uno.i2c.devices.delete(address);
}

/** LiquidCrystal(rs, en, d4, d5, d6, d7): the nibble on D4–D7 latched on EN's falling edge. */
export function lcdParallel(uno: ArduinoUno, lcd: HD44780, pins: { rs: number; en: number; d4: number; d5: number; d6: number; d7: number }) {
  return uno.onPin((pin, high) => {
    if (pin !== pins.en || high) return;
    const v = (uno.isHigh(pins.d4) ? 1 : 0) | (uno.isHigh(pins.d5) ? 2 : 0) | (uno.isHigh(pins.d6) ? 4 : 0) | (uno.isHigh(pins.d7) ? 8 : 0);
    lcd.nibble(uno.isHigh(pins.rs), v);
  });
}
