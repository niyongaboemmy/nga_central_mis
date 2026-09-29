# NGA Reminders — Zero-Cost Multi-Channel Solution Proposal

**Date:** 2026-09-29 · **Applies to:** Central MIS, Task Mentor, Tupo, Discipline & Attendance
**Supersedes:** §5 and §8 of [REMINDERS_FEASIBILITY_STUDY.md](REMINDERS_FEASIBILITY_STUDY.md). That section assumed an nga.ac.rw Google Workspace, and nga.ac.rw email is actually hosted on `hackflix.net`, not Google.
**Constraints:** **0 RWF budget.** No organisational Google account required. Must work with the app/browser closed. **The app is delivered as an installable web app (PWA). Users are prompted to install it locally; no app-store app.**

---

## 1. The proposal in one paragraph

We ship **one installable "NGA" web app (PWA)** from the MIS origin. It is prompted for install on every platform that allows it, and silently installed on school-managed PCs. Inside it we build one **Reminder Hub**. It turns every lesson, quiz, assignment, activity and meeting into scheduled reminders, and **delivers each one through the user's best free channel**:

- **native calendar alarms** — the user's *own* Google Calendar via "Connect Google Calendar" (any Google account, including personal Gmail), or an Apple/Outlook calendar feed
- **Web Push** to the browser or installed PWA
- an optional **Telegram bot**
- the **in-app bell / live "Now & Next"** view

Every device and situation is covered by at least one channel that works with our app closed, and the whole thing costs nothing to run.

---

## 2. Why this design: the facts that shape it

| Fact | Source | Consequence |
|---|---|---|
| Rwanda mobile OS share (Aug 2026): **Android 78.1 %, iOS 21.7 %** | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/rwanda) | Android is the main target. On Android, Web Push arrives **even when the browser is closed**, because the OS wakes it up ([web.dev](https://web.dev/push-notifications-faq/)). |
| A web page cannot schedule its own future notification. Notification Triggers was **abandoned**. | [Chrome](https://developer.chrome.com/docs/web-platform/notification-triggers) | Reminders must be sent from the server at the right time, **or** handed to a native calendar that alarms on its own. |
| **Calendar alarms are stored on the device and fire offline.** Once an event has synced, the phone alerts with no data connection. | Native behaviour of Google/Apple Calendar | This is the most reliable channel we can get for free, so it is the "anchor" channel for lessons. |
| On iOS, Web Push works only for Home-Screen-installed web apps (16.4+). Declarative Web Push (18.4+) makes delivery more reliable. | [WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/), [Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications) | iPhone users who don't install the app need another channel: a calendar or Telegram. |
| Desktop Web Push arrives only while the browser process is running. Chrome's "continue running background apps" setting keeps it alive. | [web.dev](https://web.dev/push-notifications-faq/), [Chrome policy](https://chromeenterprise.google/intl/en_au/policies/background-mode-enabled/) | Desktops are a secondary channel. Phones carry the critical path. |
| Google Calendar reminders are **per user**. Overrides only apply on a calendar the user owns. | [Google](https://developers.google.com/workspace/calendar/api/concepts/reminders) | We write into a calendar **our app creates inside the user's own account**, so our reminder offsets apply to them. |
| The `calendar.app.created` scope lets an app create secondary calendars and manage events **only on those**. It cannot see the user's other events. | [Google scopes](https://developers.google.com/workspace/calendar/api/auth) | Minimal-privilege and privacy-friendly: we never read personal calendars. |
| Calendar scopes are **sensitive**. Verification by Google is **free** and takes ~2–6 weeks; paid security assessments apply only to *restricted* scopes. Until then: 100 test users and 7-day token expiry. | [Google verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Unipile](https://www.unipile.com/google-oauth-100-user-limit/) | Pilot with ≤100 users while the free verification runs, then open to everyone. |
| Calendar API: 600 req/min per user, 10,000/min per project, free under the 1 M/day threshold. | [Google quota](https://developers.google.com/workspace/calendar/api/guides/quota) | Recurring events keep us at roughly 50–100k writes **per term**, far below the limits. |
| Google refreshes subscribed `.ics` URLs only every 8–24 h. Apple Calendar lets the user choose the refresh interval and keep the feed's alerts. | [Calfeed](https://calfeed.ai/learn/ics-refresh-rate-apple-google), [Apple](https://support.apple.com/en-nz/guide/calendar/icl1022/10.0/mac/10.13) | An `.ics` feed is good for **Apple/Outlook users**, but not the Google path; Google users get the API instead. |
| Chromium (Chrome, Edge, Samsung, Opera) lets a site show **its own "Install" button** via `beforeinstallprompt` (needs a SW fetch handler). The new **`<install>` element** (origin trial Chrome/Edge 148–153) and **`navigator.install()`** (OT 143–148) add a browser-trusted install button. | [Chrome](https://developer.chrome.com/blog/install-element-ot?hl=en), [Edge](https://blogs.windows.com/msedgedev/2025/11/24/the-web-install-api-is-ready-for-testing/), [Chrome criteria](https://developer.chrome.com/blog/update-install-criteria) | On ~80 % of devices we can offer one-tap install from our own UI. |
| iOS/iPadOS has no install API. The user taps Share → Add to Home Screen → "Open as Web App" (iOS 26 makes any site a web app this way). macOS Safari 17+: File → Add to Dock, with its own notification settings. | [MacRumors](https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/), [Apple](https://support.apple.com/en-ug/104996) | We need a guided, illustrated install sheet. On iOS, installing is the **gate for push**. |
| **Managed Windows PCs** can be given the app for free via Chrome/Edge policies: `WebAppInstallForceList` (silent install), `NotificationsAllowedForUrls` (pre-granted notifications), `WebAppSettings.run_on_os_login = run_windowed` (auto-start at login). | [Chrome policy](https://chromeenterprise.google/intl/en_ca/policies/web-app-install-force-list/), [Edge WebAppSettings](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/webappsettings) | School labs and staff laptops get install + permission + auto-start without any user action. |
| Chrome **auto-revokes notification permission** from low-engagement, high-volume sites (Oct 2025) and **rate-limits push** for them (Jan 2026). | [Chromium blog](https://blog.chromium.org/2025/10/automatic-notification-permission.html), [Chrome](https://developer.chrome.com/blog/web-push-rate-limits) | Few, useful, tappable notifications keep our permission alive. We cap volume and watch permission state (§7.5). |
| Web apps **cannot** request Android battery-optimisation exemption, autostart or exact alarms. OEM skins (Tecno/Infinix/itel, Xiaomi) can delay background delivery. | [dontkillmyapp](https://dontkillmyapp.com/general) | We add an in-app "reliability check" with per-brand steps. Calendar alarms remain the offline anchor. |
| Telegram Bot API is free, with ~30 messages/s on the free tier. | [Telegram](https://core.telegram.org/bots/faq), [grammY](https://grammy.dev/advanced/flood) | 1,800 reminders/min is enough for a whole school at a lesson change. Telegram delivers natively on Android, iOS and desktop. |
| **Excluded as not free:** SMS / WhatsApp (per message), Play Store listing ($25), Apple Developer Program ($99/yr), ntfy.sh iOS relay beyond 250 msgs/day (paid tier), FullCalendar Premium. From 2027, sideloaded Android APKs need a registered developer ($25) beyond 20 devices. | [Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [Android verification](https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/), [ntfy issue](https://github.com/binwiederhier/ntfy/issues/1373) | No native app wrapper. The **PWA is our app.** |

---

## 3. Coverage matrix — "no gaps" by combination

Each row is a real situation. ✅ = works with our app closed, ◐ = works with conditions, ✖ = doesn't.

| Situation | Web Push | Google Calendar (connected) | Apple / Outlook feed | Telegram | In-app | **Covered?** |
|---|---|---|---|---|---|---|
| Android phone, locked, Chrome closed | ✅ | ✅ | — | ✅ | ✖ | **Yes (3 ways)** |
| Android phone, **offline** at reminder time | ✖ (queued until online) | ✅ alarm fires offline | — | ✖ (queued) | ✖ | **Yes** |
| iPhone, PWA installed to Home Screen | ✅ | ✅ (Google Calendar app) | ✅ | ✅ | ✖ | **Yes** |
| iPhone, **not** installed | ✖ | ✅ | ✅ Apple Calendar feed | ✅ | ✖ | **Yes** |
| Windows/Mac, browser running (or background mode) | ✅ | ◐ (Calendar tab/desktop) | ✅ (Outlook/Apple desktop) | ✅ | ✅ | **Yes** |
| **School-managed Windows PC** (policy-installed, auto-start at login, notifications pre-allowed) | ✅ | ◐ | — | — | ✅ | **Yes, with no user action** |
| Desktop, browser fully closed | ✖ | ✖ | ✅ (Mac Calendar / Outlook) | ✅ (Telegram Desktop) | ✖ | **Yes, if user chose one** |
| Student with no personal phone (boarding) | — | — | — | — | ✅ | **"Now & Next" classroom displays + in-app on school devices (§6.6)** |
| Parent, personal Gmail | ✅ | ✅ | ✅ | ✅ | ✅ | **Yes** |

**Residual limitation, stated honestly:** a phone that is switched off, or a user who has opted out of every channel, cannot be reminded by *any* system, free or paid. Everything else is covered.

---

## 4. Architecture

```
                         ┌──────────────────────── Central MIS (existing EC2 + MySQL) ─────────────────────────┐
 Sources                 │                                                                                     │
 • MIS timetable ───────►│  Reminder Hub                                                                        │
 • MIS activities        │  ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────────────┐ │
 • Task Mentor quizzes ─►│  │ Source API │──►│  Occurrence  │──►│  reminder_  │──►│ Dispatcher (1-min tick)  │ │
 • Task Mentor assign.   │  │ + outbox   │   │  expander    │   │  jobs table │   │ routing + escalation     │ │
 • Tupo meetings ───────►│  └────────────┘   │ Africa/Kigali│   └─────────────┘   └───────────┬──────────────┘ │
 • Discipline (absences, │                   └──────────────┘                                 │                │
   excuses → suppress)   │   Calendar Sync worker (event-driven, not per-minute) ◄────────────┤                │
                         └────────────────────────────────────────────────────────────────────┼────────────────┘
                                                                                              │
          ┌──────────────────────┬──────────────────────┬──────────────────────┬──────────────┴───────┐
          ▼                      ▼                      ▼                      ▼                      ▼
   Web Push (VAPID)     User's Google Calendar   webcal:// .ics feed     Telegram bot         In-app bell / SSE
   Android · Desktop ·  "NGA · My Timetable"     Apple · Outlook ·       (opt-in)             "Now & Next" · Badging
   iOS installed PWA    (app-created, alarms     Thunderbird             inline Ack / Snooze
                        fire on device, offline)
```

**Design principles**

1. **Our database is the single source of truth.** Calendars are one-way mirrors. We never read or merge a user's personal events.
2. **Two delivery styles:**
   - *Push-at-time* (Web Push, Telegram, in-app): the dispatcher sends at `fire_at`.
   - *Pre-armed* (Google/Apple calendars): we sync events ahead of time, and the device alarms on its own, even offline.
3. **Route, don't spam.** Per item type we choose a *primary* channel plus an *escalation* channel. A student with Google Calendar connected gets the lesson alert from the calendar, not also a push and a Telegram message.
4. **Everything idempotent.** A unique key on `(user_id, occurrence_id, offset_min, channel)`. Safe to re-run, safe across restarts.
5. **No new infrastructure.** A MySQL sweep with `SELECT … FOR UPDATE SKIP LOCKED` (MySQL 8) or a claim-token column (MySQL 5.7). No Redis, no queue service.

---

## 5. Data model (MIS, Drizzle)

| Table | Key columns | Notes |
|---|---|---|
| `reminder_sources` | `id`, `source_app` (mis/taskmentor/tupo), `source_type` (lesson_slot, activity, quiz_open, quiz_close, assignment_due, meeting), `source_id`, `title`, `starts_at`/`rrule`, `audience` (class_group_id / user_ids), `critical` bool, `cancelled_at` | Written by MIS itself and by the other apps via the Source API |
| `reminder_occurrences` | `id`, `source_id`, `starts_at` (UTC), `ends_at`, `status` | Expanded 14 days ahead, and re-expanded on change |
| `reminder_jobs` | `id`, `user_id`, `occurrence_id`, `offset_min`, `fire_at`, `channel`, `status` (pending/sent/acked/failed/suppressed), `attempts`, `sent_at`, `acked_at`, `claim_token` | Unique key: `(user_id, occurrence_id, offset_min, channel)` |
| `reminder_prefs` | Extends existing `CalendarNotification`: per `source_type` → `offsets[]`, `enabled`, `primary_channel`, `quiet_hours` | The existing modal is reused and extended |
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth`, `ua`, `platform`, `last_ok_at`, `failures` | Delete on 404/410 |
| `calendar_links` | `user_id`, `provider` (google), `google_sub`, `refresh_token_enc` (AES-256-GCM), `calendar_id`, `status`, `last_sync_at`, `last_error` | One per user |
| `calendar_event_map` | `user_id`, `source_id`, `google_event_id`, `etag`, `hash` | Lets us patch rather than re-create |
| `ics_feed_tokens` | `user_id`, `token` (random 32 B), `created_at`, `revoked_at` | Secret feed URL, revocable |
| `telegram_links` | `user_id`, `chat_id`, `linked_at`, `muted` | Linked via a one-time deep-link code |

**Timezone:** Africa/Kigali is UTC+2 with no DST. Store UTC, render in Kigali.

**Existing rules to reuse:** the "live lesson" filter (`liveLessonFilters` / `loadTeacherLessons`), so that disabled subjects, tombstoned slots and overlapping phantom slots never produce reminders.

---

## 6. Channels — specification

### 6.1 Web Push (primary on Android and desktop; iOS when installed)

- **Stack:** `web-push` (MIT) + self-generated VAPID keys in env. No Firebase project, no SaaS. Browsers' push services are free for senders.
- **Service worker:** extend a single SW served from the MIS origin. The four apps share one push origin, so users grant permission **once**. Other apps deep-link through MIS.
- **Headers:**
  - `Urgency: high`, so reminders are not held back in Android Doze.
  - `TTL` = seconds until the event starts, so a late message is dropped instead of arriving after the lesson began.
  - `Topic: <occurrence>`, so an updated push replaces an undelivered older one.
- **Payload:** send the **Declarative Web Push** JSON (`"web_push": 8030` with `notification.title/body/navigate`) that Safari 18.4+ displays without running JS. The normal SW `push` handler parses the same JSON for Chromium and Firefox ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)).
- **Modern extras:**
  - **Notification actions** "✅ Got it" / "⏰ Snooze 5 min" (Chromium desktop and Android; Safari ignores actions and falls back to a tap-to-open deep link) ([ref](https://www.web-push-notifications.com/core-protocols-browser-implementation/browser-compatibility-reference/which-browsers-support-web-push-notification-actions/)).
  - **Badging API** for pending-deadline counts on the installed app icon.
  - A `tag` on each notification, so a changed lesson updates the existing notification rather than stacking a new one.
- **Permission UX:** ask only after a user gesture ("Turn on reminders"), never on page load. Show a per-device list with a "Send test" button.

### 6.2 "Connect Google Calendar" (anchor channel for lessons; works with **any** Google account)

- **OAuth:** a separate, incremental consent, not tied to login. Scopes `openid email https://www.googleapis.com/auth/calendar.app.created`. Consent screen type **External**. Submit for **free sensitive-scope verification** using the amashuri.com domain, privacy policy and demo video. Pilot with ≤100 test users meanwhile.
- **On connect:**
  1. `calendars.insert` → "NGA · My Timetable" (`timeZone: Africa/Kigali`), then set its colour.
  2. For each lesson slot the user attends or teaches: **one recurring event per term** (`RRULE:FREQ=WEEKLY;UNTIL=<term end>`, `EXDATE`s for holidays). `reminders: {useDefault:false, overrides:[{method:"popup", minutes:<pref>}]}`, and `extendedProperties.private.ngaSourceId`.
  3. Quizzes, deadlines and meetings become single events on the same calendar.
- **On change:** the Source API triggers a diff. We `patch` (by `calendar_event_map`) or add an exception instance for a one-off cancellation.
- **Robustness:**
  - Pass `quotaUser=<user_id>` and use exponential backoff on 403/429.
  - On `invalid_grant` (user revoked access), mark the link `disconnected` and show an in-app banner.
  - Run a nightly reconcile using the `hash` column.
- **Volume:** ~40 recurring events per student per term, plus a few dozen single events. For 2,000 users that is ≈ 100k writes/term, ≈ 0.01 % of the daily free threshold.
- **Privacy:** the scope cannot read the user's other calendars. The refresh token is encrypted at rest. "Disconnect" deletes the calendar and revokes the token.

### 6.3 Calendar feed (`webcal://`) — Apple Calendar, Outlook, Thunderbird

- **Endpoint:** `GET /cal/<token>.ics`. It contains a `VCALENDAR` with the user's next 8 weeks. Each event has a `VALARM` (`TRIGGER:-PT<pref>M`), plus `REFRESH-INTERVAL;VALUE=DURATION:PT1H` and `X-PUBLISHED-TTL:PT1H` hints.
- **Onboarding copy:** one-tap "Add to Apple Calendar" (`webcal://` link). On Mac, **untick "Remove alerts"** and set auto-refresh; the iPhone flow is to be validated in the pilot. Outlook: "Subscribe from web".
- **Google users are steered to 6.2**, because Google's feed refresh (8–24 h) is too slow.
- **Security:** a random token acts as the secret. The feed contains titles, times and rooms only, no personal data. The token can be regenerated or revoked from settings.
- **Reuse:** Tupo's existing `.ics` builder, extracted to a shared helper.

### 6.4 Telegram bot (optional, opt-in)

- **Why:** a free native push on every OS, including iPhones without the PWA and closed desktops. Messages queue and are delivered when the phone comes back online.
- **Link flow:** "Connect Telegram" → `t.me/<NgaBot>?start=<one-time code>` → the bot stores `chat_id`.
- **Messages:** "📘 Physics · S4 MPC · Room B2 · starts 10:20 (in 10 min)" with inline buttons **✅ Got it / ⏰ Snooze 5 min**. Acks come back via webhook.
- **Throughput:** a queue paced at ≤25 msgs/s. A lesson change for 1,000 students clears in ~40 s. Offsets are staggered by a few seconds per class to smooth bursts.
- **Scope:** staff and parents first. Students only where age-appropriate under Telegram's terms and the school's safeguarding policy.

### 6.5 Email (opt-in, critical only)

- Existing nodemailer + SMTP. Used for: the weekly "your week ahead" summary (opt-in) and escalation of **critical** items (exams, quiz closing) when nothing was acknowledged.
- Volume is kept low to stay within the SMTP provider's limits. The limits of the existing `hackflix.net` server must be confirmed.

### 6.6 In-app, "Now & Next", and classroom displays

- **Live "Now & Next" card** (Today page in MIS and Discipline): current lesson, next lesson with a countdown, deadlines due today. It updates via the existing SSE/socket. Unread count in the bell, and the **Badging API** on installed PWAs.
- **Classroom / corridor display mode:** `/display/<class-or-block>` is a full-screen, auto-refreshing, read-only page for any old TV, projector or spare PC. It shows "Now / Next / Bell in 4 min". This covers students without phones at **zero cost** on hardware the school already has.
- **Morning briefing:** a 06:30 push/Telegram/in-app card with today's lessons, deadlines and meetings.

---

## 7. The installable NGA app and permission strategy

### 7.1 One app, not four

- **One hub PWA at the MIS origin** (the domain users already sign in on). Notification permission and push subscriptions are **per origin**, so one origin means one install, one permission prompt and one push subscription for all four apps.
- **Manifest:**
  - `id: "/"`, `name: "NGA"`, `short_name`, maskable icons, `display: "standalone"`, `start_url: "/today"`, `scope: "/"`, `theme_color`
  - **`shortcuts`**: Today, Timetable, My Tasks, Messages, Attendance (long-press on the icon)
  - **`launch_handler: {client_mode: "focus-existing"}`**, so tapping a notification reuses the open window
  - `screenshots` (richer Android/desktop install dialog)
- **Service worker** (one file, at the MIS origin):
  - fetch handler with an offline page and cached **Today / timetable** data, so "Now & Next" works without a connection
  - `push` / `notificationclick` handlers
- Task Mentor, Tupo and Discipline open from the hub's shortcuts and tiles. They keep their existing manifests, but **reminders and push always come from the hub**.

### 7.2 How we prompt installation — per platform

| Platform | Mechanism | Our UX |
|---|---|---|
| Android — Chrome, Samsung Internet, Edge, Opera (≈ 78 % of phones) | `beforeinstallprompt` → our own **"Install NGA app"** button → installs a **WebAPK** (app drawer, Android Settings, its own notification settings) | Banner on the Today page + a button in Settings. Progressive enhancement: `<install>` element / `navigator.install()` where the origin trial is active |
| Windows / macOS / Linux — Chrome, Edge | Same as above (desktop app window, taskbar/dock icon) | Same button. After install, suggest "Start app when you sign in" (about://apps) |
| iPhone / iPad — Safari, and Chrome/Edge/Firefox on iOS 16.4+ | Manual only: Share → Add to Home Screen → **"Open as Web App" ON** (iOS 26) | Illustrated 3-step bottom sheet, shown when the user taps "Turn on reminders", because on iOS install is required for push |
| macOS — Safari 17+ | File → **Add to Dock** (separate notification settings, badge on the Dock icon) | Short guide card |
| Windows — Firefox 143+ | "Taskbar tabs" (partial PWA support) | Guide card. Push works while Firefox runs |
| macOS/Linux — Firefox | No install | Push works while the browser runs. Suggest a calendar channel |
| **School-managed Windows PCs** | GPO/registry policies (§7.4). Free, no Chrome Enterprise licence required for local policies | Installed automatically; notifications pre-allowed; auto-start |

**Detecting installs and avoiding nagging:**
- Detect installs with `matchMedia('(display-mode: standalone)')`, `navigator.standalone` (iOS) and the `appinstalled` event. Store `installed=true` per device.
- If the user dismisses the prompt, wait **14 days** before asking again. Never show it on the first visit.
- Track the funnel: prompt shown → installed → notifications on → first reminder tapped.

### 7.3 When and how to ask for notification permission

1. **Never on page load.** Only after a clear intent, e.g. the user taps **"Turn on reminders"** on Today or in Settings. This also avoids Chrome's quiet-UI/abuse heuristics ([Chrome](https://developer.chrome.com/blog/permissions-chip)).
2. **Two-step:** first our own card ("Get a reminder 10 min before each lesson and 30 min before quizzes"), and only if the user taps "Yes" the browser prompt.
3. **iOS:** install first, then open from the Home Screen, then the permission prompt (it must come from a user gesture inside the installed app).
4. After granting: `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VAPID})`, save the subscription, and **send a test notification immediately**, so the user sees it works.

### 7.4 Permissions and capabilities — what we can get

| Capability | How it is granted | Support | Use for reminders | Decision |
|---|---|---|---|---|
| **Notifications + Push** | `Notification.requestPermission()` + `pushManager.subscribe` | All modern browsers. iOS/iPadOS only when installed | The core channel | **Use** |
| **Notification display options** | none | `actions`, `requireInteraction` (stays until dismissed) and `vibrate` are Chromium-only; `tag`/`renotify`/`timestamp` are widely supported; Safari shows title/body/icon only | "Got it / Snooze" buttons; sticky notifications for critical items (exam, quiz closing); a changed lesson replaces its old notification | **Use** |
| **Badging API** (`navigator.setAppBadge`) | No extra prompt | Installed apps: Chromium desktop, Safari macOS/iOS | Badge on the icon = deadlines due today | **Use** |
| **Periodic Background Sync** | `periodic-background-sync`; Chromium grants it to installed apps based on engagement | Chromium, installed only | Refresh the cached timetable daily so the offline "Now & Next" stays current. **Not** used for alarm timing, because timing isn't guaranteed | **Use (enhancement)** |
| **Background Sync** (one-off) | none | Chromium | Queue "Got it" / "Snooze" taps made offline | **Use** |
| **Persistent storage** (`navigator.storage.persist()`) | Auto-granted for installed apps in Chromium; Firefox prompts | Broad | Keep the offline timetable from being evicted | **Use** |
| **Run on OS login** | User setting (about://apps, Edge app menu) or the `WebAppSettings` policy. A site **cannot** request it itself | Chrome/Edge desktop | Desktop push keeps working after reboot | **Guide users; policy on school PCs** |
| **Pre-granted notifications + forced install** | `NotificationsAllowedForUrls`, `WebAppInstallForceList` policies | Chrome/Edge on managed Windows | Labs and staff laptops: zero-click | **Use on school devices** |
| **Screen Wake Lock** | none (needs a visible page) | Broad | Keep `/display` classroom screens awake | **Use (displays only)** |
| Idle Detection | `idle-detection` prompt | Chromium only | Could route in-app vs push; privacy-sensitive, low value | **Skip** |
| Notification Triggers (local scheduled notifications) | — | **Abandoned** | — | **Not available** |
| Battery-optimisation exemption, autostart, exact alarms (Android) | Native apps only | **Not available to web apps** | — | **Mitigate** (§7.6) |

**Example policy set for a school-managed Windows PC** (registry or GPO; the Edge equivalents live under `Policies\Microsoft\Edge`):

```text
HKLM\SOFTWARE\Policies\Google\Chrome
  WebAppInstallForceList   = [{"url":"https://<mis-origin>/today","default_launch_container":"window","create_desktop_shortcut":true}]
  NotificationsAllowedForUrls\1 = https://<mis-origin>
  WebAppSettings           = [{"manifest_id":"https://<mis-origin>/","run_on_os_login":"run_windowed"}]
  BackgroundModeEnabled    = 1
```

### 7.5 Keeping the permission alive

Chrome removes notification permission from sites with low engagement and high notification volume, and rate-limits their push ([Chromium blog](https://blog.chromium.org/2025/10/automatic-notification-permission.html), [Chrome](https://developer.chrome.com/blog/web-push-rate-limits)). A school app sending a few useful reminders a day should never qualify, but we design for it anyway:

- **Volume cap:** ≤ 8 pushes/user/day. Students' lesson reminders collapse into the morning briefing plus one "next lesson" push when the Google Calendar channel isn't connected.
- **Every notification is actionable** (deep link, Got it/Snooze), which raises engagement.
- **Health check on every app open:**
  1. read `Notification.permission` and `pushManager.getSubscription()`
  2. if the permission was revoked or the subscription expired, show a one-tap **"Reminders are off — turn back on"** banner
  3. re-subscribe silently when the permission is still granted but the subscription changed (`pushsubscriptionchange`)
- **Server side:** a 404/410 from the push service removes the subscription and routes that user to their next channel (§8).

### 7.6 Android reliability helper (Tecno / Infinix / itel / Xiaomi / Samsung)

A web app cannot exempt itself from OEM battery savers, so we guide the user instead:

- **"Reminder reliability check"** in Settings:
  1. sends a test push
  2. asks "Did you see it?"
  3. if not, shows brand-specific steps (allow Chrome/NGA autostart, set battery to "No restrictions", allow "Pop on screen") using the phone's detected brand, with a link to [dontkillmyapp.com](https://dontkillmyapp.com/general)
- For users whose phone still drops pushes, the router promotes **Google Calendar** or **Telegram** to the primary channel.

### 7.7 What no web app can do (the honest ceiling)

A site cannot:
- force an install
- auto-grant its own permissions (only admins can, on managed devices)
- exempt itself from battery optimisation
- schedule a local alarm

That's why the plan keeps **native calendar alarms** (Google/Apple) as the offline anchor and **Telegram** as the native fallback. The PWA maximises reach; it doesn't have to carry every case alone.

---

## 8. Routing and escalation policy (defaults, user-overridable)

| Item | Offsets | Primary channel (first available in order) | Escalation if not acked |
|---|---|---|---|
| Lesson (student) | 10 min | Google Calendar → Apple feed → Web Push → Telegram | none (low stakes) |
| Lesson (teacher) | 15 min | Google Calendar → Web Push → Telegram | none |
| Quiz opens | 30 min | Web Push → Telegram → in-app | Email at T-10 if `critical` |
| Quiz closes | 60 min + 15 min | Web Push → Telegram | Email at T-15 |
| Assignment due | 24 h + 2 h | Web Push → Telegram → in-app | Email at T-2 h |
| Meeting | 15 min | Google Calendar → Web Push → Telegram | none |
| Lesson changed / cancelled | immediate | Web Push + Telegram + calendar patch | — |

**Smart suppression**, using data we already have:
- No lesson reminders for a student marked **absent or excused** that day (Discipline & Attendance).
- No reminders during school holidays (term dates).
- No reminders for disabled subjects.
- Quiet hours (default 21:00–06:00, except critical).
- No "quiz closes" reminder if the student already submitted.

**Acknowledgement:** a tap on a push, a Telegram button or opening the item marks the job `acked`. This feeds the escalation logic and a delivery dashboard.

---

## 9. Security and privacy (Rwanda Law No. 058/2021 on personal data)

- **Data minimisation:**
  - Google scope limited to app-created calendars. We never read personal events.
  - Push and Telegram payloads contain the title, time and room only. No grades or discipline data.
- **Secrets:**
  - VAPID private key, Telegram bot token and the OAuth client secret live in env/secret store, never in the repo.
  - Refresh tokens are AES-256-GCM encrypted.
  - A client-secret leak has happened before (see the MIS unified Home plan), so rotate keys on any exposure.
- **User control:** one "Connected reminders" page: devices, Google, calendar feed, Telegram. Each has **disconnect / revoke**. Disconnecting Google deletes the NGA calendar.
- **Minors:** channels are opt-in. Guardians can be added as recipients of a student's critical reminders.
- **Auditability:** `reminder_jobs` doubles as a delivery log. Admins get a 7-day delivery and ack dashboard.

---

## 10. Cost statement

| Item | Cost |
|---|---|
| Web Push (VAPID, browser push services) | 0 |
| Google Calendar API + OAuth verification (sensitive scope) | 0 |
| `.ics` feed | 0 (our server) |
| Telegram Bot API (free tier) | 0 |
| Email | 0 (existing SMTP) |
| Hosting | 0 extra (existing EC2 + MySQL; no Redis) |
| Libraries: `web-push` (MIT), `googleapis` (Apache-2.0), `grammy` (MIT), optional `vite-plugin-pwa` (MIT) | 0 |
| **Total running cost** | **0 RWF** |

**Guards:**
- The Google Cloud project has **no billing account** attached, so going over quota can only throttle, never charge.
- Telegram "paid broadcasts" are never enabled.

---

## 11. Delivery plan

| Phase | Scope | Effort* | External dependency |
|---|---|---|---|
| **1. Hub + installable NGA app + Web Push + in-app** | Tables, occurrence expander, 1-min dispatcher, Source API; hooks in Task Mentor and Tupo; **hub manifest (id, shortcuts, launch_handler), SW with offline Today cache**; **install UX per platform** (Chromium button, iOS/macOS guide sheets, `<install>` progressive enhancement, install funnel tracking); two-step permission UX, test push, device list, permission health check; SW push handler with Declarative payload, actions, badging; periodic/background sync; "Now & Next" card; settings page | 5–6 wks | none |
| **1b. School-device rollout** | Policy pack (registry/GPO JSON for Chrome + Edge): force-install, pre-allowed notifications, run on login; IT runbook | 2–3 days | School IT |
| **2. Calendar feed + add-to-calendar** | `webcal` feed with VALARM, token management, Apple/Outlook onboarding; one-tap "Add to Google Calendar" links (with `recur=RRULE…`) for users who won't connect | 1 wk | none |
| **3. Connect Google Calendar** | OAuth incremental consent, calendar creation, recurring-event sync, diff/patch, reconcile, disconnect | 2–3 wks (+2–6 wks Google review running in parallel; pilot ≤100 users meanwhile) | Google verification (free) |
| **4. Telegram bot** | Link flow, paced sender, Ack/Snooze webhook | 1 wk | none |
| **5. Displays + escalation + dashboard + reliability helper** | `/display` mode (Wake Lock), critical escalation to email, delivery/ack/install-funnel dashboard, absence-based suppression, Android reliability check | 1–2 wks | none |
| **Total** | | **≈ 10–13 developer-weeks** | |

\* One full-stack developer who knows the codebase, ±30 %.

**Pilot:** one class group plus its teachers for two weeks after Phase 1. Measure delivery rate, ack rate and opt-out rate before rolling out school-wide.

**Success metrics:**
- ≥ 90 % of active users with at least one closed-app channel.
- ≥ 50 % of active mobile users with the NGA app installed after one term; 100 % of school-managed PCs.
- ≥ 95 % of reminders sent within 60 s of `fire_at`.
- Opt-out rate < 10 %.
- Fewer late arrivals and missed quiz windows, measured in Discipline & Attendance and Task Mentor.

---

## 12. Decisions needed

1. Approve this design (it replaces the Workspace-dependent phase of the feasibility study).
2. Confirm the public domain used for the OAuth consent screen (amashuri.com) and publish a privacy policy page. Both are required for the free Google verification.
3. Approve the default offsets in §8.
4. Telegram: staff and parents only, or students too? Safeguarding lead to decide.
5. Nominate the pilot class.
6. School IT: confirm which Windows PCs/laptops are domain- or policy-managed, so the install/notification/auto-start policy pack can be applied.

---

## 13. Sources

- StatCounter — [Mobile OS market share, Rwanda](https://gs.statcounter.com/os-market-share/mobile/rwanda)
- Chrome — [Notification Triggers (ended)](https://developer.chrome.com/docs/web-platform/notification-triggers); [Periodic Background Sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync); [BackgroundModeEnabled policy](https://chromeenterprise.google/intl/en_au/policies/background-mode-enabled/)
- web.dev — [Push notifications FAQ](https://web.dev/push-notifications-faq/)
- WebKit — [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/); Pushpad — [iOS web push requirements](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- Notification actions support — [web-push-notifications.com](https://www.web-push-notifications.com/core-protocols-browser-implementation/browser-compatibility-reference/which-browsers-support-web-push-notification-actions/)
- Google Calendar API — [Scopes](https://developers.google.com/workspace/calendar/api/auth); [Reminders](https://developers.google.com/workspace/calendar/api/concepts/reminders); [Quota](https://developers.google.com/workspace/calendar/api/guides/quota); [Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- Google OAuth — [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification); [App audience / user cap](https://support.google.com/cloud/answer/15549945?hl=en); [100-user cap and 7-day tokens explained](https://www.unipile.com/google-oauth-100-user-limit/)
- Add-to-calendar links — [Google template parameters incl. `recur`](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html)
- ICS refresh — [Calfeed](https://calfeed.ai/learn/ics-refresh-rate-apple-google); Apple — [Subscribe to calendars on Mac](https://support.apple.com/en-nz/guide/calendar/icl1022/10.0/mac/10.13)
- Install & PWA — [`<install>` element origin trial](https://developer.chrome.com/blog/install-element-ot?hl=en); [Web Install API (Edge)](https://blogs.windows.com/msedgedev/2025/11/24/the-web-install-api-is-ready-for-testing/); [Chrome installability criteria](https://developer.chrome.com/blog/update-install-criteria); [MDN: trigger install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt); [iOS 26 Add to Home Screen](https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/); [Safari web apps on Mac](https://support.apple.com/en-ug/104996); [Firefox web apps on Windows](https://support.mozilla.org/en-US/kb/web-apps-firefox-windows); [Run on OS login](https://developer.chrome.com/blog/run-on-login)
- Policies — [WebAppInstallForceList](https://chromeenterprise.google/intl/en_ca/policies/web-app-install-force-list/); [Edge WebAppSettings (run_on_os_login)](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/webappsettings); [Teams PWA deployment example](https://learn.microsoft.com/en-us/microsoftteams/teams-progressive-web-apps)
- Permission health — [Chrome auto-revocation](https://blog.chromium.org/2025/10/automatic-notification-permission.html); [Push rate limits](https://developer.chrome.com/blog/web-push-rate-limits); [Permissions chip](https://developer.chrome.com/blog/permissions-chip); [Periodic Background Sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync); [WebAPK notifications](https://firt.dev/pwa-secrets/); [dontkillmyapp](https://dontkillmyapp.com/general)
- Telegram — [Bots FAQ](https://core.telegram.org/bots/faq); [Bot API](https://core.telegram.org/bots/api); [grammY flood limits](https://grammy.dev/advanced/flood)
- Excluded options — [Meta WhatsApp pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [Android developer verification timeline](https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/); [ntfy upstream rate limits](https://github.com/binwiederhier/ntfy/issues/1373); [FullCalendar vs alternatives](https://blog.logrocket.com/best-react-scheduler-component-libraries/)
