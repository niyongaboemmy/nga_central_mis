# Reminder Hub — operations guide

What was built from `REMINDERS_SOLUTION_PROPOSAL.md` (repo root of `nga-mis-full`), how to run it, and how the other NGA apps plug in.

## What it does

- Turns the MIS timetable (lessons, custom activities) and items pushed by other apps (quizzes, assignments, meetings) into dated reminders.
- Delivers them through two channels:
  - **in-app** (the bell)
  - **Web Push** to every browser or installed NGA app the person switched on
- Gives each person a private **calendar feed** (`webcal://`) with alarms, for Apple Calendar and Outlook.
- Ships MIS as an **installable app (PWA)**, one app for the whole origin:
  - `public/manifest.webmanifest`
  - `public/sw.js`, which also imports the e-learning offline cache
- Everything is free: VAPID Web Push, no SMS, no push SaaS, no new infrastructure (no Redis).

## Code map

| Area | Where |
|---|---|
| Migration | `backend/migrations/092_reminders_hub.sql` — `ReminderPreference`, `PushSubscription`, `ReminderSource`, `ReminderJob`, `CalendarFeedToken` |
| Schema | `backend/src/db/reminderSchema.ts` |
| Engine | `backend/src/services/reminders/`:<br>- `time.ts` (Kigali time)<br>- `preferences.ts`<br>- `occurrences.ts` (reuses `loadTeacherLessons` / `loadStudentLessons`, so the live-lesson rule applies)<br>- `expander.ts` (plans jobs)<br>- `dispatcher.ts` (claims and delivers)<br>- `webPush.ts`<br>- `calendarFeed.ts`<br>- `scheduler.ts` |
| HTTP | `backend/src/routes/reminders.ts`, `backend/src/controllers/reminderController.ts` |
| App (PWA) | `frontend/public/{manifest.webmanifest,sw.js,maskable-*.png,badge-96x96.png}`, `frontend/src/reminders/{platform,pwa,push}.ts` |
| UI | `frontend/src/components/reminders/*` — `/reminders` page, the `ReminderNudge` in `SystemLayout`, and a "Reminders" entry in the sidebar |
| Tests | Backend:<br>- `src/services/reminders/reminders.unit.test.ts`<br>- `src/__tests__/remindersHub.test.ts`<br><br>Frontend:<br>- `src/reminders/__tests__`<br>- `src/components/reminders/__tests__`<br><br>Real browser: `backend/scripts/reminders-e2e/e2e.cjs` |

## Environment (API)

| Variable | Needed | Meaning |
|---|---|---|
| `REMINDERS_VAPID_PUBLIC_KEY`, `REMINDERS_VAPID_PRIVATE_KEY` | **production: yes** | Web Push key pair. Generate **once** with `npm run reminders:vapid` and never rotate casually, because a new pair orphans every subscription. Without them push is disabled (in-app and feed still work). Development generates `backend/.reminders-vapid.json` automatically; that file is git-ignored. |
| `REMINDERS_VAPID_SUBJECT` | no | `mailto:` contact for push services (default `mailto:it@nga.ac.rw`) |
| `REMINDERS_APP_URL` | no | Public app origin used in notification links; defaults to `FRONTEND_URL` (production: `https://mis.amashuri.com`) |
| `REMINDERS_API_URL` | production: yes | Public API origin for feed and action links, e.g. `https://api.amashuri.com` |
| `REMINDERS_ACTION_SECRET` | recommended | HMAC key for notification-button links (falls back to `JWT_SECRET`) |
| `REMINDERS_SCHEDULER` | no | `false` switches off the dispatcher and planner loops in this process |
| `REMINDERS_PUSH_HOSTS` | no | Extra allowed push-service hosts (comma list). The default allow-list (FCM, Mozilla, Apple, WNS) is the SSRF guard. |

## Deploying

1. Apply the migration on the server by piping the SQL, as with every other migration. `npm run migrate` does not work there (see the production notes):
   `mysql … "$DB_NAME" < migrations/092_reminders_hub.sql`. It is idempotent.
2. Add the environment variables above to `/opt/apps/nga_central_mis/backend/.env`, then run `pm2 restart mis-backend`.
3. Frontend: nothing new in the build environment. The nginx rules below are in `deploy/nginx-mis.conf` and were applied to production on 2026-09-30. For nginx on the app host:
   - Serve `/sw.js` with `Cache-Control: no-cache` so updates reach users.
   - Map `.webmanifest` to `application/manifest+json`. Browsers tolerate other types, but that is the correct one.
4. Check the result:
   - `GET /reminders/config` (signed in) shows `push.enabled: true`.
   - `/reminders` shows the admin "School-wide delivery" panel for `MANAGE_SYSTEMS` users.

The scheduler runs inside the API process:
- The dispatcher runs every 60 s.
- Re-planning runs every 30 min, and immediately after any preference, subscription or source change.
- The claim token makes a second API process safe.

## Source API (Task Mentor, Tupo, …)

The other apps authenticate with an **IntegrationToken** that has scope `reminders:write`, or with a registered System's client credentials (HTTP Basic).

```http
PUT /reminders/sources
Authorization: Bearer <integration token>
Content-Type: application/json

{
  "source_app": "taskmentor",
  "source_type": "quiz_close",          // quiz_open | quiz_close | assignment_due | meeting | event
  "external_id": "quiz-812-close",       // stable per item; PUT again to change it
  "title": "Algebra quiz",
  "starts_at": "2026-10-02T13:00:00Z",   // ISO; for *_close / *_due this is the deadline
  "ends_at": null,
  "link": "https://taskmentor.amashuri.com/quizzes/812",
  "location": null,
  "critical": true,                       // skips quiet hours and the daily cap; sticky notification
  "audience_user_ids": [1203, 1204]       // MIS user ids, max 5000
}
```

- `DELETE /reminders/sources/:app/:type/:externalId` cancels the item and every pending reminder for it.
- Send a quiz as two items (`quiz_open` and `quiz_close`).
- Re-send whenever the time or the audience changes. People removed from the audience have their pending reminders withdrawn.

**Still to wire:** Task Mentor (quiz and assignment create, update and delete) and Tupo (meetings) do not call this yet.

## Channels and rules

- **Offsets** (defaults, per person, editable on `/reminders`):

  | Item | Reminder time |
  |---|---|
  | Lesson | 10 min before (15 for the teacher of the lesson, unless they choose their own) |
  | Quiz opens | 30 min before |
  | Quiz closes | 60 and 15 min before |
  | Assignment due | 1 day and 2 h before |
  | Meeting | 15 min before |

- **Quiet hours** 21:00–06:00. Non-critical reminders move to the end of quiet hours, or are dropped if that would be after the event.
- **Morning briefing** at 06:30 on days with something on.
- **Daily push cap** of 8 per person. Critical items are exempt. Past the cap, reminders still go in-app.
- **Too late:** a reminder whose event already started is expired, not sent.
- **Push settings:** `Urgency: high`, TTL equal to the time left before the event, and a topic that collapses stale copies.
- **Notification buttons** "Got it" and "Snooze 5 min" call `POST /reminders/actions/:id/:action?sig=…`, a per-job HMAC, because the service worker has no session.
- **Times** are computed in Africa/Kigali (UTC+2, no DST). Scheduling columns hold UTC. Raw SQL must bind `toDbUtc(date)`, never a bare `Date` (see the comment in `reminderSchema.ts`).

## School-managed Windows PCs (policy pack, proposal §7.4)

Apply these by GPO or registry for Chrome. Edge uses the same names under `HKLM\SOFTWARE\Policies\Microsoft\Edge`. Replace `mis.amashuri.com` if the app moves.

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome]
"WebAppInstallForceList"="[{\"url\":\"https://mis.amashuri.com/home?source=pwa\",\"default_launch_container\":\"window\",\"create_desktop_shortcut\":true}]"
"WebAppSettings"="[{\"manifest_id\":\"https://mis.amashuri.com/\",\"run_on_os_login\":\"run_windowed\"}]"
"BackgroundModeEnabled"=dword:00000001

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\NotificationsAllowedForUrls]
"1"="https://mis.amashuri.com"
```

What these do:
- The NGA app is installed silently.
- Its notifications are pre-allowed.
- It opens at sign-in.
- Chrome keeps running in the background, so push arrives with every window closed.

Each person still clicks **Turn on notifications** once on `/reminders` to create their subscription. The permission prompt is skipped because it is pre-granted.

## Testing

```bash
# backend (test DB: npm run test:db:reset first)
npx vitest run src/services/reminders src/__tests__/remindersHub.test.ts
# frontend
npx vitest run src/reminders src/components/reminders
# real Chrome end to end (API on :5051 against the test DB, `vite preview` on :5183 built with VITE_API_BASE_URL=http://localhost:5051)
cd backend/scripts/reminders-e2e && npm i && cd ../.. && node scripts/reminders-e2e/e2e.cjs /tmp/reminders-e2e
```

The e2e drives a real Chrome and checks:
- a real FCM subscription, a test push and a *scheduled* push shown by the service worker, and the Got it link
- preferences autosave, the calendar feed, Now & Next, the bell and the offline agenda
- the iPhone install sheet and the nudges
- axe WCAG AA checks and horizontal overflow, in light and dark at desktop, tablet and phone sizes

## Not built yet (from the proposal)

- **Google Calendar "Connect"** (phase 3): needs a GCP OAuth client and Google's free sensitive-scope verification.
- **Telegram bot** (phase 4): needs a bot token.
- **Classroom `/display` screens** and **absence-based suppression** (phase 5).
- **Source API calls** from Task Mentor and Tupo (see above).
