/**
 * School short names (Tenant.slug, TenantApplication.desired_slug): one rule for
 * the register wizard's live check and the reviewer's approval.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../../db/platform";

const RESERVED = new Set([
  "www", "mis", "api", "app", "apps", "admin", "platform", "console", "login", "register", "onboarding", "support",
  "help", "mail", "smtp", "ftp", "static", "cdn", "files", "assets", "status", "billing", "auth", "sso", "oauth",
  "tupo", "taskmentor", "tendo", "tmcode", "desktop", "nga", "amashuri", "test", "demo", "root", "system",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizeSlug(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A slug proposal from a school name ("G.S. Kicukiro" -> "gs-kicukiro"). */
export const slugFromName = (name: string) => normalizeSlug(String(name ?? "").replace(/\./g, ""));

export type SlugCheck = { slug: string; available: boolean; suggestion: string | null; reason?: "FORMAT" | "RESERVED" | "TAKEN" };

async function taken(slug: string, excludeApplicationId?: number): Promise<boolean> {
  try {
    const [t] = await controlPool().query<RowDataPacket[]>("SELECT 1 FROM Tenant WHERE slug = ? LIMIT 1", [slug]);
    if (t.length) return true;
    const [a] = await controlPool().query<RowDataPacket[]>(
      "SELECT 1 FROM TenantApplication WHERE desired_slug = ? AND status NOT IN ('REJECTED','WITHDRAWN','EXPIRED','DRAFT') AND application_id <> ? LIMIT 1",
      [slug, excludeApplicationId ?? 0],
    );
    return a.length > 0;
  } catch (err) {
    if (isControlPlaneMissing(err)) return false;
    throw err;
  }
}

export async function checkSlug(raw: string, opts: { excludeApplicationId?: number } = {}): Promise<SlugCheck> {
  const slug = normalizeSlug(raw);
  const suggest = async (): Promise<string | null> => {
    const base = (slug || "school").slice(0, 34).replace(/-+$/, "");
    for (let i = 2; i < 50; i++) {
      const s = `${base}-${i}`;
      if (SLUG_RE.test(s) && !RESERVED.has(s) && !(await taken(s, opts.excludeApplicationId))) return s;
    }
    return null;
  };
  if (!SLUG_RE.test(slug)) return { slug, available: false, suggestion: slug.length >= 3 ? await suggest() : null, reason: "FORMAT" };
  if (RESERVED.has(slug)) return { slug, available: false, suggestion: await suggest(), reason: "RESERVED" };
  if (await taken(slug, opts.excludeApplicationId)) return { slug, available: false, suggestion: await suggest(), reason: "TAKEN" };
  return { slug, available: true, suggestion: null };
}
