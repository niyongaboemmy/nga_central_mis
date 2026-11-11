import { useEffect, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import { PRIMARY_TID } from "../lib/tenant";

/**
 * The signed-in school's name and logo for the app chrome (MIS-S10). NGA (tid 1)
 * keeps the built-in look -- `isPrimary` tells the caller to render it unchanged.
 * Other schools: the tenant block from /users/me, plus logo/colour from the public
 * GET /tenant/branding (fetched once per school per page load).
 */
export interface TenantBranding {
  isPrimary: boolean;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

interface BrandingData {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

const cache = new Map<number, Promise<BrandingData | null>>();

export function loadBranding(tid: number, slug: string): Promise<BrandingData | null> {
  let hit = cache.get(tid);
  if (!hit) {
    hit = api
      .get(`/tenant/branding?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.data?.data as BrandingData) ?? null)
      .catch(() => null);
    cache.set(tid, hit);
  }
  return hit;
}

export const __resetBrandingCache = () => cache.clear();

export function useTenantBranding(): TenantBranding {
  const { user } = useUser();
  const tenant = user?.tenant ?? null;
  const primary = !tenant || tenant.isPrimary || tenant.tid === PRIMARY_TID;
  const [data, setData] = useState<BrandingData | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    if (!primary && tenant) void loadBranding(tenant.tid, tenant.slug).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [primary, tenant?.tid, tenant?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (primary) return { isPrimary: true, name: "NGA MIS", logoUrl: null, primaryColor: null };
  return {
    isPrimary: false,
    name: data?.name || tenant!.name,
    logoUrl: data?.logo_url ?? null,
    primaryColor: data?.primary_color ?? null,
  };
}
