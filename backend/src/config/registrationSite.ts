/**
 * The public registration site (amashuri.com) is the same frontend build as the MIS,
 * served on its own host, and calls this API cross-origin: the session check, the
 * school registration endpoints and visit analytics (/activity/config, /activity/sync).
 *
 * Its origins are added to the API's CORS allowlist and to the activity origin
 * allowlist automatically -- from REGISTRATION_SITE_URL (and its www / bare twin) plus
 * the product's own https://amashuri.com and https://www.amashuri.com -- so analytics
 * on the registration site never depends on someone remembering to extend
 * CORS_ORIGIN / ACTIVITY_ORIGINS in production (GAP-B).
 */
type Env = Record<string, string | undefined>;

export const AMASHURI_SITE_ORIGINS = ["https://amashuri.com", "https://www.amashuri.com"] as const;

const originOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
};

/** The registration site's origins: REGISTRATION_SITE_URL, its www twin, amashuri.com and www. */
export function registrationSiteOrigins(env: Env = process.env): string[] {
  const out = new Set<string>(AMASHURI_SITE_ORIGINS);
  const site = originOf(env.REGISTRATION_SITE_URL);
  if (site) {
    out.add(site);
    const u = new URL(site);
    const twin = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    if (u.hostname !== "localhost" && !/^[\d.]+$/.test(u.hostname)) out.add(`${u.protocol}//${twin}${u.port ? `:${u.port}` : ""}`);
  }
  return [...out];
}

/** `origins` plus the registration site's, without duplicates (trailing slashes ignored). */
export function withRegistrationSiteOrigins(origins: string | string[], env: Env = process.env): string[] {
  const list = (Array.isArray(origins) ? origins : [origins]).map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [...new Set([...list, ...registrationSiteOrigins(env)])];
}
