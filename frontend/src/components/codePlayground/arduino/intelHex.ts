/**
 * Intel HEX (what arduino-cli writes, avrdude reads) → the bytes of program memory.
 * Records: 00 data, 01 end of file, 02 extended segment address, 04 extended linear address.
 * Checksums are verified, so a cut-off download is refused instead of half-running.
 */
export const UNO_FLASH_BYTES = 32 * 1024;

export class HexError extends Error {}

export function parseIntelHex(text: string, size = UNO_FLASH_BYTES): { bytes: Uint8Array; used: number } {
  const bytes = new Uint8Array(size).fill(0xff); // erased flash reads 0xFF
  let base = 0;
  let used = 0;
  let ended = false;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (!/^:[0-9A-Fa-f]+$/.test(line) || line.length < 11 || (line.length - 1) % 2) throw new HexError(`Line ${n + 1} isn't Intel HEX.`);
    const rec = Uint8Array.from(line.slice(1).match(/../g)!.map((h) => parseInt(h, 16)));
    const len = rec[0];
    if (rec.length !== len + 5) throw new HexError(`Line ${n + 1}: the length doesn't match.`);
    if (rec.reduce((s, b) => (s + b) & 0xff, 0) !== 0) throw new HexError(`Line ${n + 1}: bad checksum.`);
    const addr = (rec[1] << 8) | rec[2];
    const type = rec[3];
    const data = rec.subarray(4, 4 + len);
    if (type === 0x00) {
      const at = base + addr;
      if (at + len > size) throw new HexError(`The program doesn't fit in ${Math.round(size / 1024)} KB of flash.`);
      bytes.set(data, at);
      used = Math.max(used, at + len);
    } else if (type === 0x01) {
      ended = true;
      break;
    } else if (type === 0x02) base = ((data[0] << 8) | data[1]) << 4;
    else if (type === 0x04) base = ((data[0] << 8) | data[1]) << 16;
    // 03/05 (start addresses) don't matter for an AVR.
  }
  if (!ended) throw new HexError("The firmware is incomplete (no end-of-file record).");
  return { bytes, used };
}
