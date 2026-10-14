import { describe, expect, it } from "vitest";
import { uploadToBoard, UploadError, type SerialPortLike, type UploadProgress } from "../stk500";

/** An Optiboot bootloader on a USB-serial port, in memory: it answers STK500v1 as an Uno does. */
function fakeUno(opts: { signature?: number[]; silent?: boolean; corrupt?: boolean; noise?: number[] } = {}) {
  const flash = new Uint8Array(32768).fill(0xff);
  let out: ReadableStreamDefaultController<Uint8Array>;
  let inBoot = false;
  let addr = 0;
  let buf: number[] = [];
  const log: string[] = [];
  const reply = (bytes: number[]) => out.enqueue(Uint8Array.from(bytes));
  const handle = () => {
    for (;;) {
      if (!buf.length) return;
      const c = buf[0];
      const need = c === 0x55 ? 4 : c === 0x64 ? 5 + ((buf[1] << 8) | buf[2]) : c === 0x74 ? 5 : 2;
      if (buf.length < need) return;
      const cmd = buf.splice(0, need);
      if (opts.silent || !inBoot) continue;
      if (cmd[cmd.length - 1] !== 0x20) continue;
      log.push(cmd[0].toString(16));
      if (c === 0x30 || c === 0x50 || c === 0x51) reply([0x14, 0x10]);
      else if (c === 0x75) reply([0x14, ...(opts.signature ?? [0x1e, 0x95, 0x0f]), 0x10]);
      else if (c === 0x55) {
        addr = (cmd[1] | (cmd[2] << 8)) * 2;
        reply([0x14, 0x10]);
      } else if (c === 0x64) {
        const n = (cmd[1] << 8) | cmd[2];
        flash.set(cmd.slice(4, 4 + n), addr);
        reply([0x14, 0x10]);
      } else if (c === 0x74) {
        const n = (cmd[1] << 8) | cmd[2];
        const data = Array.from(flash.subarray(addr, addr + n));
        if (opts.corrupt) data[3] ^= 0xff;
        reply([0x14, ...data, 0x10]);
      }
    }
  };
  const port: SerialPortLike & { opened: number | null; closed: boolean } = {
    opened: null,
    closed: false,
    async open({ baudRate }) {
      this.opened = baudRate;
    },
    async close() {
      this.closed = true;
    },
    async setSignals(s) {
      // DTR raised: the board resets into its bootloader (after printing its sketch's noise).
      if (s.dataTerminalReady) {
        inBoot = true;
        if (opts.noise) reply(opts.noise);
      }
    },
    readable: new ReadableStream<Uint8Array>({ start: (c) => void (out = c) }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        buf.push(...chunk);
        handle();
      },
    }),
  };
  return { port, flash, log };
}

const program = (n: number) => Uint8Array.from({ length: 32768 }, (_, i) => (i < n ? (i * 7 + 3) & 0xff : 0xff));

describe("uploadToBoard (STK500v1, as avrdude does)", () => {
  it("writes the firmware page by page, verifies it and starts the sketch", async () => {
    const { port, flash, log } = fakeUno({ noise: [0x48, 0x69, 0x0d, 0x0a] });
    const steps: UploadProgress[] = [];
    await uploadToBoard(port, program(300), 300, { onProgress: (p) => steps.push(p) });
    expect(port.opened).toBe(115200);
    expect(port.closed).toBe(true);
    expect(Array.from(flash.subarray(0, 300))).toEqual(Array.from(program(300).subarray(0, 300)));
    expect(log[0]).toBe("30");
    expect(log.filter((c) => c === "64")).toHaveLength(3); // 300 bytes → 3 pages of 128
    expect(log[log.length - 1]).toBe("51");
    expect(steps.map((s) => s.stage)).toContain("writing");
    expect(steps[steps.length - 1]).toEqual({ stage: "done", fraction: 1 });
  });

  it("uses the baud rate asked for (old Nano bootloader: 57600)", async () => {
    const { port } = fakeUno();
    await uploadToBoard(port, program(10), 10, { baudRate: 57600 });
    expect(port.opened).toBe(57600);
  });

  it("explains a board that doesn't answer", async () => {
    const { port } = fakeUno({ silent: true });
    await expect(uploadToBoard(port, program(10), 10)).rejects.toMatchObject({ code: "NO_SYNC" });
    expect(port.closed).toBe(true);
  }, 20_000);

  it("refuses a board that isn't an ATmega328P", async () => {
    const { port } = fakeUno({ signature: [0x1e, 0x98, 0x01] }); // a Mega 2560
    const e = await uploadToBoard(port, program(10), 10).catch((x) => x);
    expect(e).toBeInstanceOf(UploadError);
    expect(e.code).toBe("WRONG_CHIP");
    expect(e.message).toMatch(/1e 98 01/);
  });

  it("reports a failed verification", async () => {
    const { port } = fakeUno({ corrupt: true });
    await expect(uploadToBoard(port, program(200), 200)).rejects.toMatchObject({ code: "VERIFY" });
  });
});
