/**
 * Uploading firmware to a real Arduino Uno / Nano from the browser (Web Serial: Chrome and Edge
 * on computers). The board's bootloader (Optiboot on the Uno, 115200 baud; old Nanos 57600)
 * speaks STK500v1: reset the board (DTR), sync, check it's an ATmega328P, write the flash page by
 * page (128 bytes), read it back to verify, leave programming mode. The sketch then starts.
 */
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

export type UploadStage = "connecting" | "writing" | "verifying" | "done";
export interface UploadProgress {
  stage: UploadStage;
  /** 0–1 within the stage. */
  fraction: number;
}

export class UploadError extends Error {
  constructor(
    readonly code: "NO_SYNC" | "WRONG_CHIP" | "TIMEOUT" | "VERIFY" | "PORT",
    message: string,
  ) {
    super(message);
  }
}

const OK = 0x10;
const INSYNC = 0x14;
const EOP = 0x20;
const PAGE = 128;
/** ATmega328P (Uno, Nano, Pro Mini 5 V). */
const SIGNATURE = [0x1e, 0x95, 0x0f];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads exact byte counts with a deadline, from a stream that delivers chunks. */
class ByteReader {
  private buf: number[] = [];
  private pending: Promise<void> | null = null;
  private done = false;
  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}
  private pump() {
    if (!this.pending && !this.done)
      this.pending = this.reader.read().then(
        ({ value, done }) => {
          if (done) this.done = true;
          if (value) this.buf.push(...value);
          this.pending = null;
        },
        () => {
          this.done = true;
          this.pending = null;
        },
      );
    return this.pending;
  }
  async read(n: number, timeoutMs: number): Promise<number[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length < n) {
      const left = deadline - Date.now();
      if (left <= 0 || this.done) throw new UploadError("TIMEOUT", "The board stopped answering.");
      const p = this.pump();
      if (p) await Promise.race([p, sleep(left)]);
    }
    return this.buf.splice(0, n);
  }
  /** Drops what the board sent before (the sketch's own Serial output, a half answer). */
  async drain(ms = 50) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const p = this.pump();
      if (p) await Promise.race([p, sleep(end - Date.now())]);
    }
    this.buf = [];
  }
}

export async function uploadToBoard(
  port: SerialPortLike,
  program: Uint8Array,
  usedBytes: number,
  opts: { baudRate?: number; onProgress?: (p: UploadProgress) => void; verify?: boolean } = {},
): Promise<void> {
  const progress = opts.onProgress ?? (() => undefined);
  try {
    await port.open({ baudRate: opts.baudRate ?? 115200 });
  } catch (e) {
    throw new UploadError("PORT", `The port couldn't be opened (${(e as Error)?.message || "busy"}). Close the Arduino IDE's Serial Monitor or any other program using the board, then try again.`);
  }
  const writer = port.writable!.getWriter();
  const reader = port.readable!.getReader();
  const r = new ByteReader(reader);
  const send = (bytes: number[]) => writer.write(Uint8Array.from(bytes));
  /** One command; the bootloader answers INSYNC, `extra` bytes, OK. */
  const command = async (bytes: number[], extra = 0, timeoutMs = 400) => {
    await send(bytes);
    const head = await r.read(1, timeoutMs);
    if (head[0] !== INSYNC) throw new UploadError("NO_SYNC", "The board answered something unexpected.");
    const body = extra ? await r.read(extra, timeoutMs) : [];
    const tail = await r.read(1, timeoutMs);
    if (tail[0] !== OK) throw new UploadError("NO_SYNC", "The board refused a command.");
    return body;
  };

  try {
    progress({ stage: "connecting", fraction: 0 });
    // Auto-reset: DTR low then high restarts the board into its bootloader for a moment.
    await port.setSignals?.({ dataTerminalReady: false, requestToSend: false });
    await sleep(250);
    await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
    await sleep(50);
    let synced = false;
    for (let i = 0; i < 10 && !synced; i++) {
      await r.drain(i ? 50 : 20);
      try {
        await command([0x30, EOP], 0, 250);
        synced = true;
      } catch {
        progress({ stage: "connecting", fraction: (i + 1) / 10 });
      }
    }
    if (!synced) {
      throw new UploadError(
        "NO_SYNC",
        "No answer from the board's bootloader. Check it's an Arduino Uno or Nano with its USB cable plugged in; an old Nano may need the 57600 baud option.",
      );
    }
    const sig = await command([0x75, EOP], 3);
    if (sig.some((b, i) => b !== SIGNATURE[i])) {
      throw new UploadError("WRONG_CHIP", `This board isn't an ATmega328P (Uno/Nano): its signature is ${sig.map((b) => b.toString(16).padStart(2, "0")).join(" ")}.`);
    }
    await command([0x50, EOP]); // enter programming mode

    const pages = Math.max(1, Math.ceil(usedBytes / PAGE));
    for (let p = 0; p < pages; p++) {
      const addr = p * PAGE;
      const word = addr >> 1;
      await command([0x55, word & 0xff, word >> 8, EOP]);
      const data = Array.from(program.subarray(addr, addr + PAGE));
      while (data.length < PAGE) data.push(0xff);
      await command([0x64, 0x00, PAGE, 0x46, ...data, EOP], 0, 1000);
      progress({ stage: "writing", fraction: (p + 1) / pages });
    }
    if (opts.verify !== false) {
      for (let p = 0; p < pages; p++) {
        const addr = p * PAGE;
        const word = addr >> 1;
        await command([0x55, word & 0xff, word >> 8, EOP]);
        const got = await command([0x74, 0x00, PAGE, 0x46, EOP], PAGE, 1000);
        for (let i = 0; i < PAGE && addr + i < usedBytes; i++) {
          if (got[i] !== program[addr + i]) throw new UploadError("VERIFY", `Verification failed at byte ${addr + i}: the board holds something else. Try again.`);
        }
        progress({ stage: "verifying", fraction: (p + 1) / pages });
      }
    }
    await command([0x51, EOP]); // leave programming mode: the sketch starts
    progress({ stage: "done", fraction: 1 });
  } finally {
    // A port only closes once its streams are released (a pending read is cancelled first).
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
      writer.releaseLock();
    } catch {
      /* already released */
    }
    await port.close().catch(() => undefined);
  }
}

/** Web Serial is there (Chrome / Edge on a computer, served over HTTPS). */
export const canUploadFromBrowser = () => typeof navigator !== "undefined" && "serial" in navigator;
