import { APP_CODE, APP_BY_CODE, AppKey } from "./apps";
import { exec, q } from "./db";
import { clock } from "./runtime";

/**
 * Feature catalog (plan §5.4): each app pushes its route patterns → named features,
 * and which events count as key events. Cached here for the ingest hot path and for
 * labelling reports.
 */
export interface FeatureDef {
  key: string;
  label: string;
  module?: string | null;
  patterns?: string[];
  event?: boolean;
  key_event?: boolean;
  public?: boolean;
}

interface Cached {
  at: number;
  byApp: Map<AppKey, Map<string, FeatureDef>>;
}
let cache: Cached | null = null;
const TTL = 60_000;

export const loadCatalog = async (force = false) => {
  if (!force && cache && clock.now() - cache.at < TTL) return cache.byApp;
  const byApp = new Map<AppKey, Map<string, FeatureDef>>();
  try {
    const rows = await q<any>("SELECT app, feature_key, label, module, patterns, is_event, key_event, is_public FROM AnalyticsFeature");
    for (const r of rows) {
      const app = APP_BY_CODE[r.app];
      if (!app) continue;
      if (!byApp.has(app)) byApp.set(app, new Map());
      byApp.get(app)!.set(r.feature_key, {
        key: r.feature_key,
        label: r.label,
        module: r.module,
        patterns: typeof r.patterns === "string" ? JSON.parse(r.patterns) : r.patterns ?? [],
        event: !!r.is_event,
        key_event: !!r.key_event,
        public: !!r.is_public,
      });
    }
  } catch {
    /* un-migrated: empty */
  }
  cache = { at: clock.now(), byApp };
  return byApp;
};

export const cachedCatalog = () => cache?.byApp ?? new Map<AppKey, Map<string, FeatureDef>>();

export const isKeyEvent = (app: AppKey, name: string) => !!cachedCatalog().get(app)?.get(name)?.key_event;

export const featureLabel = (app: AppKey, key: string | null | undefined) =>
  (key && cachedCatalog().get(app)?.get(key)?.label) || null;

/** Turn a client-supplied feature key into a stored one: known, well-formed, or "<app>.other". */
export const normalizeFeature = (app: AppKey, f: string | undefined | null): string | null => {
  if (!f) return null;
  if (!/^[a-z0-9_.-]{1,80}$/.test(f)) return `${app}.other`;
  return f;
};

/** Replace an app's catalog (PUT /monitor/catalog/:app). */
export const saveCatalog = async (app: AppKey, version: string | null, features: FeatureDef[]) => {
  const clean = features
    .filter((f) => f && typeof f.key === "string" && /^[a-z0-9_.-]{1,80}$/.test(f.key) && typeof f.label === "string")
    .slice(0, 1000);
  for (let i = 0; i < clean.length; i += 200) {
    const part = clean.slice(i, i + 200);
    await exec(
      `INSERT INTO AnalyticsFeature (app, feature_key, label, module, patterns, is_event, key_event, is_public, version, updated_at)
       VALUES ${part.map(() => "(?,?,?,?,CAST(? AS JSON),?,?,?,?,UTC_TIMESTAMP(3))").join(",")}
       ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), patterns = VALUES(patterns),
         is_event = VALUES(is_event), key_event = VALUES(key_event), is_public = VALUES(is_public),
         version = VALUES(version), updated_at = VALUES(updated_at)`,
      part.flatMap((f) => [
        APP_CODE[app],
        f.key,
        f.label.slice(0, 120),
        f.module ? String(f.module).slice(0, 60) : null,
        JSON.stringify((f.patterns ?? []).filter((p) => typeof p === "string").slice(0, 20)),
        f.event ? 1 : 0,
        f.key_event ? 1 : 0,
        f.public ? 1 : 0,
        version ? String(version).slice(0, 20) : null,
      ]),
    );
  }
  // Features dropped from the catalog are removed (their history keeps the key).
  if (clean.length) {
    await exec(`DELETE FROM AnalyticsFeature WHERE app = ? AND feature_key NOT IN (?)`, [APP_CODE[app], clean.map((f) => f.key)]);
  }
  cache = null;
  return clean.length;
};
