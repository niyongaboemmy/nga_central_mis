/**
 * App keys used by access control v2 ("mis", "tm", "da", "tupo") and the SSO
 * client (System.client_id) each one publishes its manifest as.
 *
 * Override the client mapping with ACCESS_APP_CLIENTS, e.g.
 *   ACCESS_APP_CLIENTS="tm=taskmentor_app,da=discipline_attendance,tupo=tupo"
 */
export const APP_LABELS: Record<string, string> = {
  mis: "Central MIS",
  tm: "Task Mentor",
  da: "Discipline & Attendance",
  tupo: "Tupo",
};

const DEFAULT_APP_CLIENTS: Record<string, string> = {
  tm: "taskmentor_app",
  da: "discipline_attendance",
  tupo: "tupo",
};

export function appClients(): Record<string, string> {
  const out = { ...DEFAULT_APP_CLIENTS };
  for (const pair of (process.env.ACCESS_APP_CLIENTS || "").split(",")) {
    const [app, client] = pair.split("=").map((s) => s?.trim());
    if (app && client) out[app] = client;
  }
  return out;
}

/** Which app key does this SSO client publish as? */
export function appForClient(clientId: string | null | undefined): string | null {
  if (!clientId) return null;
  for (const [app, client] of Object.entries(appClients())) {
    if (client === clientId) return app;
  }
  return null;
}
