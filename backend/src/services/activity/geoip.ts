import fs from "fs";
import path from "path";
import logger from "../../utils/logger";
import { ipToBuffer, isPrivateIp, normalizeIp } from "./ip";

/**
 * Offline IP → location / ISP lookup (plan §7.2). No third party ever sees an IP.
 *
 * Reads MaxMind-format databases from GEOIP_DIR (default /var/lib/nga-geo):
 *   - DB-IP Lite (CC BY 4.0):  dbip-city-lite.mmdb + dbip-asn-lite.mmdb   (default)
 *   - MaxMind GeoLite2:        GeoLite2-City.mmdb + GeoLite2-ASN.mmdb
 * Whichever files exist are used. Missing files mean "unknown". Collection never
 * depends on GeoIP being installed.
 *
 * Accuracy: country and ISP are reliable. The city is approximate, especially on mobile
 * carriers that use carrier-grade NAT (MTN, Airtel). The UI labels it "≈".
 */
export interface GeoInfo {
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  asn: number | null;
  isp: string | null;
  conn_type: "mobile" | "fixed" | "hosting" | "education" | "private" | "unknown";
}

export const UNKNOWN_GEO: GeoInfo = {
  country_code: null, country: null, region: null, city: null, lat: null, lon: null,
  asn: null, isp: null, conn_type: "unknown",
};
const PRIVATE_GEO: GeoInfo = { ...UNKNOWN_GEO, isp: "Private network", conn_type: "private" };

type Lookup = (ip: string) => GeoInfo;
let override: Lookup | null = null;
/** Tests inject a deterministic provider. */
export const setGeoProvider = (fn: Lookup | null) => {
  override = fn;
  cache.clear();
};

// ---------------------------------------------------------------------------
// Connection type from the ASN / ISP name. A curated list beats guessing: it covers
// the Rwandan carriers and ISPs we actually see, plus the big clouds (bot signal).
// ---------------------------------------------------------------------------
// Classified by the ASN organisation name (DB-IP / GeoLite2 spell it e.g. "MTN RWANDACELL",
// "Airtel Rwanda", "Liquid Telecommunications Rwanda"). Admins can still label ranges.
const HOSTING_RE =
  /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|vultr|contabo|oracle|alibaba|tencent|cloudflare|leaseweb|scaleway|choopa|m247|datacamp|hostinger|godaddy|ionos|colo|hosting|server|data ?cent/i;
const MOBILE_RE = /mtn|airtel|vodacom|safaricom|tigo|orange|mobile|cellular|wireless|lte|telecel/i;
const EDU_RE = /univ|college|school|education|rwednet|ren\b|research/i;

export const classifyConnection = (asn: number | null, isp: string | null): GeoInfo["conn_type"] => {
  const name = isp || "";
  if (!name) return "unknown";
  if (HOSTING_RE.test(name)) return "hosting";
  if (EDU_RE.test(name)) return "education";
  if (MOBILE_RE.test(name)) return "mobile";
  return "fixed";
};

// ---------------------------------------------------------------------------
// mmdb readers (lazy, hot-reloaded when the files change on disk)
// ---------------------------------------------------------------------------
let cityReader: any = null;
let asnReader: any = null;
let loadedFrom: { city: string | null; asn: string | null; mtime: number } = { city: null, asn: null, mtime: 0 };
let lastCheck = 0;

const geoDir = () => process.env.GEOIP_DIR || "/var/lib/nga-geo";
const pick = (names: string[]) => {
  for (const n of names) {
    const p = path.join(geoDir(), n);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const ensureReaders = () => {
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  try {
    const city = pick(["dbip-city-lite.mmdb", "GeoLite2-City.mmdb", "dbip-city.mmdb"]);
    const asn = pick(["dbip-asn-lite.mmdb", "GeoLite2-ASN.mmdb", "dbip-asn.mmdb"]);
    const mtime = Math.max(city ? fs.statSync(city).mtimeMs : 0, asn ? fs.statSync(asn).mtimeMs : 0);
    if (city === loadedFrom.city && asn === loadedFrom.asn && mtime === loadedFrom.mtime) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Reader } = require("maxmind");
    cityReader = city ? new Reader(fs.readFileSync(city)) : null;
    asnReader = asn ? new Reader(fs.readFileSync(asn)) : null;
    loadedFrom = { city, asn, mtime };
    cache.clear();
    if (city || asn) logger.info(`[activity] GeoIP loaded: ${city ?? "-"} / ${asn ?? "-"}`);
  } catch (error) {
    logger.error("[activity] GeoIP load failed", { error });
    cityReader = null;
    asnReader = null;
  }
};

/** When the GeoIP files were last updated (Settings shows it, and an alert fires past 45 days). */
export const geoDbStatus = () => {
  ensureReaders();
  return {
    dir: geoDir(),
    city: loadedFrom.city,
    asn: loadedFrom.asn,
    updated_at: loadedFrom.mtime ? new Date(loadedFrom.mtime).toISOString() : null,
    age_days: loadedFrom.mtime ? Math.floor((Date.now() - loadedFrom.mtime) / 86_400_000) : null,
    provider: loadedFrom.city?.includes("GeoLite2") ? "MaxMind GeoLite2" : loadedFrom.city ? "DB-IP Lite" : null,
  };
};

const fromMmdb: Lookup = (ip) => {
  ensureReaders();
  const g: GeoInfo = { ...UNKNOWN_GEO };
  try {
    const c = cityReader?.get(ip);
    if (c) {
      g.country_code = c.country?.iso_code ?? null;
      g.country = c.country?.names?.en ?? null;
      g.region = c.subdivisions?.[0]?.names?.en ?? null;
      g.city = c.city?.names?.en ?? null;
      g.lat = typeof c.location?.latitude === "number" ? c.location.latitude : null;
      g.lon = typeof c.location?.longitude === "number" ? c.location.longitude : null;
    }
    const a = asnReader?.get(ip);
    if (a) {
      g.asn = a.autonomous_system_number ?? null;
      g.isp = a.autonomous_system_organization ?? null;
    }
  } catch {
    /* malformed IP for the reader: unknown */
  }
  g.conn_type = classifyConnection(g.asn, g.isp);
  return g;
};

const cache = new Map<string, GeoInfo>();
const CACHE_MAX = 20_000;

export const lookupGeo = (rawIp: string | null | undefined): GeoInfo => {
  const ip = normalizeIp(rawIp ?? "");
  if (!ip) return UNKNOWN_GEO;
  const hit = cache.get(ip);
  if (hit) return hit;
  const g = isPrivateIp(ipToBuffer(ip)) ? PRIVATE_GEO : (override ?? fromMmdb)(ip);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(ip, g);
  return g;
};

/** Stable key for the AnalyticsGeo dimension row. */
export const geoKey = (g: GeoInfo) =>
  require("crypto")
    .createHash("sha1")
    .update([g.country_code, g.region, g.city, g.asn, g.isp, g.conn_type].join("|"))
    .digest("hex");
