# Timely Reminders for the NGA Platform — Feasibility Study

**Date:** 2026-09-29 · **Scope:** Central MIS, Task Mentor, Tupo (communication), Discipline & Attendance · **Status:** Recommendation for decision

> **Constraint (revised):** no funds are available. The recommendation below is **zero-cost**: only free/open-source components, NGA's existing Google Workspace, and existing servers. Paid channels (SMS, WhatsApp, paid UI libraries, push SaaS) are **excluded**. See §7a.

---

## 1. Executive summary

**Problem.** Users need a reminder *before* things happen: "Physics starts in 30 min", "Quiz closes in 1 h", "Meeting at 14:00". A normal web page cannot do this reliably. Browsers stop running a page's code once the tab is closed. The one browser API for scheduling a notification locally (Notification Triggers / `TimestampTrigger`) was **abandoned by Google** and never shipped ([Chrome docs](https://developer.chrome.com/docs/web-platform/notification-triggers)). Every reliable web reminder therefore has to be sent **from the server** at the right moment, or handed to an app that lives on the device, such as the Google Calendar app.

**Options studied**

| # | Option | Verdict |
|---|---|---|
| 1 | Google Calendar integration only (write events and reminders into users' Google Calendars, and show their Google calendar inside our app) | **Feasible, and the most reliable on phones**, but it depends entirely on every user having and using an nga.ac.rw Google account. It does nothing for in-app alerts, and showing personal calendars raises privacy concerns. |
| 2 | Build our own Google-Calendar-like product plus a PWA with push | **The push part is feasible and valuable. Cloning Google Calendar is not worth it.** It means months of work re-creating what Google already gives users for free, and web push is still weaker than native apps on desktops and on iPhones that haven't installed the app. |
| 3 | **Hybrid: a single "Reminder Hub" that delivers to several channels** | **Recommended.** One server-side reminder engine in MIS. It sends each reminder through in-app, Web Push (PWA), Google Calendar (synced through the school's Workspace, not per-user logins) and email. Every component is free. We keep our own timetable UI, which already exists, and let Google Calendar do what it is best at: alerting on the phone. |

**Bottom line.** Go with Option 3 in three phases, about 8–11 developer-weeks in total (§8). Phase 1, which delivers value within weeks, needs **no Google dependency**. Phase 2 has one **blocking prerequisite**: an nga.ac.rw Google Workspace super-admin must approve a service account with domain-wide delegation (§5.3).

---

## 2. What already exists in our codebase

This survey decides how much of the work is new. More already exists than one might expect.

| Asset | Where | Relevance |
|---|---|---|
| **Per-user reminder preferences**: `CalendarNotification`, where `minutes_before` defaults to 30 and the method is `IN_APP` | `nga_central_mis/backend/src/db/schema.ts` (~L996); UI in `frontend/src/components/calendar/NotificationSettingsModal.tsx` | The preference model and settings screen already exist. **Nothing sends these reminders yet.** This is the gap to fill. |
| Timetable data: `AcademicCalendar`, `CalendarSlot` (weekday + `"HH:MM"` strings, no dates), `CalendarActivity` | MIS `schema.ts` L944–1018 | The source of lesson and activity reminders. Weekly slots must be expanded into dated occurrences using the term dates. |
| Deadlines: Assignment `due_date`, Quiz `start_date`/`end_date` | `nga-task-mentor/server/src/models/` | The second largest source of reminders. |
| Meetings and scheduled posts | Tupo `meetings`, `meetingInvites` | The third source. |
| In-app notification inboxes and bells | MIS `Notification` table + `NotificationBell.tsx`; Tupo `packages/notify` (deduplicates per recipient, item and kind, delivers over socket.io) | These already cover the "tab is open" case. |
| Job scheduling | Tupo `apps/worker` (BullMQ + Redis); MIS only has `setInterval` timers | A pattern we can reuse. |
| Email | nodemailer in MIS and Tupo; SendGrid/Twilio stubs in Discipline `notifier.ts` | The fallback channel is available. |
| PWA pieces | Full manifest in Tupo (`apps/web/public/manifest.webmanifest`); basic manifests in Task Mentor and Discipline; a caching-only service worker in MIS (`elearning-sw.js`) | Partial. **No Web Push anywhere yet**: no VAPID keys, `PushManager` or subscriptions table. |
| Google | MIS "Sign in with Google" (checks the ID token only: **no Calendar permissions, no stored tokens, no `hd=nga.ac.rw` restriction**) | Calendar is a greenfield integration. |
| `.ics` generation | Tupo Meet `GET /meet/:id/ics`, feed event `.ics` | We can reuse it for "Add to calendar" downloads. |

---

## 3. Technical facts that decide the design

These facts come from the research and drive every recommendation below.

### 3.1 Browser and PWA constraints

| Fact | Impact |
|---|---|
| **The Notification Triggers API is dead.** Development ended because Chrome "could not provide consistent and reliable experiences across platforms". ([Chrome](https://developer.chrome.com/docs/web-platform/notification-triggers)) | A PWA cannot schedule "notify me at 09:10" on the device. Every web reminder must be pushed from the server at the right time. |
| **Web Push reaches a closed tab**, because the service worker wakes up. **On desktop it does not arrive when the browser process is fully closed.** On Android, the OS wakes the browser even when it is closed. ([web.dev FAQ](https://web.dev/push-notifications-faq/)) | Push is reliable on Android and good on desktop while the browser is running. It is not guaranteed on a desktop that has just been booted. |
| **iOS/iPadOS 16.4+ supports push only for apps installed to the Home Screen**, not Safari tabs. The EU exception under the DMA **does not apply to Rwanda**. ([Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications), [MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)) | iPhone users must "Add to Home Screen". We need an install guide screen because iOS offers no automatic prompt. |
| **Declarative Web Push** (Safari 18.4+ on iOS, 18.5+ on macOS) delivers a notification described in JSON without running service-worker JavaScript. It is more reliable and uses less battery. ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)) | Send payloads in the declarative format where supported, with a normal service-worker fallback. |
| **`beforeinstallprompt` (the "Install app" prompt) works only in Chromium browsers** (Chrome, Edge, Opera). Safari and Firefox desktop never fire it. ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), [web.dev](https://web.dev/learn/pwa/installation-prompt)) | Installing the app can be encouraged, never forced. |
| The push service's 200 response means "accepted", not "delivered". Messages marked `normal` urgency can be held back in Android Doze. Default TTL is 4 weeks. ([web.dev](https://web.dev/push-notifications-faq/), [FCM](https://firebase.google.com/docs/cloud-messaging/concept-options)) | Send reminders with `Urgency: high` and a short `TTL`, so a "starts in 30 min" push is never delivered 3 hours late. |

### 3.2 Google Calendar constraints

| Fact | Impact |
|---|---|
| Event reminders: methods are `popup` and `email`, set via `reminders.overrides` (up to 5) with `useDefault=false`. ([Google](https://developers.google.com/workspace/calendar/api/concepts/reminders)) | "30 min before" is directly supported. |
| **Reminders are private to each user.** Overrides written on an event apply only to the calendar it is written into. Attendees get their own defaults. (same source) | Adding people as attendees does *not* give them our 30-minute reminder. We have to set reminders **per user**. §5.2 describes the cheap way to do that. |
| Each user can set a **default reminder per calendar in their list** (`calendarList.defaultReminders`). | This is the key to the shared-calendar design: write each event **once**, and every subscriber gets a 30-minute popup on their phone. |
| **Domain-wide delegation (DWD):** a service account approved by the Workspace admin can act as any nga.ac.rw user **without each user granting permission**. ([Google](https://developers.google.com/identity/protocols/oauth2/service-account), [Workspace admin](https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation)) | Zero-click onboarding for staff and students. It requires Google super-admin action. |
| **Internal apps** (consent screen type "Internal", project owned by the org) **skip Google's sensitive-scope verification.** Apps for external gmail.com users must go through verification. ([Google](https://developers.google.com/workspace/guides/configure-oauth-consent), [verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)) | Keep this to nga.ac.rw accounts. Parents on personal Gmail would trigger a weeks-long verification, so they get push/email instead. |
| **Under-18 Workspace for Education users can only use third-party apps the admin has explicitly configured.** ([Google Classroom help](https://support.google.com/edu/classroom/answer/6253304)) | Students are mostly minors, so the admin must mark our app as trusted. DWD covers this. |
| Quotas (for projects created after 2026-05-01): **600 requests/min per user, 10,000/min per project, and a 1M/day billing threshold per project.** Google has announced charges above quota for later in 2026. Service-account calls count as a single user unless `quotaUser` is set. ([Google](https://developers.google.com/workspace/calendar/api/guides/quota)) | Design for few writes (recurring events, shared calendars) and always pass `quotaUser`. |
| Calendar abuse limits: creating very large numbers of events in a short time can put a calendar into **read-only mode for hours to months**. ([Workspace help](https://support.google.com/a/answer/2905486)) | Never do per-student, per-lesson inserts. Use recurring events on shared calendars. |
| **Subscribed `.ics` (webcal) feeds refresh only every 8–24 h** and cannot be forced. Embedded `VALARM` alarms are handled inconsistently. ([Calfeed](https://calfeed.ai/learn/ics-refresh-rate-apple-google), [Google community](https://support.google.com/calendar/thread/9627602)) | ICS subscription is fine for a static timetable but **not for reminders or last-minute changes**. Use the API instead. |
| **Embedding a private Google Calendar in an iframe does not work reliably.** It only shows public calendars, and third-party-cookie blocking breaks the signed-in view. ([Google](https://support.google.com/calendar/answer/41207), [Mozilla support](https://support.mozilla.org/en-US/questions/1381603)) | "Preview my Google calendar inside NGA" has to be built as **API read + our own rendering**, not an iframe. |
| Change notifications: `events.watch` webhooks plus `syncToken` incremental sync. Channels expire (≤ ~30 days) and must be renewed. ([Google](https://developers.google.com/workspace/calendar/api/guides/push)) | Needed only if we show users' personal Google events or accept edits made in Google. |
| Google Classroom already publishes due dates to a per-class shared Google Calendar. ([Classroom help](https://support.google.com/edu/classroom/answer/6272985)) | Evidence that the per-class shared-calendar model works in schools at scale. |

---

## 4. Evaluation of the three options

### Option 1 — Google Calendar integration only

**What it means:** OAuth (or DWD) to write NGA lessons, quizzes and deadlines into Google Calendar with 30-minute reminders, plus a view in our app that shows the user's Google calendar and lets them manage it.

| Pros | Cons |
|---|---|
| Native, very reliable alerts on Android and iOS through the Google Calendar app, including when the phone is locked and the browser is closed. | Useless for anyone who doesn't use Google Calendar on their phone. It needs a behaviour change: install the app and sign in with nga.ac.rw. |
| No PWA install needed. | Our current Google login is not restricted to nga.ac.rw, so we would first have to confirm that **every** staff member and student has an active nga.ac.rw mailbox. |
| Google handles time zones, snooze, and the mobile and desktop apps. | Reading and managing a user's *personal* calendar inside MIS is a privacy and safeguarding issue (minors, staff private life). It needs a data-protection review under Rwanda Law No. 058/2021. |
| Free within quota. | Tied to Google: API billing above quota is announced for later in 2026, and the calendar breaks if the Workspace subscription or an admin setting changes. |
| | "Manage their calendar inside our app" means rebuilding a Google Calendar client: two-way sync, conflicts, webhooks. That is a lot of work for little gain, because users already have calendar.google.com. |
| | Doesn't help in-app, desktop-browser or parent (non-Workspace) cases. |

**Feasibility:** Technically high. **Organisationally medium**: it depends on the Workspace admin and account coverage. **Strategically incomplete.**

### Option 2 — Our own calendar plus a PWA

**What it means:** Re-create Google Calendar features (month/week/day views, create/edit, recurrence, invitations, reminders, snooze), make every app a PWA, and prompt users to install it.

| Pros | Cons |
|---|---|
| Full control and no Google dependency. Works for parents and any email address. | **Cloning Google Calendar is a multi-month product effort** (recurrence rules, exceptions, time zones, invitations and RSVP, drag-and-drop, accessibility, mobile UX) with no clear advantage over the free product. |
| Web Push is standard, free (VAPID; no Firebase account needed) and ~2–3 weeks of work. | Push is **weaker than native**: nothing arrives on a desktop whose browser is closed, and nothing on iPhones that haven't installed the app. Installation can't be forced (§3.1). |
| MIS already *is* the timetable calendar (`CalendarSlot`, activities, colours, overlap guard). Most of the "calendar" is already built. | Users end up with a **second calendar** alongside Google/Outlook, which is fragmented and easy to ignore. |
| Data stays on NGA servers. | Four apps on four sub-domains would need four installed PWAs, or one host app (§6.4). |

**Feasibility:** The PWA + push part is **high** and worth doing. The "clone Google Calendar" part is **low value / high cost**, so it is not recommended.

### Option 3 — Hybrid "NGA Reminder Hub" (recommended)

**What it means:** Keep *our* calendar as the single source of truth, and build one **server-side reminder engine** that fans out each due reminder to every channel the user can receive:

```
MIS timetable ─┐                            ┌─► In-app bell + socket  (existing: MIS, Tupo)
Task Mentor ───┼─► Reminder Hub (MIS) ──────┼─► Web Push (PWA, VAPID) (new)
Tupo meetings ─┤   • occurrence expander    ├─► Google Calendar       (new, Workspace/DWD, shared calendars)
Activities ────┘   • minute-tick dispatcher └─► Email                 (existing nodemailer, opt-in)
                     (CalendarNotification)
```

The innovative parts, compared with a plain "1 + 2":

1. **"Write once, remind everyone" Google design.** Instead of writing events into thousands of personal calendars, the service account owns **one shared calendar per class group and one per teacher**, for example `NGA · S4 MPC · Timetable`. Each weekly slot becomes **one recurring event per term** (RRULE with the term's end date), so a class has ~40 events per term instead of ~40 × weeks × students. Through DWD we add that calendar to each member's Google calendar list with `defaultReminders = [popup 30 min]`. A timetable change is one API write and is **visible instantly** (unlike ICS feeds). The same pattern Google Classroom uses (§3.2).
2. **Channel escalation instead of duplicate spam.** Every reminder has an ID. Delivery goes: in-app (if online) → push → email for items marked critical (such as exams) if nothing was acknowledged by T-10 min. The Google Calendar popup is the "always-on" native safety net and needs no send from us at reminder time.
3. **Smart defaults, zero setup.** The existing `CalendarNotification` preferences become real: lessons 10 min before, quizzes 30 min before the start and 1 h before the close, assignments 24 h + 2 h before the due time. Users can override these in the existing settings modal.
4. **"Today" digest.** A 06:30 push plus an in-app card listing the day's lessons, deadlines and meetings. Email digest is opt-in only, to stay inside free email-sending limits (§7a). It costs nothing and is very effective at school.
5. **Read-only overlay of the user's own Google calendar (optional, opt-in).** This shows *busy* blocks from their personal calendar on the NGA timetable using `freeBusy`, not event details. That gives the "preview" benefit of Option 1 without exposing private event content.

| Pros | Cons |
|---|---|
| Covers every device and situation: phone locked (Google Calendar app), browser open (in-app), Android/installed PWA (push), no smartphone (email, shared computers at school). | More moving parts than a single channel. This is mitigated by building one engine and treating channels as small adapters. |
| Reuses what exists: preference table, notify package, bells, nodemailer, Tupo manifest, BullMQ pattern. | Phase 2 needs the Google Workspace admin (DWD + trusted app for under-18s). |
| No Google Calendar clone. Our calendar stays the source of truth, and Google is a one-way mirror. | Google edits made by users to mirrored events are overwritten (by design: the calendars are read-only for members). |
| Works without Google if Workspace is unavailable. Phase 1 alone already solves most of the problem. | |
| Very low Google API volume: recurring events + shared calendars ≈ a few thousand writes per term, far below quotas. | |

**Feasibility:** **High** technically, medium organisationally (the Phase 2 admin step), highest value per effort.

### Scoring (1 = poor, 5 = excellent)

| Criterion (weight) | Opt 1 Google only | Opt 2 Own + PWA | **Opt 3 Hybrid** |
|---|---|---|---|
| Reliability of a 30-min reminder (25 %) | 4 | 3 | **5** |
| Reach: all users, devices and parents (20 %) | 2 | 4 | **5** |
| Build and maintenance cost (20 %) | 3 | 1 | **4** |
| Reuse of existing code (10 %) | 2 | 4 | **5** |
| Privacy and safeguarding (10 %) | 2 | 5 | **4** |
| Vendor independence (10 %) | 1 | 5 | **4** |
| Time to first value (5 %) | 3 | 2 | **5** |
| **Weighted score** | **2.75** | **3.15** | **4.65** |

---

## 5. Recommended design (Option 3) — technical detail

### 5.1 Reminder engine (lives in Central MIS)

MIS owns the timetable, the users and the `CalendarNotification` preferences, and it is already the SSO provider, so the hub belongs there.

- **Tables**
  - `reminder_sources`: an upstream item (`lesson_slot`, `activity`, `quiz`, `assignment`, `meeting`) + `source_app` + `source_id`.
  - `reminder_jobs`: one row per *(user, occurrence, offset)*, with `fire_at` (UTC), `status`, `channels_sent`, `acked_at`.
  - `push_subscriptions`: `user_id`, `endpoint`, `p256dh`, `auth`, `app`, `user_agent`, `last_ok_at`, `failures`.
- **Occurrence expander.** A nightly job, run again on any change, expands `CalendarSlot` (weekday + `"HH:MM"`) using term dates into dated occurrences for the next 14 days, in **Africa/Kigali (UTC+2, no DST)**. It then writes `reminder_jobs`. It must reuse the shared "live lessons" rule (`liveLessonFilters`/`loadTeacherLessons`) so that disabled subjects and tombstoned slots never produce reminders.
- **Dispatcher.** A **once-a-minute DB sweep** (`fire_at <= now AND status = 'pending'`, using `SELECT … FOR UPDATE SKIP LOCKED` or a claim column). It doesn't need Redis, it survives restarts, and it is simpler than BullMQ delayed jobs for MIS, which has no Redis today. It is idempotent via a unique key on (user, occurrence, offset).
- **Other apps** (Task Mentor, Tupo, Discipline) call `POST /api/reminders/sources` (service-to-service via the existing SSO client credentials) whenever a quiz, assignment or meeting is created, changed or cancelled. Cancelling a source deletes its pending jobs.
- **Housekeeping.** Remove push subscriptions that return 404/410. Retry with backoff. Keep a dead-letter status and an admin view of the last 24 h.

### 5.2 Google Calendar channel (Workspace, DWD)

1. The Workspace super-admin creates a GCP project owned by the nga.ac.rw organisation, sets the OAuth consent screen type to **Internal**, and grants DWD to a service account with **only** `https://www.googleapis.com/auth/calendar` (needed for `calendarList` writes). In Admin console → API controls, the app is marked **Trusted** so that under-18 users are covered.
2. For each class group and each teacher, the service account (acting as a dedicated `timetable@nga.ac.rw` user) creates a secondary calendar. Members get `reader` ACL, so they cannot edit it.
3. For each member, the service account impersonates the user and calls `calendarList.insert` with `defaultReminders: [{method: "popup", minutes: <user pref>}]` and an NGA colour. It is re-run when the preference changes.
4. Each slot becomes one recurring event per term. Changes are `patch`es, and cancelled single lessons become recurrence exceptions. Events carry `extendedProperties.private.ngaSourceId` so the system can reconcile them.
5. Always pass `quotaUser`, and batch requests with exponential backoff on 403/429. **Expected volume: roughly 2–5k writes per term.** Even with Google's 2026 quota model this is far below the free threshold.
6. Quiz and assignment deadlines go into a per-class "Deadlines" calendar the same way.

**Fallback without DWD.** Offer each user an optional "Connect Google Calendar" button with incremental OAuth and the `calendar.app.created` scope, if available for the tenant, or `calendar`. It is internal, so no Google verification is needed. It works, but adoption becomes opt-in and much lower.

**Explicitly not doing:** editing the user's primary calendar, reading event details from personal calendars, iframe embeds, `.ics` subscriptions as the reminder mechanism.

### 5.3 Web Push channel (PWA)

- Use the `web-push` npm package with VAPID keys stored in env/secrets. **No Firebase project is required**, because Chrome's FCM endpoint accepts standard VAPID.
- Add a push handler (`push` → `showNotification`, `notificationclick` → deep link) to a service worker. Send Declarative Web Push JSON for Safari 18.4+ ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)).
- Headers: `Urgency: high`, and a `TTL` equal to the time left before the event starts. If the lesson has started, drop the message.
- Ask for permission **only after a user gesture** (a "Turn on reminders" button on the Today page). This is required by iOS and avoids Chrome's quiet-permission UI.
- An install guide component: use `beforeinstallprompt` on Chromium, and show an illustrated "Share → Add to Home Screen" guide on iOS Safari.

### 5.4 Email (free) — no SMS/WhatsApp

- Email: existing nodemailer on the existing SMTP account. Used only for opt-in digests and critical escalations, and capped (§7a).
- **SMS and WhatsApp are excluded**: both are paid per message (SMS aggregators charge per SMS plus sender-ID fees; [Africa's Talking pricing](https://africastalking.com/pricing)). Meta charges for WhatsApp utility templates, including inside the service window from 2026-10-01 ([Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)). The `notifier.ts` abstraction keeps the door open if funds appear later.

### 5.5 UI (no Google Calendar clone)

- Keep the MIS timetable/calendar components and the discipline "Today" page as the calendar views. If a richer month/week view is ever needed, **FullCalendar core (MIT)** is enough. Avoid FullCalendar Premium (~$480/dev) and Schedule-X v4 premium features.
- New pieces:
  - a "Reminders" settings panel, which extends `NotificationSettingsModal`
  - a "Connect my devices" panel (push on/off per device, Google Calendar status, test notification button)
  - an "Add to calendar" link or `.ics` download for one-off items, using Google's `calendar/render?action=TEMPLATE` URL ([format](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html)); Tupo's `.ics` builder can be reused

---

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Workspace admin won't grant DWD, or not all users have nga.ac.rw accounts | Medium | Phase 1 has no Google dependency. Fall back to opt-in OAuth. Audit account coverage first (MIS users vs Workspace directory). |
| iPhone users never install the PWA, so they get no push | High | The Google Calendar channel covers them (free, native). Show an in-app install nudge only to iOS users with reminders enabled. |
| Desktop push is missed because the browser is closed | Medium | Accepted. Staff phones get the Google Calendar popup. Critical items escalate to email. |
| Timetable data quality: overlapping or phantom slots produce wrong reminders | Medium | Reuse the existing overlap guard and live-lesson rule. Add a "preview my reminders for tomorrow" view. |
| Notification fatigue leads to users turning everything off | Medium | Sensible defaults, per-category toggles, daily digest instead of 8 lesson pings for students, quiet hours. |
| Privacy of minors (Rwanda Law No. 058/2021 on personal data) | Low with this design | No reading of personal calendars (only optional free/busy). Minimal-scope service account. Document the processing in the data-protection register. |
| Google changes quotas or billing (charges above quota are announced for 2026) | Low | The design uses ~0.1 % of the free threshold. Keep the GCP project **without a billing account** and set a hard quota cap, so exceeding it can only throttle, never charge. |
| Email sending limits (Workspace: ~2,000 recipients/day per sending user) | Medium | Email is opt-in and critical-only. Push + in-app carry the volume. If needed, use Workspace SMTP relay (higher free limits). |
| Four apps on four sub-domains → four service workers, four permission prompts | Medium | Route **all** push through one origin: MIS (the SSO hub). Other apps deep-link through it. Users grant permission once. |

---

## 7. Why not the alternatives in their pure form

- **Pure Option 1** solves the phone case well, but leaves in-app, desktop and parents uncovered. It also puts full dependence on an external admin and pulls us into two-way calendar management for no user benefit.
- **Pure Option 2** spends most of the budget re-building a calendar UI we mostly already have, and still can't beat the platform limits: no local scheduling API, no push when a desktop browser is closed, and iOS requires installation.
- **Hybrid** spends effort only where we add value: our data, our rules, one engine. It borrows Google's native mobile alerts through a low-volume, admin-approved integration.

---

## 7a. Zero-cost compliance

Every part of the recommendation is free. Nothing requires a purchase, subscription or card on file.

| Component | Cost | Why it's free / guard |
|---|---|---|
| Reminder engine (tables, minute dispatcher) | 0 | Our code on the existing EC2 + MySQL. A DB sweep instead of Redis/BullMQ, so no new infrastructure. |
| In-app bell / socket | 0 | Already built (MIS, Tupo). |
| Web Push | 0 | Open standard. `web-push` npm (MIT) + self-generated VAPID keys. Browsers' push services (Google FCM, Mozilla, Apple) don't charge senders. **No OneSignal / Firebase paid tiers.** |
| PWA (manifest, service worker, install guide) | 0 | Hand-written or `vite-plugin-pwa` (MIT). |
| Google Calendar mirror | 0 | Calendar is included in [Workspace for Education Fundamentals](https://edu.google.com/intl/ALL_us/workspace-for-education/editions/education-fundamentals/), which is free for qualifying schools. The API is free within quota, and we use ~0.1 %. **Guard:** the GCP project gets no billing account, plus a quota cap. |
| Email | 0 | Existing SMTP account. Opt-in + critical-only to stay under [Workspace limits](https://support.google.com/a/answer/166852?hl=en) (~2,000 recipients/day per user). |
| Calendar UI | 0 | Existing MIS timetable components. FullCalendar core (MIT) only if ever needed. No premium plugins. |
| SMS / WhatsApp | **excluded** | Paid per message. |

**If Phase 2 can't proceed** (no Workspace admin approval, or NGA's Workspace isn't the free Education edition), Phase 1 alone is still a complete, free solution. As a free no-admin extra, each lesson and deadline gets an **"Add to Google Calendar"** link (Google's public `render?action=TEMPLATE` URL). Users add the event to their own calendar in one tap, and Google's app reminds them natively. It needs no API, no OAuth and no quota.

---

## 8. Phased plan and rough effort

Estimates are for one full-stack developer familiar with the codebase. Treat them as ±30 %.

| Phase | Deliverables | Effort | Depends on |
|---|---|---|---|
| **1 — Reminder Hub + in-app + email + Web Push** | Tables, occurrence expander, minute dispatcher; MIS in-app bell delivery; daily digest email; VAPID Web Push + service worker + install guide; Task Mentor quiz/assignment and Tupo meeting source hooks; settings UI; admin delivery log; tests | **4–5 weeks** | Nothing external |
| **2 — Google Calendar mirror (DWD)** | GCP project, service account, per-class/per-teacher shared calendars, recurring-event sync, `calendarList` defaultReminders, reconcile job, "Google Calendar connected" status in settings | **2–3 weeks** | **Workspace super-admin approval** (DWD + trusted app) |
| **3 — Enhancements (optional)** | Escalation rules (critical → email); free/busy overlay of personal Google calendars (opt-in); parent reminders via push/email; analytics on acknowledgement rates | **2–3 weeks** | Privacy sign-off |

**Running costs: 0 RWF.** Web Push is free (self-hosted VAPID, no vendor). Google Calendar API is free within quota (we use ~0.1 %). Workspace for Education Fundamentals is free for qualifying schools. Email uses the existing SMTP account. Everything runs on the existing EC2 server and MySQL database — no Redis, no new server. The only cost is internal developer time.

---

## 9. Decisions needed

1. **Approve Option 3 and Phase 1** so that it can start immediately.
2. **Workspace admin contact:** who can grant domain-wide delegation and mark the app as trusted for under-18 users? Can they confirm that every staff member and student has an nga.ac.rw account?
3. **Default reminder offsets** per item type. Proposed: lesson 10 min, quiz 30 min before the start and 1 h before the close, assignment 24 h + 2 h, meeting 15 min.
4. **Are parents in scope?** If yes, push (installed PWA) and opt-in email only — no SMS.
5. **Should MIS be the single push origin** for all apps? Recommended.

---

## 10. Sources

- Chrome — [Notification Triggers API (development ended)](https://developer.chrome.com/docs/web-platform/notification-triggers)
- web.dev — [Push notifications FAQ](https://web.dev/push-notifications-faq/); [Installation prompt](https://web.dev/learn/pwa/installation-prompt)
- MDN — [Trigger install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- WebKit — [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/); [Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- Pushpad — [iOS requirements for web push](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications); MagicBell — [PWA iOS limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- Firebase — [Message options, priority and TTL](https://firebase.google.com/docs/cloud-messaging/concept-options)
- Google Calendar API — [Reminders & notifications](https://developers.google.com/workspace/calendar/api/concepts/reminders); [Usage limits](https://developers.google.com/workspace/calendar/api/guides/quota); [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push); [Choose scopes](https://developers.google.com/workspace/calendar/api/auth)
- Google Identity — [Service accounts & domain-wide delegation](https://developers.google.com/identity/protocols/oauth2/service-account); [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification); [Configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent)
- Google Workspace Admin — [Domain-wide delegation](https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation); [Avoid Calendar use limits](https://support.google.com/a/answer/2905486)
- Google Calendar help — [Add a calendar to your website](https://support.google.com/calendar/answer/41207); Classroom — [Due dates in Google Calendar](https://support.google.com/edu/classroom/answer/6272985)
- ICS refresh behaviour — [Calfeed](https://calfeed.ai/learn/ics-refresh-rate-apple-google); [Google community: alarms ignored](https://support.google.com/calendar/thread/9627602)
- Mozilla support — [Embedded Google Calendar iframe issues](https://support.mozilla.org/en-US/questions/1381603)
- Add-to-calendar URL — [Google template link parameters](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html)
- Messaging costs (why SMS/WhatsApp are excluded) — [Africa's Talking pricing](https://africastalking.com/pricing); [Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Free tiers — [Workspace for Education Fundamentals (no cost)](https://edu.google.com/intl/ALL_us/workspace-for-education/editions/education-fundamentals/); [Gmail sending limits in Workspace](https://support.google.com/a/answer/166852?hl=en); [SMTP relay limits](https://knowledge.workspace.google.com/admin/gmail/advanced/route-outgoing-smtp-relay-messages-through-google)
- Calendar UI libraries — [Schedule-X](https://github.com/schedule-x/schedule-x); [LogRocket: React scheduler libraries](https://blog.logrocket.com/best-react-scheduler-component-libraries/)
