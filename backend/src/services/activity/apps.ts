/**
 * The four NGA apps that report activity, and how a relay's SSO client maps to one.
 *
 * Codes are stored as TINYINT in every analytics table (migration 095).
 */
export const APPS = ["mis", "tm", "tendo", "tupo"] as const;
export type AppKey = (typeof APPS)[number];

export const APP_CODE: Record<AppKey, number> = { mis: 1, tm: 2, tendo: 3, tupo: 4 };
export const APP_BY_CODE: Record<number, AppKey> = { 1: "mis", 2: "tm", 3: "tendo", 4: "tupo" };
export const APP_LABEL: Record<AppKey, string> = {
  mis: "NGA MIS",
  tm: "Task Mentor",
  tendo: "Tendo",
  tupo: "Tupo",
};
export const APP_BIT: Record<AppKey, number> = { mis: 1, tm: 2, tendo: 4, tupo: 8 };

export const isAppKey = (v: unknown): v is AppKey =>
  typeof v === "string" && (APPS as readonly string[]).includes(v);

/**
 * Which SSO clients may write activity, and as which app.
 *
 * `requireServiceToken` grants ANY active System whatever scope it asks for over HTTP
 * Basic (middleware/serviceAuth.ts). So the writer must be pinned here, and the app is
 * decided by the client id rather than by the batch's own claim.
 *
 * ACTIVITY_SOURCE_CLIENTS="taskmentor_app=tm,discipline_attendance=tendo,tupo=tupo"
 */
export const activitySourceClients = (): Map<string, AppKey> => {
  const raw =
    process.env.ACTIVITY_SOURCE_CLIENTS ||
    "taskmentor_app=tm,discipline_attendance=tendo,tupo=tupo";
  const out = new Map<string, AppKey>();
  for (const pair of raw.split(",")) {
    const [client, app] = pair.split("=").map((s) => s.trim());
    if (client && isAppKey(app)) out.set(client, app);
  }
  return out;
};

/** Browser origins allowed to post activity (anonymous traffic must come from one). */
export const activityOrigins = (): string[] =>
  (
    process.env.ACTIVITY_ORIGINS ||
    "https://mis.amashuri.com,https://taskmentor.amashuri.com,https://tendo.amashuri.com,https://tupo.amashuri.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
  )
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
