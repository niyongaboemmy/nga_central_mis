/**
 * The public registration site (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.1).
 *
 * The same build is served on two hosts:
 *  - VITE_REGISTRATION_SITE_URL (https://amashuri.com): a school starts here.
 *    "/" is the landing page, /register the registration wizard, /onboarding the
 *    applicant tracker; everything else is sent to the MIS app.
 *  - VITE_MIS_APP_URL (https://mis.amashuri.com): the MIS itself.
 *
 * Unset (local dev, tests): there is one host and everything stays relative.
 */
import { useEffect } from "react";

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
export const REGISTRATION_SITE_PATHS = ["/", "/register", "/onboarding"];

/** Where "Register your school" goes: the registration site when it is another host. */
export function registerSchoolHref(): string {
  const site = registrationSiteUrl();
  if (isRegistrationSite()) return "/register";
  return site ? `${site}/register` : "/register-school";
}

/** The MIS URL for `path` (absolute when on the registration site). */
export function misHref(path: string): string {
  const base = misAppUrl();
  return base && isRegistrationSite() ? `${base}${path}` : path;
}

/**
 * index.html carries NGA's name, icons and install manifest (the MIS app).
 * The registration site is Amashuri's: swap them while it is mounted.
 */
export function useRegistrationSiteHead(): void {
  useEffect(() => {
    const head = document.head;
    const prevTitle = document.title;
    document.title = "Amashuri — school activities management";
    const removed: Element[] = [];
    head.querySelectorAll('link[rel="manifest"], link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
      removed.push(el);
      el.remove();
    });
    const added = [
      Object.assign(document.createElement("link"), { rel: "icon", type: "image/svg+xml", href: "/amashuri/mark.svg" }),
      Object.assign(document.createElement("link"), { rel: "icon", type: "image/png", href: "/amashuri/favicon-32.png" }),
      Object.assign(document.createElement("link"), { rel: "apple-touch-icon", href: "/amashuri/apple-touch-icon.png" }),
    ];
    added.forEach((el) => head.appendChild(el));
    const desc = head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    if (desc) desc.content = "Amashuri: one platform for every school activity: lessons, assessments, attendance and messages.";
    return () => {
      document.title = prevTitle;
      added.forEach((el) => el.remove());
      removed.forEach((el) => head.appendChild(el));
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
    };
  }, []);
}
