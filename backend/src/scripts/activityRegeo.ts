/**
 * Re-geolocate every IP address Usage & Monitoring has seen (plan §7.2).
 *
 * Run once after the IP-location databases are installed (or replaced): rows written
 * while they were missing point at no place ("Unknown location"). For each IP whose
 * place changes, this repoints every table that stores it -- AnalyticsIp, events,
 * sessions, sign-ins, devices, people -- and then rebuilds the daily rollups of the
 * days those IPs were active, so Locations, maps and labels agree.
 *
 * Idempotent and safe to re-run: an IP whose place is unchanged is skipped.
 *
 *   dev:        npx ts-node src/scripts/activityRegeo.ts [--dry-run]
 *   production: node dist/scripts/activityRegeo.js [--dry-run]
 */
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const dry = process.argv.includes("--dry-run");
  // Imported after dotenv so the activity pool sees the database settings.
  const { q, exec, activityPool } = await import("../services/activity/db");
  const { resolveGeo } = await import("../services/activity/dims");
  const { geoDbStatus } = await import("../services/activity/geoip");
  const { ipToString } = await import("../services/activity/ip");
  const { rollupDay } = await import("../services/activity/rollup");
  const { kigaliDay } = await import("../services/activity/runtime");

  const db = geoDbStatus();
  if (!db.city && !db.asn) {
    console.error(`No IP-location database in ${db.dir}. Run scripts/geoip-update.sh first.`);
    process.exit(1);
  }
  console.log(`Using ${db.provider} (${db.updated_at}) from ${db.dir}${dry ? " — DRY RUN, nothing is written" : ""}`);

  const ips = await q<{ ip: Buffer; geo_id: number | null }>("SELECT ip, geo_id FROM AnalyticsIp");
  const changed: { ip: Buffer; text: string; from: number | null; to: number }[] = [];
  const places = new Map<string, number>();
  for (const r of ips) {
    const text = ipToString(r.ip);
    if (!text) continue;
    const { id, geo } = await resolveGeo(text);
    if (id && id !== r.geo_id) {
      changed.push({ ip: r.ip, text, from: r.geo_id, to: id });
      const label = geo.conn_type === "private" ? "Private network" : [geo.city, geo.country_code].filter(Boolean).join(", ") || geo.isp || "?";
      places.set(label, (places.get(label) ?? 0) + 1);
    }
  }
  console.log(`${ips.length} IPs known, ${changed.length} gain or change a place.`);
  for (const [label, n] of [...places].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${label}`);
  if (dry || changed.length === 0) {
    await activityPool().end();
    return;
  }

  const counts: Record<string, number> = {};
  const bump = (t: string, n: number) => (counts[t] = (counts[t] ?? 0) + n);
  const days = new Set<string>();
  for (const c of changed) {
    bump("AnalyticsIp", (await exec("UPDATE AnalyticsIp SET geo_id = ? WHERE ip = ?", [c.to, c.ip])).affectedRows);
    bump("AnalyticsEvent", (await exec("UPDATE AnalyticsEvent SET geo_id = ? WHERE ip = ? AND (geo_id IS NULL OR geo_id <> ?)", [c.to, c.ip, c.to])).affectedRows);
    bump("AuthEvent", (await exec("UPDATE AuthEvent SET geo_id = ? WHERE ip = ? AND (geo_id IS NULL OR geo_id <> ?)", [c.to, c.ip, c.to])).affectedRows);
    bump("AnalyticsSession", (await exec("UPDATE AnalyticsSession SET geo_id = ? WHERE COALESCE(last_ip, entry_ip) = ? AND (geo_id IS NULL OR geo_id <> ?)", [c.to, c.ip, c.to])).affectedRows);
    bump("AnalyticsDevice", (await exec("UPDATE AnalyticsDevice SET last_geo_id = ? WHERE last_ip = ? AND (last_geo_id IS NULL OR last_geo_id <> ?)", [c.to, c.ip, c.to])).affectedRows);
    bump("AnalyticsUserState", (await exec("UPDATE AnalyticsUserState SET last_geo_id = ? WHERE last_ip = ? AND (last_geo_id IS NULL OR last_geo_id <> ?)", [c.to, c.ip, c.to])).affectedRows);
    const seen = await q<{ t: Date }>("SELECT MIN(occurred_at) AS t FROM AnalyticsEvent WHERE ip = ?", [c.ip]);
    if (seen[0]?.t) days.add(kigaliDay(new Date(seen[0].t).getTime()));
  }
  console.log("Rows repointed:", counts);

  // Rebuild every day from the earliest affected one to today (rollups are per day).
  const sorted = [...days].sort();
  if (sorted.length) {
    const today = kigaliDay(Date.now());
    let n = 0;
    for (let d = sorted[0]; d <= today; d = addDay(d)) {
      await rollupDay(d);
      n++;
    }
    console.log(`Rebuilt ${n} daily rollups (${sorted[0]} → ${today}).`);
  }
  await activityPool().end();
}

const addDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
