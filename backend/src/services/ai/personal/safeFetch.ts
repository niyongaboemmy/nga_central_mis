import dns from "dns";
import https from "https";
import net from "net";
import { Readable } from "stream";

/**
 * fetch() for addresses a user typed (custom OpenAI-compatible endpoints in My AI), with
 * the OWASP SSRF rules (PERSONAL_AI_PROVIDERS_PLAN.md §7.3):
 *
 * - https only, standard port 443 only;
 * - every address the name resolves to must be public: loopback, private (RFC 1918),
 *   link-local (incl. 169.254.169.254 metadata), CGNAT, ULA, multicast and reserved
 *   ranges are refused;
 * - the check runs inside the connection's own DNS lookup, so the socket connects to the
 *   address that was checked (no DNS-rebinding window), with SNI/Host left as typed;
 * - redirects are never followed; responses over the size cap are cut off.
 */

export class UnsafeUrlError extends Error {
  readonly code = "UNSAFE_URL";
}

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Blocked(ip);
  if (!net.isIPv6(ip)) return true;
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return ipv4Blocked(mapped[1]);
  return (
    v === "::" ||
    v === "::1" ||
    v.startsWith("fc") ||
    v.startsWith("fd") || // unique local
    /^fe[89ab]/.test(v) || // link-local
    v.startsWith("ff") || // multicast
    v.startsWith("64:ff9b:") || // NAT64
    v.startsWith("2001:db8") // documentation
  );
}

/** Syntax and policy checks that need no network. Throws UnsafeUrlError. */
export function checkEndpointUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid web address.");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("The address must start with https://.");
  if (u.username || u.password) throw new UnsafeUrlError("Put the key in the key field, not in the address.");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("Only the standard https port is allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) throw new UnsafeUrlError("That address is on a private network.");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new UnsafeUrlError("That address is on a private network.");
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup that refuses any non-public answer; used as the socket's own lookup. */
export function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, [] as dns.LookupAddress[]);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      return cb(Object.assign(new UnsafeUrlError("That address is on a private network."), { code: "UNSAFE_URL" }) as any, [] as dns.LookupAddress[]);
    }
    if ((options as any).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

function headersObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => (out[key] = value));
  return out;
}

/** A fetch-compatible function (usable as the OpenAI SDK's `fetch`) with the rules above. */
export const safeFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
  const url = checkEndpointUrl(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const body = init.body == null ? undefined : typeof init.body === "string" ? init.body : Buffer.from(await new Response(init.body).arrayBuffer());

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method ?? "GET",
        headers: headersObject(headers),
        lookup: safeLookup as any,
        agent: false,
        timeout: 150_000,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        if (status >= 300 && status < 400) {
          res.resume();
          return reject(new UnsafeUrlError("The endpoint tried to redirect; redirects are not followed."));
        }
        let seen = 0;
        res.on("data", (c: Buffer) => {
          seen += c.length;
          if (seen > MAX_RESPONSE_BYTES) res.destroy(new Error("Response too large"));
        });
        const out = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v != null) out.set(k, Array.isArray(v) ? v.join(", ") : String(v));
        resolve(new Response(status === 204 ? null : (Readable.toWeb(res) as any), { status, statusText: res.statusMessage, headers: out }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
    if (body) req.write(body);
    req.end();
  });
};
