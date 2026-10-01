import net from "net";

/**
 * IP helpers. Storage matches MySQL INET6_ATON: 4 bytes for IPv4 (including
 * IPv4-mapped IPv6 such as ::ffff:1.2.3.4) and 16 bytes for IPv6. INET6_NTOA in SQL
 * and `ipToString` here both read it back.
 */

/** Normalise whatever Express / a relay hands us into a plain IP string, or null. */
export const normalizeIp = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  let ip = raw.trim();
  if (!ip) return null;
  // X-Forwarded-For style list: the left-most entry is the client.
  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  // [v6]:port or v4:port
  const bracket = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) ip = bracket[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  // Zone index (fe80::1%eth0)
  ip = ip.replace(/%.*$/, "");
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  return net.isIP(ip) ? ip.toLowerCase() : null;
};

const expandV6 = (ip: string): number[] => {
  // Embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4)
  let tail: number[] = [];
  const v4 = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const b = v4[1].split(".").map(Number);
    tail = [(b[0] << 8) | b[1], (b[2] << 8) | b[3]];
    ip = ip.slice(0, ip.length - v4[1].length) + "0:0";
  }
  const [head, rest] = ip.split("::");
  const h = head ? head.split(":").filter(Boolean) : [];
  const r = rest !== undefined && rest ? rest.split(":").filter(Boolean) : [];
  const fill = ip.includes("::") ? 8 - h.length - r.length : 0;
  const groups = [...h, ...Array(fill).fill("0"), ...r].map((g) => parseInt(g, 16) || 0);
  if (tail.length) groups.splice(6, 2, ...tail);
  return groups.slice(0, 8);
};

export const ipToBuffer = (ip: string | null | undefined): Buffer | null => {
  const n = normalizeIp(ip ?? "");
  if (!n) return null;
  if (net.isIPv4(n)) return Buffer.from(n.split(".").map(Number));
  const g = expandV6(n);
  const buf = Buffer.alloc(16);
  g.forEach((v, i) => buf.writeUInt16BE(v, i * 2));
  return buf;
};

export const ipToString = (buf: Buffer | null | undefined): string | null => {
  if (!buf || !Buffer.isBuffer(buf)) return null;
  if (buf.length === 4) return Array.from(buf).join(".");
  if (buf.length !== 16) return null;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(buf.readUInt16BE(i).toString(16));
  // Compress the longest run of zero groups.
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return groups.join(":");
  const left = groups.slice(0, best).join(":");
  const right = groups.slice(best + bestLen).join(":");
  return `${left}::${right}`;
};

/** Parse "a.b.c.d/nn", "v6/nn" or a bare IP into a matcher. */
export const parseCidr = (cidr: string): { buf: Buffer; bits: number } | null => {
  const [addr, len] = cidr.trim().split("/");
  const buf = ipToBuffer(addr);
  if (!buf) return null;
  const max = buf.length * 8;
  const bits = len === undefined ? max : Number(len);
  if (!Number.isInteger(bits) || bits < 0 || bits > max) return null;
  return { buf, bits };
};

export const cidrContains = (cidr: { buf: Buffer; bits: number }, ip: Buffer | null): boolean => {
  if (!ip || ip.length !== cidr.buf.length) return false;
  const full = Math.floor(cidr.bits / 8);
  for (let i = 0; i < full; i++) if (ip[i] !== cidr.buf[i]) return false;
  const rem = cidr.bits % 8;
  if (rem === 0) return true;
  const mask = (0xff << (8 - rem)) & 0xff;
  return (ip[full] & mask) === (cidr.buf[full] & mask);
};

const PRIVATE = [
  "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10",
  "169.254.0.0/16", "0.0.0.0/8", "::1/128", "fc00::/7", "fe80::/10",
].map((c) => parseCidr(c)!);

export const isPrivateIp = (ip: Buffer | null): boolean =>
  !!ip && PRIVATE.some((c) => cidrContains(c, ip));
