/**
 * The public registration site (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1).
 *
 * The same build is served on two hosts:
 *  - VITE_REGISTRATION_SITE_URL (https://amashuri.com): a school starts here.
 *    "/" is the registration wizard; only /register-school and /onboarding exist,
 *    everything else is sent to the MIS app.
 *  - VITE_MIS_APP_URL (https://mis.amashuri.com): the MIS itself.
 *
 * Unset (local dev, tests): there is one host and everything stays relative.
 */

const trimUrl = (v: unknown): string => String(v ?? "").trim().replace(/\/$/, "");

const registrationSiteUrl = (): string => trimUrl(import.meta.env.VITE_REGISTRATION_SITE_URL);
const misAppUrl = (): string => trimUrl(import.meta.env.VITE_MIS_APP_URL);

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
};

/** Is this page running on the public registration site? */
export function isRegistrationSite(host: string = window.location.host): boolean {
  const site = hostOf(registrationSiteUrl());
  if (!site) return false;
  const h = host.toLowerCase();
  return h === site || h === `www.${site}`;
}

/** Paths the registration site serves itself. */
export const REGISTRATION_SITE_PATHS = ["/", "/register-school", "/onboarding"];

/** Where "Register your school" goes: the registration site when it is another host. */
export function registerSchoolHref(): string {
  const site = registrationSiteUrl();
  return site && !isRegistrationSite() ? `${site}/` : "/register-school";
}

/** The MIS URL for `path` (absolute when on the registration site). */
export function misHref(path: string): string {
  const base = misAppUrl();
  return base && isRegistrationSite() ? `${base}${path}` : path;
}
