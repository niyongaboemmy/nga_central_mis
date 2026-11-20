import { useEffect, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { PRIMARY_TID } from "../lib/tenant";

/**
 * The signed-in school's name and logo for the app chrome (MIS-S10).
 *
 * Every school -- NGA included -- shows the logo uploaded on its School record
 * (Tenants & Schools → Logo), read from the public GET /tenant/branding. When a
 * school has no logo, or the image can't load, `<TenantLogo>` falls back: NGA to
 * its built-in shield, other schools to their initial.
 *
 * The last school seen in this browser is remembered (`nga.lastSchool`, branding
 * only -- no personal data) so the sign-in page can show that school's logo.
 */
export interface TenantBranding {
  isPrimary: boolean;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

interface BrandingData {
  name: string;
  slug?: string;
  school_name?: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

const cache = new Map<string, Promise<BrandingData | null>>();
export const BRANDING_CHANGED = "nga:branding-changed";
const LAST_SCHOOL_KEY = "nga.lastSchool";

export function loadBranding(slug: string): Promise<BrandingData | null> {
  let hit = cache.get(slug);
  if (!hit) {
    hit = api
      // No slug: the caller's own school (NGA for a stranger).
      .get(slug ? `/tenant/branding?slug=${encodeURIComponent(slug)}` : "/tenant/branding")
      .then((r) => (r.data?.data as BrandingData) ?? null)
      .catch(() => {
        cache.delete(slug); // a network blip must not stick for the whole page load
        return null;
      });
    cache.set(slug, hit);
  }
  return hit;
}

export const __resetBrandingCache = () => cache.clear();

/** Call after a logo or school name changes: every mounted logo reloads. */
export function refreshBranding(): void {
  cache.clear();
  try {
    window.dispatchEvent(new Event(BRANDING_CHANGED));
  } catch {
    /* no window (tests) */
  }
}

export interface LastSchool {
  slug: string;
  name: string;
  logoUrl: string | null;
  isPrimary: boolean;
}

export function readLastSchool(): LastSchool | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_SCHOOL_KEY) || "null");
    return v && typeof v.slug === "string" && typeof v.name === "string" ? v : null;
  } catch {
    return null;
  }
}

function rememberSchool(s: LastSchool): void {
  try {
    localStorage.setItem(LAST_SCHOOL_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the sign-in page shows the default mark */
  }
}

let defaultFavicon: string | null = null;
/** Points the tab icon at `url`, or back to the build's own icon. */
function setFavicon(url: string | null): void {
  try {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    if (defaultFavicon === null) defaultFavicon = link.getAttribute("href") || "/favicon.ico";
    const next = url || defaultFavicon;
    if (link.getAttribute("href") === next) return;
    link.setAttribute("href", next);
    if (url) link.removeAttribute("type");
  } catch {
    /* no document */
  }
}

export function useTenantBranding(): TenantBranding {
  const { user } = useUser();
  const tenant = user?.tenant ?? null;
  const primary = !tenant || tenant.isPrimary || tenant.tid === PRIMARY_TID;
  // Without a tenant block (single-school installs, older tokens) the server answers for the caller.
  const slug = tenant?.slug || "";
  const signedIn = !!user;
  const [data, setData] = useState<BrandingData | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(BRANDING_CHANGED, bump);
    return () => window.removeEventListener(BRANDING_CHANGED, bump);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!signedIn) {
      setData(null);
      return;
    }
    void loadBranding(slug).then((d) => {
      if (!alive) return;
      setData(d);
      if (d) rememberSchool({ slug, name: (primary ? null : d.name) || tenant?.name || d.name, logoUrl: d.logo_url ?? null, isPrimary: primary });
    });
    return () => {
      alive = false;
    };
  }, [signedIn, slug, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser tab icon follows the school's logo too.
  const logoUrl = data?.logo_url ?? null;
  useEffect(() => {
    setFavicon(signedIn ? logoUrl : null);
  }, [signedIn, logoUrl]);

  if (primary) return { isPrimary: true, name: "NGA MIS", logoUrl: data?.logo_url ?? null, primaryColor: data?.primary_color ?? null };
  return {
    isPrimary: false,
    name: data?.name || tenant!.name,
    logoUrl: data?.logo_url ?? null,
    primaryColor: data?.primary_color ?? null,
  };
}
