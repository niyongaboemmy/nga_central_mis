# Reminder Hub — operations guide

What was built from `REMINDERS_SOLUTION_PROPOSAL.md` (repo root of `nga-mis-full`), how to run it, and how the other NGA apps plug in.

## What it does

- Turns the MIS timetable (lessons, custom activities) and items pushed by other apps (quizzes, assignments, meetings) into dated reminders.
- Delivers them through:
  - **in-app** (the bell)
  - **Web Push** to every browser or installed NGA app the person switched on
  - **Telegram**, once the person links a chat (free bot, optional)
  - **email**, only for a critical reminder nobody opened within 10 min (opt-in)
- Mirrors the plan into the person's own **Google Calendar** (optional, "Connect Google Calendar").
- Sends a **change notice** when a quiz, deadline or meeting people were already reminded about moves or is cancelled within 48 h.
- Gives each person a private **calendar feed** (`webcal://`) with alarms, for Apple Calendar and Outlook.
- Ships MIS as an **installable app (PWA)**, one app for the whole origin:
  - `public/manifest.webmanifest`
  - `public/sw.js`, which also imports the e-learning offline cache
- Everything is free: VAPID Web Push, no SMS, no push SaaS, no new infrastructure (no Redis).

## Code map

| Area | Where |
|---|---|
| Migrations | `backend/migrations/092_reminders_hub.sql` — `ReminderPreference`, `PushSubscription`, `ReminderSource`, `ReminderJob`, `CalendarFeedToken`<br>`backend/migrations/093_reminder_channels.sql` — `TelegramLink`, `TelegramLinkCode`, `GoogleCalendarLink`, `GoogleCalendarEvent`; `ReminderJob.escalated_at`, `ReminderPreference.channels`, `ReminderSource.audience_subject_id` |
| Schema | `backend/src/db/reminderSchema.ts` |
| Engine | `backend/src/services/reminders/`:<br>- `time.ts` (Kigali time)<br>- `preferences.ts`<br>- `occurrences.ts` (reuses `loadTeacherLessons` / `loadStudentLessons`, so the live-lesson rule applies)<br>- `expander.ts` (plans jobs)<br>- `dispatcher.ts` (claims and delivers)<br>- `webPush.ts`<br>- `calendarFeed.ts`<br>- `scheduler.ts`<br>- `sources.ts` (Source API, subject audiences, change notices)<br>- `channels.ts` (Telegram delivery, email escalation, Google re-sync)<br>- `telegram.ts`, `googleCalendar.ts`, `secretBox.ts` |
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
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | for Telegram | See "Setting up Telegram". Without them the Telegram row says "not set up". |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google Calendar | See "Setting up Google Calendar". |
| `REMINDERS_SOURCE_CLIENTS` | no | Which Systems (client ids) may write reminders with their client credentials. Default: `taskmentor_app,tupo,discipline_attendance`. Anyone else needs an IntegrationToken with `reminders:write`. |
| `REMINDERS_ENCRYPTION_KEY` | recommended | Encrypts stored Google refresh tokens (AES-256-GCM). Falls back to a key derived from `JWT_SECRET`; set it before the first person connects, because changing it later disconnects everyone. |

## Deploying

1. Apply the migrations on the server by piping the SQL, as with every other migration. `npm run migrate` does not work there (see the production notes):
   `mysql … "$DB_NAME" < migrations/092_reminders_hub.sql`, then `093_reminder_channels.sql`. Both are idempotent.
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

The other apps authenticate in one of two ways:
- an **IntegrationToken** with scope `reminders:write`;
- or, simplest, **their own SSO client credentials** as HTTP Basic (`client_id:client_secret` of their `System`). Task Mentor and Tupo use this, so they need no new secret. Only the NGA apps listed in `REMINDERS_SOURCE_CLIENTS` may do this; other Systems get 403.

```http
PUT /reminders/sources/batch          (up to 200 items; each succeeds or fails on its own)
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/json

{ "items": [{
  "source_app": "taskmentor",
  "source_type": "quiz_close",          // quiz_open | quiz_close | assignment_due | meeting | event
  "external_id": "quiz-812-close",       // stable per item, max 100 chars
  "title": "Algebra quiz",
  "starts_at": "2026-10-02T13:00:00Z",   // ISO; for *_close / *_due this is the deadline
  "ends_at": null,
  "link": "https://taskmentor.amashuri.com/quizzes/812/take",
  "location": null,
  "critical": true,                       // skips quiet hours and the daily cap; sticky; email escalation
  "audience_subject_id": 42,              // the subject's ACTIVE enrolled students (resolved by MIS, so late enrolments count)
  "audience_user_ids": [1203, 1204]       // and/or explicit MIS user ids, max 5000
}] }
→ { "results": [{ "external_id": "quiz-812-close", "ok": true, "changed": true }], "saved": 1, "failed": 0 }
```

- `PUT /reminders/sources` takes one item (same shape) and returns `{source_id, created, changed, noticed}`.
- `DELETE /reminders/sources/:app/:type/:externalId` cancels the item and every pending reminder for it.
- Give at least one of `audience_subject_id` and `audience_user_ids`.
- Sending an unchanged item does nothing (`changed: false`). Apps can therefore re-send everything upcoming on a timer as a backstop.
- People removed from the audience have their pending reminders withdrawn.
- **Change notices:** if `starts_at` moves by a minute or more, or the item is cancelled, while the old or new time is within 48 h, everyone who was already reminded gets one "Quiz deadline moved: … Now tomorrow at 14:00 (was today at 16:00)" or "… cancelled" notice. So does anyone with a reminder about to fire.

**Who calls it:**
- **Task Mentor** (`server/src/services/reminderSync.ts`): publishing, editing, unpublishing or deleting a quiz or assignment syncs it. A sweep every 30 min re-sends everything due in the next 14 days. The audience is the course's MIS subject, and links go to `/quizzes/:id/take` and `/assignments/:id`.
- **Tupo** (meetings): see that repository's README. It syncs on schedule, change and cancel, plus a worker sweep.

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
- **Telegram** (when linked and switched on): every reminder, with the same Got it and Snooze buttons. The push cap doesn't apply. Sending follows the [Bot API](https://core.telegram.org/bots/api) and [FAQ](https://core.telegram.org/bots/faq) limits: about 22 messages/s overall (free limit about 30), at least 1 s apart per chat, and one wait for `retry_after` on a 429 (up to 30 s). A chat that blocks the bot is unlinked automatically.
- **Email escalation** (opt-in, per person): a *critical* reminder still not acknowledged 10 min after it was sent, before the event starts, is emailed once through the MIS SMTP settings.
- **Google Calendar:** the next 21 days are mirrored into a calendar the app creates, "NGA · My Timetable". Only the `calendar.app.created` scope is used, so NGA never sees the person's own events. It re-syncs 20 s after any change affecting the person and on a full pass every 2 h. Unchanged events are skipped (content hash). An `invalid_grant` marks the link revoked, and the UI offers to reconnect.
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

## Setting up Telegram (free, about 5 minutes)

1. In Telegram, open **@BotFather** → `/newbot`. Name it, for example "NGA Reminders", and give it a username such as `nga_reminders_bot`. Copy the token.
2. Optionally, polish the profile in BotFather:
   - `/setuserpic`: the NGA logo.
   - `/setdescription` (max 512 chars, shown before Start): "Reminders from New Generation Academy: lessons, quiz and assignment deadlines, meetings."
   - `/setabouttext` (max 120 chars): "NGA school reminders".
   - The `/start` and `/stop` commands are registered by the API itself, so there's no need for `/setcommands`.
3. Add to the API `.env`, then run `pm2 restart mis-backend`:
   ```
   TELEGRAM_BOT_TOKEN=<token from BotFather>
   TELEGRAM_BOT_USERNAME=nga_reminders_bot
   TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
   ```
4. On start, the API registers its webhook, `REMINDERS_API_URL/reminders/telegram/webhook`, and the `/start` and `/stop` commands. Check with `curl https://api.telegram.org/bot<token>/getWebhookInfo`.
5. People link their chat with **Reminders → Connect Telegram**. That opens `t.me/<bot>?start=<one-time code>`, valid for 15 min, and they press Start. `/stop` in the chat unlinks it.

## Setting up Google Calendar (free)

1. In Google Cloud console, open the project that holds the MIS sign-in client (`GOOGLE_CLIENT_ID`) and **enable the Google Calendar API**.
2. Under **OAuth consent screen**, add the scope `https://www.googleapis.com/auth/calendar.app.created`. It is a sensitive scope, so submit the app for **verification**. That is free and typically takes a few days to a few weeks. Until it is verified, up to 100 listed **test users** can connect.
3. On the Web OAuth client, add the redirect URI `https://api.amashuri.com/reminders/google/callback`.
4. Add `GOOGLE_CLIENT_SECRET` (and `REMINDERS_ENCRYPTION_KEY`) to the API `.env`, then run `pm2 restart mis-backend`.
5. People connect with **Reminders → Connect Google Calendar**.

## Not built yet (from the proposal)

- **Classroom `/display` screens** and **absence-based suppression** (phase 5).
- **SMS / WhatsApp:** deliberately out of scope because they aren't free.
