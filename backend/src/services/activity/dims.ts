import crypto from "crypto";
import { q, exec } from "./db";
import { GeoInfo, geoKey, lookupGeo } from "./geoip";
import { parseUa, ParsedUa } from "./ua";

/**
 * Dimension rows (AnalyticsUa, AnalyticsGeo) resolved to ids with in-memory caches, so
 * the hot path does at most one insert the first time a UA or place is seen.
 */
const uaCache = new Map<string, { id: number; parsed: ParsedUa }>();
const geoCache = new Map<string, number>();
const CACHE_MAX = 20_000;
const trim = <K, V>(m: Map<K, V>) => {
  if (m.size > CACHE_MAX) m.delete(m.keys().next().value as K);
};

export const resolveUa = async (ua: string | null | undefined): Promise<{ id: number | null; parsed: ParsedUa }> => {
  const s = (ua || "").slice(0, 512);
  const parsed = parseUa(s);
  if (!s) return { id: null, parsed };
  const hash = crypto.createHash("sha256").update(s).digest();
  const key = hash.toString("hex");
  const hit = uaCache.get(key);
  if (hit) return hit;
  await exec(
    `INSERT IGNORE INTO AnalyticsUa (ua_hash, ua, browser, browser_ver, os, os_ver, device_type, is_bot_ua)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [hash, s, parsed.browser, parsed.browser_ver, parsed.os, parsed.os_ver, parsed.device_type, parsed.is_bot_ua ? 1 : 0],
  );
  const rows = await q<{ ua_id: number }>("SELECT ua_id FROM AnalyticsUa WHERE ua_hash = ?", [hash]);
  const entry = { id: rows[0]?.ua_id ?? null, parsed } as { id: number; parsed: ParsedUa };
  if (entry.id) {
    uaCache.set(key, entry);
    trim(uaCache);
  }
  return entry;
};

export const resolveGeo = async (ip: string | null): Promise<{ id: number | null; geo: GeoInfo }> => {
  const geo = lookupGeo(ip);
  if (!ip || (!geo.country_code && !geo.isp && geo.conn_type === "unknown")) return { id: null, geo };
  const key = geoKey(geo);
  const hit = geoCache.get(key);
  if (hit) return { id: hit, geo };
  await exec(
    `INSERT IGNORE INTO AnalyticsGeo (geo_key, country_code, country, region, city, lat, lon, asn, isp, conn_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [key, geo.country_code, geo.country, geo.region, geo.city, geo.lat, geo.lon, geo.asn, geo.isp?.slice(0, 160) ?? null, geo.conn_type],
  );
  const rows = await q<{ geo_id: number }>("SELECT geo_id FROM AnalyticsGeo WHERE geo_key = ?", [key]);
  const id = rows[0]?.geo_id ?? null;
  if (id) {
    geoCache.set(key, id);
    trim(geoCache);
  }
  return { id, geo };
};

/** Geo rows by id for reports / live views (small table, cached). */
const geoById = new Map<number, GeoInfo & { geo_id: number }>();
export const geoRows = async (ids: (number | null | undefined)[]) => {
  const missing = [...new Set(ids.filter((i): i is number => !!i && !geoById.has(i)))];
  if (missing.length) {
    const rows = await q<any>(
      `SELECT geo_id, country_code, country, region, city, lat, lon, asn, isp, conn_type FROM AnalyticsGeo WHERE geo_id IN (?)`,
      [missing],
    );
    for (const r of rows)
      geoById.set(r.geo_id, { ...r, lat: r.lat === null ? null : Number(r.lat), lon: r.lon === null ? null : Number(r.lon) });
  }
  return geoById;
};

export const clearDimCaches = () => {
  uaCache.clear();
  geoCache.clear();
  geoById.clear();
};
