# NGA Desktop — Implementation Plan

> **One native Windows/macOS app that hosts every NGA web app, with no copy of any of them.**
> NGA MIS, Task Mentor, Tendo and Tupo stay independent, online, and deployed exactly as today. A new repository, `nga-desktop` (Tauri 2 + React + TypeScript + Rust), produces `NGA-Setup.exe` / `.msi` and `NGA.dmg`. These open the live URLs inside one window, with a native app switcher, single sign-on, auto-update, and OS integration.

| | |
|---|---|
| **Status** | Proposal, ready for implementation |
| **Date** | 2026-10-02 |
| **Repos affected** | **new** `nga-desktop`; small changes in `nga_central_mis`, `nga-task-mentor`, `nga-discipline-attendance`, `nga-communication-module` |
| **Related docs** | `SSO_CLIENT_INTEGRATION.md`, `docs/APP_LAUNCH.md`, `docs/SINGLE_SIGN_OUT.md`, `frontend/src/components/apps/ngaApps.ts`, `frontend/src/components/ui/appLaunch.ts` |

---

## Table of contents

1. [TL;DR for developers](#1-tldr-for-developers)
2. [What we have today (codebase findings)](#2-what-we-have-today-codebase-findings)
3. [Key architecture decisions](#3-key-architecture-decisions)
4. [Target architecture](#4-target-architecture)
5. [The `nga-desktop` repository](#5-the-nga-desktop-repository)
6. [App registry & environments](#6-app-registry--environments)
7. [Rendering the web apps (multi-webview)](#7-rendering-the-web-apps-multi-webview)
8. [Authentication & sign-out](#8-authentication--sign-out)
9. [Changes required in the existing web apps](#9-changes-required-in-the-existing-web-apps)
10. [Platform capabilities matrix (Windows vs macOS)](#10-platform-capabilities-matrix-windows-vs-macos)
11. [Security model](#11-security-model)
12. [Builds, CI & release (GitHub Actions)](#12-builds-ci--release-github-actions)
13. [Code signing & notarization](#13-code-signing--notarization)
14. [Auto-update](#14-auto-update)
15. [Distribution & the download page](#15-distribution--the-download-page)
16. [Implementation phases (with tasks & acceptance criteria)](#16-implementation-phases-with-tasks--acceptance-criteria)
17. [Testing strategy](#17-testing-strategy)
18. [Risks & mitigations](#18-risks--mitigations)
19. [Open decisions](#19-open-decisions)
20. [Glossary](#20-glossary)

---

## 1. TL;DR for developers

- **New repo:** `nga-desktop`. No business logic, no database, no secrets. It is a native shell: a sidebar, an app switcher, settings, and an updater.
- **The web apps don't move.** The desktop app loads `https://mis.amashuri.com`, `https://taskmentor.amashuri.com`, `https://tendo.amashuri.com`, `https://tupo.amashuri.com`. A web deploy reaches desktop users on their next reload, with **no desktop release needed**.
- **Don't use `<iframe>`.** Each app runs in its own **child webview**, a real top-level browser context. Iframes break our auth: `SameSite=Lax` cookies, partitioned `localStorage` and `X-Frame-Options: DENY` all get in the way. See [§3, D2](#d2-native-child-webviews-not-iframes).
- **SSO reuses what exists.** MIS is the identity provider. Spoke apps sign in with the existing OAuth2 code flow. The desktop app opens a spoke through a new MIS route, `/desktop/launch/:key`, which mints the code with the same `authorizeSSO` call the MIS Apps menu uses today.
- **The web apps need a few small changes:** detect `NGADesktop` in the user agent, then hide the PWA install prompts, let the shell handle app switching, and use native print and download where needed.
- **Release** = push a `v*` git tag. GitHub Actions builds signed Windows and macOS installers plus the updater's `latest.json`. Installed apps update themselves.

---

## 2. What we have today (codebase findings)

This plan is grounded in the current code. Everything below was checked in the four repositories.

### 2.1 The four apps

| Key | Product | Repo / web package | Production origin | Start path | API origin | Dev port | Frontend stack |
|---|---|---|---|---|---|---|---|
| `mis` | **NGA MIS** (identity provider) | `nga_central_mis/frontend` | `https://mis.amashuri.com` | `/home` | `https://api.amashuri.com` | 5173 | React 18, Vite, Tailwind, react-router |
| `taskmentor` | **Task Mentor** | `nga-task-mentor/client` | `https://taskmentor.amashuri.com` | `/dashboard` | `https://taskmentor-api.amashuri.com` (+ `live.amashuri.com`) | 5174 (dev `base: /taskmentor/`) | React, Vite, Redux, socket.io, TF.js / MediaPipe (proctoring) |
| `tendo` | **Tendo** (discipline & attendance) | `nga-discipline-attendance/client` | `https://tendo.amashuri.com` | `/` | `/api/` on same origin, `tendo-api.amashuri.com` | 3000 | React, Vite |
| `tupo` | **Tupo** (chat, meet, mail, feed) | `nga-communication-module/apps/web` | `https://tupo.amashuri.com` | `/app` | `/api/` on same origin, `tupo-live.amashuri.com` (realtime) | 5194 | React, Vite, Tailwind 4, socket.io, WebRTC (Cloudflare SFU) |

All four are **static SPAs served by nginx** on the same VPS (`deploy/*.conf`, `infra/nginx/tupo.conf`), each with an `index.html` fallback. That suits a desktop shell that loads remote URLs.

### 2.2 Things that already exist and that we reuse

| Existing piece | Where | How the desktop app uses it |
|---|---|---|
| **App registry** `NGA_APPS` (key, name, origin, startPath, icon, color) | `nga_central_mis/frontend/src/components/apps/ngaApps.ts` | The desktop registry mirrors these keys and origins exactly. |
| **SSO code minting** before a launch (`authorizeSSO`, `resolveRedirectUri`, `buildLaunchHref`) | `nga_central_mis/frontend/src/components/ui/appLaunch.ts` | Reused by the new `/desktop/launch/:key` MIS route. |
| **OAuth2 code flow** (`POST /sso/token`, 5-minute single-use codes, exact redirect-URI match) | `SSO_CLIENT_INTEGRATION.md` | Unchanged. Spokes keep their own callbacks. |
| **Single sign-out** (OIDC back-channel logout, `token_version`, `/verify-mis` re-check every 60 s) | `docs/SINGLE_SIGN_OUT.md` | Works as-is in desktop. The shell adds "sign out everywhere" UX on top. |
| **Launchers in every app** (`SystemsMenu.tsx`, Tupo `AppsSwitcher.tsx`) open apps with `<a target="_blank">` | per `docs/APP_LAUNCH.md` | The shell **intercepts** those new-window requests and switches tabs instead. |
| **PWA install prompts** (`AutoInstallPrompt`, `ngaInstall.tsx`) | all four apps | Must be **suppressed** inside the desktop app (§9). |
| **Theme** (`preferred_theme` in the MIS JWT) | MIS backend | The shell can match light/dark (optional). |

### 2.3 Facts that constrain the design

| Finding | Evidence | Consequence |
|---|---|---|
| Auth tokens live in **per-origin `localStorage`** (`token`, `sso_token`, `tupo_token`) | `frontend/src/utils/auth.ts`, `client/src/context/AuthContext.tsx`, `apps/web/src/pages/mail/api.ts` | Each app must run as a **first-party, top-level** context. Iframes get partitioned storage. |
| MIS sets `nga_auth_token` as **`httpOnly`, `SameSite=Lax`** | `backend/src/controllers/authController.ts:332` | Not sent in cross-site iframes, so iframes are ruled out. |
| `X-Frame-Options: DENY` is set by Tendo's and Tupo's servers | `nga-discipline-attendance/server/src/app.ts:50`, `nga-communication-module/apps/api/src/app.ts:38` | Same conclusion. Keep these headers. Don't weaken them for desktop. |
| MIS login offers **Google OAuth** (`@react-oauth/google`) | `frontend/package.json` | Google blocks sign-in inside embedded webviews (`disallowed_useragent`). This needs a system-browser flow (§8.4). |
| **Camera, mic and screen share** are used | Task Mentor proctoring (`useProctoring.tsx`, `proctoringMedia.ts`); Tupo Meet (`useMeetRoom.ts`, `useDevices.ts`, `VoiceRecorder.tsx`) | Needs macOS entitlements, Info.plist strings and webview permission handlers (§10). |
| **Client-side downloads** (jsPDF, xlsx, docx, exceljs) and **printing** (report cards) | MIS, Task Mentor, Tendo | Needs explicit download and print handling in WKWebView (§10). |
| **Web Push / service workers** for reminders | `frontend/src/reminders/push.ts`, `public/sw.js` in every app | Web Push is unreliable in embedded webviews. Use native notifications via a bridge (Phase 6). |
| Ports 5173/5174/3000/5194 are taken in dev | the `vite.config.ts` files | The desktop shell dev server uses **1420** (Tauri default). |

### 2.4 Why a desktop app when we already have PWAs?

The PWAs stay. They are the right answer for phones and casual users. The desktop app adds things the PWA path can't:

- **One installer for everything.** Today `docs/APP_LAUNCH.md` needs one click per app, and a silent install only on managed machines with policy files.
- **MSI for school IT**, deployable via GPO/Intune with no browser policy juggling.
- **One window with a unified switcher**, a tray icon and auto-start. Optionally, a future quiz "lockdown" mode for proctoring.
- **Controlled, verified updates** of the shell, independent of browser versions.

---

## 3. Key architecture decisions

### D1. Tauri 2 (not Electron)

| | Tauri 2 | Electron |
|---|---|---|
| Installer size | ~5–15 MB (uses the OS webview) | ~80–150 MB (ships Chromium) |
| Memory | Low | High (one Chromium per app) |
| Engine | WebView2/Chromium on Windows, **WKWebView/WebKit on macOS** | Chromium everywhere |
| Updater, signing, CI | First-party plugin + `tauri-action` | Mature (electron-builder) |
| Risk | WebKit on macOS differs from Chrome | None for rendering |

**Decision: Tauri 2.** It matches the research brief, and our users are on school PCs with limited bandwidth. The cost is testing all four apps on Safari/WebKit. Most issues will show up the same way in Safari, so the web apps gain from fixing them too.

*Escape hatch:* the shell UI is plain React. If WebKit blockers turn out to be unsolvable (see [§18](#18-risks--mitigations)), the same `src/` can be hosted in Electron with a moderate rewrite of the native layer only.

### D2. Native child webviews, not iframes

The brief's "Option B" (shell + embedded content) is right **for the UX**. Implementing it with `<iframe>` **will not work** for our apps:

1. **Partitioned storage.** An iframe of `mis.amashuri.com` inside `tauri://localhost` is third-party, so its `localStorage` is partitioned (Chromium) or blocked (WebKit ITP). Users would have to sign in every time, or not be able to at all.
2. **Cookies.** `nga_auth_token` is `SameSite=Lax`, so it is never sent in a cross-site iframe.
3. **`X-Frame-Options: DENY`** on Tendo and Tupo.
4. Our own `docs/SINGLE_SIGN_OUT.md` already rejected iframes for the same reason.

**Decision:** one native window contains:

- a **shell webview** (local React UI: sidebar, header, settings), and
- **one child webview per app**, each navigating **top-level** to its origin, so storage and cookies are first-party and behave exactly as in a browser tab.

Tauri 2 supports this via `Window::add_child(WebviewBuilder, position, size)` behind the **`unstable`** Cargo feature. We **pin an exact Tauri version** and wrap all webview management in one Rust module (`webviews.rs`). If the API changes, only that file changes.

**Fallback (no `unstable`):** "Option A+". Each app opens in its own `WebviewWindow` (one native window per app), and the shell becomes a small launcher window plus tray menu. The registry, auth and CI are identical, and the switch is one config flag (`layout: "tabs" | "windows"`).

### D3. MIS remains the only identity provider

No new auth server and no tokens in the shell. The shell never sees a JWT. Every token stays inside the web origin that owns it, exactly as in the browser.

### D4. The registry is bundled, with an optional remote override

The shell ships with a built-in registry (works offline, first launch). On start, it fetches a **public, signed-off JSON** from `https://mis.amashuri.com/desktop/apps.json`. That lets us add an app, rename one or change an icon **without a desktop release**. An origin that isn't in the bundled allow-list can't be added remotely (security, §11).

### D5. Releases hosted on GitHub Releases, mirrored to our server if the repo is private

`tauri-action` publishes to GitHub Releases. The updater and download page need **public** URLs. If `nga-desktop` stays private, CI also uploads the artifacts to `https://downloads.amashuri.com/desktop/` on the existing nginx VPS (§15).

---

## 4. Target architecture

### 4.1 Runtime view

```text
┌──────────────────────────── NGA Desktop (one native window) ─────────────────────────────┐
│ ┌─ shell webview (tauri://localhost, React) ─┐  ┌─ child webview: active app ────────────┐ │
│ │  [N] NGA                     ⟳  ⚙  👤      │  │                                       │ │
│ │  ─────────                                 │  │   https://taskmentor.amashuri.com     │ │
│ │  ▣ NGA MIS                                 │  │   (real top-level page, first-party   │ │
│ │  ▣ Task Mentor   ◀ active                  │  │    cookies + localStorage)            │ │
│ │  ▣ Tendo                                   │  │                                       │ │
│ │  ▣ Tupo   (3)                              │  │   other app webviews are kept alive   │ │
│ │  ─────────                                 │  │   but hidden (instant switching)      │ │
│ │  ⚙ Settings · ⓘ About · ⬆ Update           │  │                                       │ │
│ └────────────────────────────────────────────┘  └───────────────────────────────────────┘ │
│                     ▲ Tauri IPC (shell only)              │ HTTPS                           │
│              ┌──────┴──────────────┐                      ▼                                 │
│              │ Rust core (src-tauri)│        mis / taskmentor / tendo / tupo .amashuri.com  │
│              │ webviews · updater   │                      │                                 │
│              │ tray · deep links    │                      ▼                                 │
│              │ downloads · print    │        api / taskmentor-api / tendo / tupo APIs → DB  │
│              └──────────────────────┘                                                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Ecosystem view

```text
                              NGA PLATFORM
                                   │
          ┌────────────────────────┼─────────────────────────┐
          ▼                        ▼                         ▼
     WEB APPS (unchanged)      BACKENDS (unchanged)      DESKTOP (new)
  mis / taskmentor /          api.amashuri.com          nga-desktop repo
  tendo / tupo .amashuri.com  taskmentor-api, tendo,       │ tag v1.2.0
          │                   tupo APIs, MySQL/Redis       ▼
   deploy as today ──────────► users get it on reload   GitHub Actions
                                                        ├─ windows-latest → .exe/.msi (signed)
                                                        └─ macos-latest   → .dmg (signed+notarized)
                                                               ▼
                                                   GitHub Release + latest.json
                                                               ▼
                                   mis.amashuri.com/download · in-app updater
```

### 4.3 What triggers what

| Change | Web deploy | Desktop release |
|---|---|---|
| Feature/bug fix in MIS, Task Mentor, Tendo or Tupo | ✅ | ❌ not needed |
| Add, rename or re-icon an app (origin already allow-listed) | update `apps.json` | ❌ |
| Add an app on a **new** origin | update `apps.json` | ✅ (allow-list is compiled in) |
| Sidebar/settings UI, native feature, Tauri bump, security fix | — | ✅ |

---

## 5. The `nga-desktop` repository

```text
nga-desktop/
├── src/                              # Shell UI (React 18 + TS + Vite + Tailwind)
│   ├── main.tsx
│   ├── App.tsx                       # layout: Sidebar + <AppViewport/> placeholder
│   ├── components/
│   │   ├── Sidebar.tsx               # generated from the registry
│   │   ├── Header.tsx                # back / forward / reload / app title / user menu
│   │   ├── AppViewport.tsx           # measures its rect → tells Rust where to put the child webview
│   │   ├── LoadingOverlay.tsx
│   │   ├── OfflineScreen.tsx         # shown when an app fails to load
│   │   └── UpdateBanner.tsx
│   ├── pages/
│   │   ├── Settings.tsx              # environment (dev builds only), start app, autostart, theme
│   │   └── About.tsx                 # versions, licenses, diagnostics export
│   ├── config/
│   │   ├── apps.ts                   # bundled registry (see §6)
│   │   ├── environments.ts           # development / staging / production
│   │   └── allowlist.ts              # origins the shell will EVER load (generated from Rust, see §11)
│   ├── services/
│   │   ├── registry.ts               # bundled + remote apps.json merge & validation (zod)
│   │   ├── webviews.ts               # typed wrappers around Rust commands (show/hide/reload/navigate)
│   │   ├── updater.ts                # @tauri-apps/plugin-updater
│   │   └── settings.ts               # @tauri-apps/plugin-store
│   └── test/                         # vitest unit tests
├── src-tauri/
│   ├── Cargo.toml                    # tauri = { version = "=2.x.y", features = ["unstable", "tray-icon"] }
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   ├── shell.json                # permissions for the LOCAL shell webview only
│   │   └── remote-apps.json          # minimal, opt-in bridge for *.amashuri.com (Phase 6)
│   ├── icons/                        # generated by `tauri icon`
│   ├── entitlements.plist            # macOS camera/mic/network
│   ├── Info.plist                    # NSCameraUsageDescription, NSMicrophoneUsageDescription
│   └── src/
│       ├── main.rs
│       ├── lib.rs                    # builder, plugins, setup
│       ├── webviews.rs               # create/position/show/hide child webviews (only file using `unstable`)
│       ├── navigation.rs             # allow-list, new-window interception, external links → system browser
│       ├── downloads.rs              # on_download → ~/Downloads + notification
│       ├── print.rs                  # native print for the active webview
│       ├── tray.rs
│       └── commands.rs               # #[tauri::command]s exposed to the shell
├── scripts/
│   └── bump-version.mjs              # keeps package.json, Cargo.toml, tauri.conf.json in sync
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── package.json
├── vite.config.ts                    # port 1420, strictPort
└── README.md
```

**Bootstrap commands**

```bash
npm create tauri-app@latest nga-desktop -- --template react-ts --manager npm
cd nga-desktop
npm i -D tailwindcss @tailwindcss/vite vitest eslint typescript-eslint zod
npm i lucide-react @tauri-apps/api @tauri-apps/plugin-updater @tauri-apps/plugin-process \
      @tauri-apps/plugin-store @tauri-apps/plugin-opener @tauri-apps/plugin-notification \
      @tauri-apps/plugin-deep-link @tauri-apps/plugin-autostart @tauri-apps/plugin-single-instance
cd src-tauri && cargo add tauri-plugin-updater tauri-plugin-process tauri-plugin-store \
      tauri-plugin-opener tauri-plugin-notification tauri-plugin-deep-link \
      tauri-plugin-autostart tauri-plugin-single-instance tauri-plugin-window-state
npm run tauri icon ./brand/nga-1024.png
```

**Identity**

| Field | Value (proposed) |
|---|---|
| `productName` | `NGA` (installer: `NGA-Setup.exe`, `NGA.dmg`) |
| `identifier` | `com.amashuri.nga.desktop` (reverse-DNS; **can never change** after first release, because the updater and macOS keychain depend on it) |
| Deep-link scheme | `nga://` |
| Minimum OS | Windows 10 1809+ (WebView2), macOS 11+ (recommended 13+ for media features) |

---

## 6. App registry & environments

### 6.1 Bundled registry (`src/config/apps.ts`)

Keys and origins match `NGA_APPS` in `nga_central_mis/frontend/src/components/apps/ngaApps.ts`. Keep them in sync. A CI check in `nga-desktop` can diff against a published copy.

```ts
export type AppKey = "mis" | "taskmentor" | "tendo" | "tupo";

export interface DesktopApp {
  key: AppKey;
  name: string;
  description: string;
  origin: string;          // no trailing slash
  startPath: string;
  /** Extra origins this app legitimately navigates to inside its webview (its API UI, realtime, etc.). */
  alsoAllow?: string[];
  icon: string;            // lucide icon name for the sidebar
  color: string;
  ssoLaunch: boolean;      // true = open via MIS /desktop/launch/:key on first use (spokes)
  permissions?: Array<"camera" | "microphone" | "display-capture" | "notifications">;
}

export const BUNDLED_APPS: DesktopApp[] = [
  { key: "mis",        name: "NGA MIS",     description: "Timetable, lessons, reminders, reports",
    origin: "https://mis.amashuri.com",        startPath: "/home",      icon: "LayoutDashboard", color: "#2f56d9", ssoLaunch: false,
    permissions: ["notifications"] },
  { key: "taskmentor", name: "Task Mentor", description: "Quizzes, assignments, marks and report cards",
    origin: "https://taskmentor.amashuri.com", startPath: "/dashboard", icon: "GraduationCap",   color: "#3b82f6", ssoLaunch: true,
    permissions: ["camera", "microphone", "notifications"] },
  { key: "tendo",      name: "Tendo",       description: "Attendance and discipline",
    origin: "https://tendo.amashuri.com",      startPath: "/",          icon: "ClipboardCheck",  color: "#1e6fd9", ssoLaunch: true,
    permissions: ["notifications"] },
  { key: "tupo",       name: "Tupo",        description: "Chat, meetings, mail and the school feed",
    origin: "https://tupo.amashuri.com",       startPath: "/app",       icon: "MessagesSquare",  color: "#005EF9", ssoLaunch: true,
    permissions: ["camera", "microphone", "display-capture", "notifications"] },
];
```

The sidebar, keyboard shortcuts (`Ctrl/⌘+1…4`), tray menu and "start app" setting are all **generated from this array**. Nothing else hard-codes a URL.

### 6.2 Environments (`src/config/environments.ts`)

| App | development | staging | production |
|---|---|---|---|
| MIS | `http://localhost:5173` | `https://mis-staging.amashuri.com` *(to create)* | `https://mis.amashuri.com` |
| Task Mentor | `http://localhost:5174/taskmentor` | `https://taskmentor-staging.amashuri.com` | `https://taskmentor.amashuri.com` |
| Tendo | `http://localhost:3000` | `https://tendo-staging.amashuri.com` | `https://tendo.amashuri.com` |
| Tupo | `http://localhost:5194` | `https://tupo-staging.amashuri.com` | `https://tupo.amashuri.com` |
| Shell dev server | `http://localhost:1420` | — | bundled |

- The environment is chosen **at build time** (`VITE_NGA_ENV=production|staging|development`). Production builds contain **only** production origins in the allow-list, and the environment switcher in Settings is compiled out.
- Staging installers get a different `identifier` (`com.amashuri.nga.desktop.staging`) and name ("NGA Staging"), so they install side-by-side with production and never share storage.
- If staging subdomains don't exist yet, Phase 1 can use dev and production only. Staging is listed under [Open decisions](#19-open-decisions).

### 6.3 Remote registry (`https://mis.amashuri.com/desktop/apps.json`)

```json
{
  "schema": 1,
  "minDesktopVersion": "1.0.0",
  "apps": [ { "key": "tupo", "name": "Tupo", "origin": "https://tupo.amashuri.com", "startPath": "/app", "...": "..." } ]
}
```

Rules in `services/registry.ts`:

1. Validate with zod. If anything is invalid, ignore the whole file and use the bundled list.
2. Drop any entry whose `origin` is **not** in the compiled allow-list.
3. Cache the last good copy in `plugin-store` for offline starts.
4. If `minDesktopVersion` is newer than the running version, show the "Update required" banner.

Serve it as a static file from the MIS `frontend/public/desktop/apps.json`, with nginx `Cache-Control: no-cache` like `manifest.webmanifest`.

---

## 7. Rendering the web apps (multi-webview)

### 7.1 Lifecycle

```text
start ─► create window ─► add shell webview (full size)
       └► for the start app: add child webview at the AppViewport rect
click "Tendo" in sidebar
       ├─ webview "app-tendo" exists?  ─ yes ─► hide current, show tendo, focus
       └─ no ─► create it (lazy), URL = registry.ssoLaunch ? MIS /desktop/launch/tendo : origin+startPath
window resized / sidebar collapsed ─► shell measures AppViewport ─► invoke("layout", rect) ─► Rust repositions all child webviews
idle app > 30 min & memory pressure ─► optional: destroy hidden webview (state is server-side; reload is cheap)
```

### 7.2 Rust sketch (`src-tauri/src/webviews.rs`)

> **Sketch.** Check the exact method names against the pinned Tauri version. This is the only file that uses the `unstable` API.

```rust
use tauri::{
    webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder},
    LogicalPosition, LogicalSize, Manager, WebviewUrl, Window,
};

const UA_SUFFIX: &str = concat!(" NGADesktop/", env!("CARGO_PKG_VERSION"));

pub fn open_app(window: &Window, key: &str, url: url::Url, rect: Rect) -> tauri::Result<()> {
    let label = format!("app-{key}");
    if let Some(wv) = window.app_handle().get_webview(&label) {
        return show_only(window, &label); // hide others, show this one
    }

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
        // Lets each web app detect the desktop host (see §9). Appended to the default UA.
        .user_agent(&format!("{}{}", default_user_agent(), UA_SUFFIX))
        // Never let a webview leave the allow-list; open anything else in the system browser.
        .on_navigation(|url| crate::navigation::allow_in_webview(url))
        // <a target="_blank"> / window.open: NGA app → switch tab; anything else → system browser.
        .on_new_window(|url, _features| {
            crate::navigation::route_new_window(url);
            NewWindowResponse::Deny
        })
        .on_download(|_wv, event| crate::downloads::handle(event))
        .on_page_load(|wv, payload| {
            if let PageLoadEvent::Finished = payload.event() {
                let _ = wv.emit_to("shell", "app-loaded", wv.label());
            }
        });

    window.add_child(builder, LogicalPosition::new(rect.x, rect.y), LogicalSize::new(rect.w, rect.h))?;
    show_only(window, &label)
}
```

Shell-side commands (`commands.rs`): `open_app(key)`, `layout(rect)`, `reload_active()`, `go_back()`, `go_forward()`, `print_active()`, `sign_out_everywhere()`, `get_versions()`.

### 7.3 Navigation rules (`navigation.rs`)

| URL requested by an app webview | Behaviour |
|---|---|
| Same app origin, or one of its `alsoAllow` origins | Load in place |
| Another **NGA app** origin (e.g. MIS `SystemsMenu` link to `taskmentor.amashuri.com/...?code=`) | **Cancel**, switch to that app's webview, navigate it to the URL (the SSO code goes with it) |
| `https://accounts.google.com/...` | Cancel and start the system-browser Google flow (§8.4) |
| Any other `http(s)` URL (docs, Ganzaa, YouTube, Cloudflare links…) | Cancel and open in the **default browser** (`plugin-opener`) |
| `mailto:`, `tel:` | Hand to the OS |
| `file:`, `javascript:`, `data:` (top-level) | Block |

### 7.4 Loading, errors and offline

- `LoadingOverlay` over the viewport until `app-loaded`. After 20 s, show "Still loading… [Reload] [Open in browser]".
- Navigation failure / DNS / no network → `OfflineScreen` with retry. Check `navigator.onLine` in the shell plus a `HEAD` to `origin/` before retrying.
- Each web app already has a `/svc/*/health` or equivalent. The About page can show a small status grid for the four services.

### 7.5 Shell UX details

- Sidebar collapsible to icons. Badge counts (Tupo unread, MIS reminders) arrive via the bridge in Phase 6.
- Header: back/forward/reload for the **active** app, the app's current page title, and "Open in browser".
- Shortcuts: `Ctrl/⌘+1..9` switch app, `Ctrl/⌘+R` reload, `Ctrl/⌘+P` print, `Ctrl/⌘+[`/`]` back/forward, `F11` fullscreen.
- Remember window size and position (`tauri-plugin-window-state`) and the last active app.
- Single instance (`tauri-plugin-single-instance`): a second launch focuses the existing window and forwards deep links.

---

## 8. Authentication & sign-out

### 8.1 Principles

1. **MIS is the only place a user types credentials.**
2. **The shell never holds a token.** Each token lives in its own origin's storage inside the shared webview profile, exactly as in Chrome/Edge.
3. **No protocol changes** to `/sso/token`, the redirect-URI rules or back-channel logout.

All child webviews in one app share a single persistent data store (WebView2 user-data folder / WKWebsiteDataStore). So once MIS is signed in, its `localStorage` token and `nga_auth_token` cookie persist across restarts, like a browser profile.

### 8.2 First-run sign-in

```text
App starts ─► MIS webview loads https://mis.amashuri.com/home
            └─ not signed in → MIS login page (password + OTP)  ─► signed in, token in MIS localStorage
User clicks "Task Mentor" (first time)
  └─ webview app-taskmentor loads  https://mis.amashuri.com/desktop/launch/taskmentor     ◄─ NEW MIS route
        │  (MIS origin, first-party → it can read its own token)
        ├─ signed in → authorizeSSO(system) → location.replace(callback?code=…&state=…)
        │                 └─ taskmentor.amashuri.com/sso/callback → POST /sso/token (server-side) → signed in
        └─ not signed in → MIS login → back to /desktop/launch/taskmentor
Later launches: Task Mentor already has its own token → load origin+startPath directly;
                its existing /verify-mis check keeps it honest.
```

**Why a new MIS route instead of reusing the spoke's own "Sign in with MIS" button?** It removes a click and an extra page, works the same for every spoke, and reuses `appLaunch.ts` logic already in production. The callback URLs are unchanged, so **no `allowed_redirect_uris` changes** are needed.

`/desktop/launch/:key` must:

- Accept only keys from `NGA_APPS` and resolve the callback with `resolveRedirectUri(system, origin)`.
- Validate an optional `next` path (same-origin, relative) and pass it through `state`.
- Render nothing but a spinner, and work in any browser (useful for testing).

### 8.3 Sign-out

- **Sign out from MIS** (existing): `POST /auth/logout` → `token_version++` → back-channel logout to every spoke → spokes return `401 SESSION_ENDED` → each spoke's `/verify-mis` check (on focus/60 s) sends the user to its signed-out state. **Works in desktop with no change.**
- **Shell "Sign out" (user menu):** calls into the **MIS webview** (navigate it to MIS's logout route, or `eval` a call to the MIS logout function), then reloads every open app webview. The shell still never touches a token.
- **"Reset NGA Desktop" (Settings → Troubleshooting):** clears **all** browsing data of the shared profile (`Webview::clear_all_browsing_data`), then restarts. This covers shared and family computers.

### 8.4 Google sign-in (MIS)

Google refuses OAuth in embedded webviews. Plan:

1. **Phase 3a (minimum):** inside the desktop app, MIS hides the Google button (UA check) and shows "Sign in with Google opens your browser". Password + OTP keeps working.
2. **Phase 3b (full):** a system-browser flow using **deep links**:
   - The desktop shell opens `https://mis.amashuri.com/login?desktop=1&nonce=<random>` in the **default browser** (`plugin-opener`).
   - The user signs in there with Google, as normal.
   - MIS mints a **one-time desktop handoff code** (new endpoint `POST /auth/desktop-handoff`; 60 s TTL, single-use, bound to `nonce`). It then redirects to `nga://auth/callback?code=…&nonce=…`.
   - The OS wakes NGA Desktop (`plugin-deep-link` + `single-instance`). The shell checks the `nonce`, then navigates the MIS webview to `https://mis.amashuri.com/desktop/complete?code=…`. That page redeems the code (`POST /auth/desktop-handoff/redeem`) and stores the token **in MIS's own origin**.
   - This is a PKCE-style flow. The code is useless without the nonce, and the token never passes through the shell.

### 8.5 Session persistence and security notes

- A JWT lasts 24 h (`expiresIn: "24h"`), so desktop users re-sign in daily, the same as on the web. Longer sessions are a product decision, not a desktop one.
- Don't add `allow-insecure-localhost` or disable TLS checks in production builds.

---

## 9. Changes required in the existing web apps

All changes are small, additive and **no-ops in a normal browser**.

### 9.1 Shared helper (copy into each app, like `ngaLaunch.ts`)

```ts
// src/desktop/ngaDesktop.ts — identical in all four apps; change them together.
export const isNgaDesktop = (): boolean =>
  typeof navigator !== "undefined" && /\bNGADesktop\/\d/.test(navigator.userAgent);

export const ngaDesktopVersion = (): string | null =>
  navigator.userAgent.match(/\bNGADesktop\/([\d.]+)/)?.[1] ?? null;
```

### 9.2 Per-app checklist

| # | Change | MIS | Task Mentor | Tendo | Tupo |
|---|---|:-:|:-:|:-:|:-:|
| 1 | Add `ngaDesktop.ts` helper | ✅ | ✅ | ✅ | ✅ |
| 2 | **Suppress PWA install UI** when `isNgaDesktop()` (`AutoInstallPrompt`, `ngaInstall.tsx`, `ReminderNudge`) | ✅ | ✅ | ✅ | ✅ |
| 3 | Skip `serviceWorker.register` and Web Push subscribe in desktop (avoids stale-cache and push failures in WKWebView) | ✅ | ✅ | ✅ | ✅ |
| 4 | Launchers (`SystemsMenu`, `AppsSwitcher`): keep `<a target="_blank">`. The shell intercepts them, so **no change needed**. Optionally hide the menu in desktop since the sidebar replaces it. | opt. | opt. | opt. | opt. |
| 5 | New route **`/desktop/launch/:key`** (§8.2) | ✅ | | | |
| 6 | Static file **`public/desktop/apps.json`** + nginx `no-cache` (§6.3) | ✅ | | | |
| 7 | Hide Google sign-in in desktop (3a); later desktop-handoff endpoints and `/desktop/complete` (3b) | ✅ | | | |
| 8 | **Downloads:** check that blob exports (`jspdf.save`, `xlsx.writeFile`, `exceljs`) land in Downloads (WKWebView needs `on_download`; see §10) | ✅ | ✅ | ✅ | ✅ |
| 9 | **Print:** in desktop on macOS, make `window.print()` call the bridge `print()` (Phase 6). Until then, test it. | ✅ | ✅ | ✅ | |
| 10 | Media permission UX: clear message if camera/mic is denied at OS level ("Open System Settings → Privacy → Camera → NGA") | | ✅ | | ✅ |
| 11 | CORS: **no change.** Requests come from the same origins as in the browser. | — | — | — | — |
| 12 | `X-Frame-Options`/CSP: **keep as they are.** We don't use iframes. | — | — | — | — |

### 9.3 Analytics

The platform activity tracking (`packages/activity`, `PLATFORM_ACTIVITY.md`) should record `client: "desktop"` and the desktop version when `isNgaDesktop()`. This tells us the adoption rate and which shell versions are still in use.

---

## 10. Platform capabilities matrix (Windows vs macOS)

| Capability | Windows (WebView2 / Chromium) | macOS (WKWebView / WebKit) | What we do |
|---|---|---|---|
| Runtime | Preinstalled on Win 10/11. Evergreen auto-updates. | Built into the OS (Safari version = macOS version) | Windows installer: `webviewInstallMode: embedBootstrapper` (safe for machines missing it) |
| Cookies / localStorage persistence | ✅ user-data folder per app | ✅ default data store | Nothing extra |
| Camera / microphone (`getUserMedia`) | ✅ webview permission prompt | ✅ needs **Info.plist** `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` + **entitlements** `com.apple.security.device.camera`, `com.apple.security.device.audio-input` (hardened runtime) | Add both files in Phase 4. Test proctoring and Meet. |
| Screen share (`getDisplayMedia`) | ✅ | ⚠️ works on recent macOS/WKWebView (fixed in wry for macOS 14+); verify | Tupo Meet: test on macOS 13/14/15. Fallback message if unavailable. |
| WebGL / WASM (TF.js, MediaPipe proctoring) | ✅ | ✅ (WebGL2); check performance | Proctoring smoke test on Intel and Apple Silicon |
| WebSockets (socket.io), WebRTC | ✅ | ✅ | Test realtime reconnection after sleep/wake |
| Blob/file downloads | ✅ default | ⚠️ needs `on_download` handler to choose a path | `downloads.rs`: save to `~/Downloads`, de-dupe the name, notify, "Show in folder" |
| `window.print()` | ✅ | ⚠️ historically a no-op in WKWebView | `print.rs` calls the native webview print. Web apps call it via the bridge in desktop (§9 #9). |
| `window.open` / `target=_blank` | needs new-window handler | needs new-window handler | `navigation.rs` (§7.3) |
| Service workers / Web Push | partial | unreliable for remote origins | Disabled in desktop (§9 #3). Native notifications via bridge. |
| OS notifications | `plugin-notification` (toast) | `plugin-notification` (Notification Center) | Phase 6 bridge |
| Google OAuth in webview | ❌ blocked by Google | ❌ blocked by Google | System-browser + deep-link flow (§8.4) |
| Deep links `nga://` | registry entries (installer) | `Info.plist` URL scheme | `plugin-deep-link` |
| Auto-start / tray | ✅ | ✅ (menu-bar extra) | `plugin-autostart`, `tray-icon` |
| Managed deployment | **MSI** via GPO/Intune, per-machine install | `.pkg`/`.dmg` via MDM (Jamf, Intune) | Document for school IT (Phase 6) |

Linux (`.AppImage`/`.deb`, WebKitGTK) can be added later by one CI matrix row. It is out of scope for v1.

---

## 11. Security model

### 11.1 Hard rules

1. **No secrets in `nga-desktop`.** No `JWT_SECRET`, DB passwords, `SSO_CLIENT_SECRET`, API keys or Cloudflare tokens. Anything in the installer is readable by the user. The desktop app is **not** an SSO client and has no client secret.
2. **Remote content gets no IPC by default.** Capabilities in `src-tauri/capabilities/shell.json` apply to the **local shell webview only** (`"webviews": ["shell"]`). The app webviews get **zero** Tauri permissions until Phase 6.
3. **Origin allow-list compiled into the binary.** Production: the four `*.amashuri.com` origins + `api.amashuri.com`, `taskmentor-api`, `tendo-api`, `live`, `tupo-live` (for their own internal navigations if any). Nothing else loads inside a webview, and the remote `apps.json` can't extend it.
4. **HTTPS only** in production builds. Dev builds may allow `http://localhost:*`.
5. **CSP for the shell** (`tauri.conf.json > app.security.csp`): `default-src 'self'; img-src 'self' https://*.amashuri.com data:; connect-src 'self' https://mis.amashuri.com ipc: http://ipc.localhost`.
6. **No devtools in release builds** (the default). Diagnostics come from an "Export logs" button.

### 11.2 Phase 6 bridge for web apps (opt-in, minimal)

If the web apps need native features (notifications, badge, print, "open downloads"), expose a **tiny** set of commands to remote origins via `capabilities/remote-apps.json`:

```json
{
  "identifier": "remote-apps",
  "description": "Minimal native bridge for NGA web apps",
  "webviews": ["app-mis", "app-taskmentor", "app-tendo", "app-tupo"],
  "remote": { "urls": ["https://mis.amashuri.com/*", "https://taskmentor.amashuri.com/*",
                       "https://tendo.amashuri.com/*", "https://tupo.amashuri.com/*"] },
  "permissions": ["allow-nga-notify", "allow-nga-set-badge", "allow-nga-print"]
}
```

Each command validates its input, rate-limits, and **never** exposes file-system, shell or HTTP access. Web apps call it through a small wrapper that is a no-op in browsers:

```ts
export const nativeNotify = async (title: string, body: string) => {
  if (!isNgaDesktop() || !(window as any).__TAURI_INTERNALS__) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("nga_notify", { title, body });
  return true;
};
```

### 11.3 Supply chain

- Lockfiles committed. `npm ci` and `cargo build --locked` in CI. Dependabot for npm, Cargo and Actions.
- Pin GitHub Actions to a major version or SHA. Keep signing secrets only in the `release` **environment** with required reviewers.
- The updater **verifies a signature** for every update (minisign key). The private key lives only in GitHub secrets plus an offline backup (§14).

---

## 12. Builds, CI & release (GitHub Actions)

### 12.1 `ci.yml` — every PR and push to `main`

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build            # shell UI only (vite)
  rust:
    strategy:
      matrix: { os: [windows-latest, macos-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: clippy, rustfmt }
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - run: cargo fmt --check
        working-directory: src-tauri
      - run: cargo clippy --locked -- -D warnings
        working-directory: src-tauri
      - run: cargo test --locked
        working-directory: src-tauri
```

### 12.2 `release.yml` — on tag `v*`

```yaml
name: Release
on:
  push: { tags: ["v*"] }
permissions: { contents: write }
jobs:
  build:
    environment: release              # secrets + required reviewer
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target universal-apple-darwin
          - platform: windows-latest
            args: ""
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VITE_NGA_ENV: production
          # Updater signing (all platforms)
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS signing + notarization
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}               # base64 .p12 (Developer ID Application)
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}     # "Developer ID Application: <Org> (<TEAMID>)"
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}                 # App Store Connect API key (notarization)
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
          APPLE_API_KEY_PATH: ${{ runner.temp }}/AuthKey.p8                 # write the .p8 here in a prior step
          # Windows signing: see §13.2 (signCommand in tauri.conf.json uses these)
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "NGA Desktop ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md"
          releaseDraft: true          # a human reviews, then publishes
          prerelease: false
          includeUpdaterJson: true    # latest.json for the updater
          args: ${{ matrix.args }}
```

> Add a step before `tauri-action` that writes `secrets.APPLE_API_KEY_P8` to `$RUNNER_TEMP/AuthKey.p8` on macOS.

**Artifacts per release**

```text
NGA_1.2.0_x64-setup.exe        (NSIS, per-user, recommended download)
NGA_1.2.0_x64_en-US.msi        (WiX, for school IT / GPO / Intune)
NGA_1.2.0_universal.dmg        (Intel + Apple Silicon)
NGA_universal.app.tar.gz(.sig) (updater payload, macOS)
*.exe.sig / *.msi.sig           (updater signatures)
latest.json                     (updater manifest)
```

### 12.3 Versioning

- SemVer: `MAJOR` = breaking change to the shell/bridge contract, `MINOR` = features, `PATCH` = fixes.
- `npm run release -- 1.2.0` runs `scripts/bump-version.mjs`. It updates `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, updates `CHANGELOG.md`, commits, and tags `v1.2.0`.
- Push with `git push origin main --follow-tags`. CI builds a **draft** release. A maintainer smoke-tests the installers and clicks **Publish**. Only then does the updater see it.

---

## 13. Code signing & notarization

Unsigned builds work for internal testing only. Windows SmartScreen shows "Windows protected your PC", and macOS Gatekeeper blocks the app.

### 13.1 macOS

| Step | Detail |
|---|---|
| Account | **Apple Developer Program** (organization, USD 99/yr). It needs a D-U-N-S number for the legal entity, so start early because it can take weeks. |
| Certificate | **Developer ID Application**. Export as `.p12`, base64 into `APPLE_CERTIFICATE`. |
| Notarization | App Store Connect **API key** (`.p8`, issuer ID, key ID). `tauri build` signs with the hardened runtime, submits for notarization and staples the ticket. |
| Entitlements | `src-tauri/entitlements.plist`: `com.apple.security.device.camera`, `com.apple.security.device.audio-input`, `com.apple.security.network.client`. |
| Verify | `spctl -a -vvv -t install NGA.dmg` → "accepted, source=Notarized Developer ID" |

### 13.2 Windows

Since June 2023, publicly trusted code-signing keys must live on hardware (HSM/token). Options, in order of preference:

| Option | Fit for us | Notes |
|---|---|---|
| **Azure Artifact Signing** (formerly *Trusted Signing*) | ✅ cheapest (~USD 10/mo), CI-friendly via `signCommand` | **Eligibility is limited by country and organization age.** Check whether the Rwandan entity qualifies before choosing it. |
| **OV certificate in a cloud HSM** (e.g. SSL.com eSigner, DigiCert KeyLocker, Certum SimplySign) | ✅ works for any country | ~USD 200–500/yr. Sign through the vendor CLI in `signCommand`. SmartScreen reputation builds up over the first downloads. |
| EV certificate | Not needed | Since 2024, EV no longer gives instant SmartScreen reputation. Not worth the extra cost. |

`tauri.conf.json`:

```json
"bundle": {
  "windows": {
    "signCommand": "trusted-signing-cli -e https://<region>.codesigning.azure.net -a <account> -c <profile> %1",
    "webviewInstallMode": { "type": "embedBootstrapper" },
    "nsis": { "installMode": "currentUser" },
    "wix":  { "language": "en-US" }
  }
}
```

(For a vendor HSM, replace `signCommand` with that vendor's CLI. `%1` is the file path.)

---

## 14. Auto-update

**Mechanism:** `tauri-plugin-updater` reads a static `latest.json` and downloads the platform payload. It **verifies the minisign signature** against the public key embedded in the app, then installs and relaunches.

1. Generate keys **once**: `npm run tauri signer generate -- -w ~/.tauri/nga-desktop.key`.
   - Private key + password → GitHub secrets **and** an offline backup (password manager or vault). **If it is lost, existing installs can never update again.**
   - The public key goes into `tauri.conf.json`.
2. Configure:

```json
"plugins": {
  "updater": {
    "pubkey": "<contents of nga-desktop.key.pub>",
    "endpoints": [
      "https://github.com/<org>/nga-desktop/releases/latest/download/latest.json",
      "https://downloads.amashuri.com/desktop/latest.json"
    ],
    "windows": { "installMode": "passive" }
  }
},
"bundle": { "createUpdaterArtifacts": true }
```

3. UX (`services/updater.ts` + `UpdateBanner.tsx`):
   - Check on start (after 10 s) and every 6 h. Skip on metered connections if the user chose "Ask before downloading".
   - Show "Version 1.3.0 is available — what's new · [Restart & update] [Later]".
   - **Never** restart without consent while an app is mid-quiz or mid-meeting. The shell asks Task Mentor and Tupo through the bridge (Phase 6), or simply waits for the user.
   - `minDesktopVersion` in `apps.json` (§6.3) can force an update for security fixes.

> Web apps update **independently and instantly**. The updater only ever replaces the shell.

---

## 15. Distribution & the download page

### 15.1 Hosting

- **If `nga-desktop` is public:** GitHub Releases is the CDN. Links use `https://github.com/<org>/nga-desktop/releases/latest/download/<file>`.
- **If private (likely):** release assets aren't publicly downloadable. Add a final CI job that uploads the published release's files to the VPS:

```text
/opt/downloads/desktop/
├── latest.json
├── NGA-Setup.exe        → symlink to the current versioned file
├── NGA.msi
├── NGA.dmg
└── 1.2.0/...
```

served by a new nginx server block `downloads.amashuri.com` (static, `Cache-Control: no-cache` on `latest.json`, long cache on versioned files). Use an SSH deploy key scoped to that directory.

### 15.2 `/download` page (in MIS, public route)

Add `https://mis.amashuri.com/download` next to the existing public `/apps` installer page (`AppsInstallerPage.tsx`):

```text
               NGA for desktop
   All your NGA apps — MIS, Task Mentor, Tendo, Tupo — in one window.

   [ ⊞ Download for Windows ]     (auto-detected OS button first)
   [  Download for macOS ]
     Other options: Windows MSI (for IT) · Release notes · Use in browser instead

                   Version 1.2.0 · 14 MB
```

- Version and size come from `latest.json`, so the page needs no rebuild per release.
- Detect the OS with `navigator.userAgentData?.platform` or the UA. Apple Silicon and Intel both get the universal DMG.
- Link to `/apps` (PWA install) for Chromebooks, Linux and phones.
- In the MIS Apps menu, show a "Get the desktop app" tile only on Windows/macOS and only when **not** already in the desktop app (`isNgaDesktop()`).

### 15.3 School IT pack

Publish a short `DEPLOYING_NGA_DESKTOP.md` with:

- MSI silent install: `msiexec /i NGA.msi /qn`
- Intune/GPO steps, WebView2 prerequisites, and the firewall allow-list (`*.amashuri.com`, Cloudflare SFU for Meet)
- macOS MDM `.pkg` (optional later)

---

## 16. Implementation phases (with tasks & acceptance criteria)

Estimates assume **one developer** familiar with React and new to Tauri/Rust. Run in parallel where noted.

### Phase 0 — Prerequisites & decisions (week 0, mostly non-dev, start immediately)

| # | Task | Owner |
|---|---|---|
| 0.1 | Create GitHub repo `nga-desktop` (decide public/private, §19) | Lead |
| 0.2 | Start **Apple Developer Program** enrollment (D-U-N-S) | Admin |
| 0.3 | Check eligibility for **Azure Artifact Signing**, else buy an **OV cert with cloud HSM** | Admin |
| 0.4 | Decide product name, icon (1024×1024 PNG) and bundle identifier (**permanent**) | Product |
| 0.5 | Create `release` GitHub environment with required reviewers | Lead |
| 0.6 | Get a Mac (Apple Silicon) and a Windows 10 + Windows 11 machine for testing | Lead |

**Done when:** accounts are in progress, identifiers are frozen, and test hardware is available.

### Phase 1 — Desktop foundation (week 1–2)

| # | Task |
|---|---|
| 1.1 | Scaffold Tauri 2 + React + TS + Vite (port 1420) + Tailwind, ESLint, Vitest |
| 1.2 | Pin an exact `tauri` version with `features = ["unstable", "tray-icon"]`. Add plugins (§5). |
| 1.3 | `config/apps.ts`, `environments.ts`, `allowlist.ts` + unit tests |
| 1.4 | Shell layout: `Sidebar`, `Header`, `AppViewport`, `Settings`, `About` |
| 1.5 | `webviews.rs`: create/show/hide/layout child webviews; `commands.rs` |
| 1.6 | Window state, single instance, `Ctrl/⌘+1..4` shortcuts |
| 1.7 | `ci.yml` green (lint, typecheck, test, clippy, fmt on Windows + macOS) |

**Done when:** `npm run tauri dev` opens one window with a sidebar, and clicking each entry shows the matching **production** site in a child webview, switching instantly.

### Phase 2 — Web app rendering & navigation (week 2–3)

| # | Task |
|---|---|
| 2.1 | `navigation.rs`: allow-list, cross-app interception (§7.3), external links → browser |
| 2.2 | `LoadingOverlay`, `OfflineScreen`, retry, "Open in browser" |
| 2.3 | Back/forward/reload for the active webview |
| 2.4 | `downloads.rs` (+ notification, "Show in folder") |
| 2.5 | `print.rs` (native print of active webview) |
| 2.6 | Custom UA suffix `NGADesktop/<ver>` |
| 2.7 | **Spike:** if `unstable` multi-webview is blocking, implement the `layout: "windows"` fallback (§3, D2) |
| 2.8 | Remote `apps.json` merge (§6.3) |

**Done when:** the MIS Apps-menu link to Task Mentor switches to the Task Mentor tab (no new window), a PDF/XLSX export lands in Downloads on both OSes, print works, and pulling the network cable shows the offline screen and recovers.

### Phase 3 — Authentication (week 3–4) *(touches `nga_central_mis`)*

| # | Task | Repo |
|---|---|---|
| 3.1 | `ngaDesktop.ts` helper | all four |
| 3.2 | MIS route **`/desktop/launch/:key`** reusing `authorizeSSO`/`resolveRedirectUri` + tests | `nga_central_mis` |
| 3.3 | Shell: first open of a spoke goes via `/desktop/launch/:key`, later opens go straight to `origin+startPath` | `nga-desktop` |
| 3.4 | Hide the Google button in desktop (3a) | `nga_central_mis` |
| 3.5 | Shell "Sign out" + "Reset NGA Desktop" (§8.3) | `nga-desktop` |
| 3.6 | Test matrix: sign-in once → all four apps signed in; MIS sign-out → all spokes sign out within 60 s; restart keeps sessions; user switch on a shared PC | all |
| 3.7 | *(Can come after v1.0)* Google via system browser + deep link: `/auth/desktop-handoff`, `/desktop/complete`, `nga://` (3b) | MIS + desktop |

**Done when:** a new user installs, signs in **once** in MIS, and opens Task Mentor, Tendo and Tupo without typing credentials again. Sign-out in MIS ends all four.

### Phase 4 — Desktop builds & platform polish (week 4–5)

| # | Task |
|---|---|
| 4.1 | Icons (`tauri icon`), product metadata, copyright, `About` versions |
| 4.2 | macOS `Info.plist` (camera/mic strings, `nga` URL scheme) + `entitlements.plist` |
| 4.3 | Windows: NSIS (per-user) + MSI, `embedBootstrapper`, Start-menu shortcut |
| 4.4 | Web-app adjustments §9 #2, #3, #8, #9, #10 in each repo |
| 4.5 | Media verification: Task Mentor proctoring (camera + TF.js) and Tupo Meet (camera, mic, **screen share**) on both OSes |
| 4.6 | Local unsigned installers tested on clean VMs (Win 10, Win 11, macOS 13/14/15, Intel + Apple Silicon) |

**Done when:** locally built installers install, run and uninstall cleanly on all test machines, and every row of §17.2 passes.

### Phase 5 — GitHub Actions release pipeline (week 5–6)

| # | Task |
|---|---|
| 5.1 | `release.yml` (§12.2) producing a **draft** release on tag |
| 5.2 | `scripts/bump-version.mjs`, `CHANGELOG.md`, release checklist in README |
| 5.3 | Updater keys, `latest.json`, `UpdateBanner` (§14) |
| 5.4 | If the repo is private: upload job to `downloads.amashuri.com` + nginx block (§15.1) |
| 5.5 | Dry run: tag `v0.9.0`, install, tag `v0.9.1`, confirm the in-app update works |

**Done when:** `git tag v0.9.1 && git push --tags` produces Windows + macOS installers and `latest.json`, and a `v0.9.0` install updates itself to `v0.9.1`.

### Phase 6 — Professional distribution & native integration (week 6–8)

| # | Task |
|---|---|
| 6.1 | Windows signing in CI (§13.2), check SmartScreen and signature details |
| 6.2 | macOS signing + notarization in CI (§13.1), check `spctl` |
| 6.3 | `/download` page in MIS + "Get the desktop app" tile (§15.2) |
| 6.4 | Tray icon + menu (open app X, check for updates, quit), optional autostart |
| 6.5 | Native bridge (§11.2): `nga_notify`, `nga_set_badge`, `nga_print`, used by MIS reminders and Tupo unread counts |
| 6.6 | Activity tracking `client: desktop` (§9.3) |
| 6.7 | IT deployment guide (§15.3) |
| 6.8 | **v1.0.0** production release, announcement, monitoring |

**Done when:** a signed and notarized v1.0.0 is downloadable from `mis.amashuri.com/download`, installs with no OS security warnings beyond the normal first-run prompt, and auto-updates.

### Later (backlog, not v1)

- Linux build row; macOS `.pkg` for MDM.
- **Exam lockdown mode** for Task Mentor proctoring: fullscreen, always-on-top, block app switching during a quiz, triggered by the bridge.
- Offline caching of read-only data (timetable) via the shell.
- Per-app zoom, spell-check language, proxy settings for school networks.

### Timeline summary

```text
Week:      0    1    2    3    4    5    6    7    8
Phase 0   ███ (accounts & certs run in background until Phase 6)
Phase 1        ██████
Phase 2             ██████
Phase 3                  ██████
Phase 4                       ██████
Phase 5                            ██████
Phase 6                                 ███████████
                                                 ▲ v1.0.0
```

---

## 17. Testing strategy

### 17.1 Automated

| Layer | Tool | What |
|---|---|---|
| Shell UI | Vitest + Testing Library | registry merge/validation, sidebar generation, settings, update banner states |
| Rust | `cargo test` | `navigation::allow_in_webview` / `route_new_window` table tests (every row of §7.3), download path de-dupe, version parsing |
| MIS route | existing Vitest setup | `/desktop/launch/:key`: unknown key, signed-out redirect, `next` validation, code minting |
| Web helpers | each app's test runner | `isNgaDesktop()` UA parsing; install prompts hidden when true |
| E2E (optional, later) | WebdriverIO + `tauri-driver` (Windows) | launch, switch apps, sign-in smoke |

### 17.2 Manual release checklist (run on Windows 11 and macOS Apple Silicon, at minimum, for every release)

- [ ] Fresh install, launch, MIS login (password + OTP)
- [ ] Open Task Mentor, Tendo and Tupo with no further login
- [ ] MIS Apps-menu link switches tab (no external browser, no second window)
- [ ] External link opens the default browser
- [ ] Export PDF + XLSX → files in Downloads
- [ ] Print a report card
- [ ] Task Mentor: start a proctored quiz (camera permission, detection running)
- [ ] Tupo: join a Meet with camera + mic, share screen; send a chat message; receive realtime message
- [ ] Sleep/wake → sockets reconnect
- [ ] Network off → offline screen → network on → recover
- [ ] Sign out in MIS → all apps signed out ≤ 60 s
- [ ] Restart → still signed in; "Reset NGA Desktop" → fully signed out
- [ ] Update from previous version via in-app updater
- [ ] Uninstall leaves no running processes

---

## 18. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Tauri multi-webview (`unstable`) API changes or has platform bugs | Medium | High | Pin the exact version; isolate in `webviews.rs`; `layout: "windows"` fallback (D2) |
| R2 | WebKit (macOS) incompatibilities in our apps (CSS, media, TF.js) | Medium | Medium | Test each app in Safari **now**, in parallel with Phase 1. Fixes help Safari web users too. |
| R3 | Google sign-in blocked in webviews | Certain | Medium | Phase 3a hides it; Phase 3b system-browser handoff (§8.4) |
| R4 | `window.print()` / downloads not working in WKWebView | High | Medium | `print.rs` and `downloads.rs` + bridge (§10) |
| R5 | Screen share in Tupo Meet on older macOS | Medium | Medium | Minimum macOS 13 for Meet screen share; clear in-app message |
| R6 | Windows signing not available (eligibility) or slow to obtain | Medium | High | Start Phase 0 now; OV cloud-HSM fallback; ship internal pilots unsigned |
| R7 | Apple enrollment delays (D-U-N-S) | Medium | High | Start immediately; macOS pilot via ad-hoc signing for internal testers only |
| R8 | Updater private key lost or leaked | Low | Critical | Offline backup; restricted `release` environment; rotate by shipping a new pubkey in a normal update while the old key still works |
| R9 | Shared school computers leak sessions between users | Medium | High | "Sign out" + "Reset NGA Desktop"; document for IT; consider a "kiosk mode" setting that clears data on quit |
| R10 | Memory use with four live webviews on low-end PCs | Medium | Low | Lazy creation; unload hidden webviews after inactivity (setting) |
| R11 | Registry drift between `ngaApps.ts` and the desktop registry | Medium | Low | Remote `apps.json` served from MIS; CI check |
| R12 | Private repo means release assets aren't publicly reachable | High (if private) | High | `downloads.amashuri.com` mirror (§15.1) |

---

## 19. Open decisions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Product name in the OS: "NGA", "NGA Desktop", "Amashuri"? | **"NGA"** (matches app names "NGA MIS") |
| Q2 | Bundle identifier (permanent) | `com.amashuri.nga.desktop` |
| Q3 | `nga-desktop` repo public or private? | **Private** + `downloads.amashuri.com` mirror (keeps the release cadence independent of repo visibility) |
| Q4 | Create staging subdomains? | Yes, for desktop and web testing; otherwise build dev + prod only |
| Q5 | Windows signing provider | Azure Artifact Signing if eligible, else OV cloud HSM |
| Q6 | Ship Linux in v1? | No, backlog |
| Q7 | Default layout | `tabs` (multi-webview); `windows` only if R1 bites |
| Q8 | Keep the MIS/Tupo in-app app switchers visible inside desktop? | Hide them (the sidebar replaces them), behind the `isNgaDesktop()` check |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Shell** | The local React UI of the desktop app (sidebar, header, settings), running in its own webview |
| **Child webview** | A native browser view inside the window that loads one NGA web app as a normal top-level page |
| **Spoke app** | Task Mentor, Tendo, Tupo: SSO clients of MIS |
| **SSO code** | 5-minute, single-use authorization code from MIS exchanged server-side at `POST /sso/token` |
| **Back-channel logout** | MIS → app server-to-server sign-out notification (`docs/SINGLE_SIGN_OUT.md`) |
| **WebView2 / WKWebView** | The OS browser engines Tauri uses on Windows (Chromium) / macOS (WebKit) |
| **Capability** | Tauri's permission file that decides which webviews/URLs may call which native commands |
| **`latest.json`** | Updater manifest listing the newest version, per-platform download URLs and signatures |
| **Notarization** | Apple's automated malware scan that lets a Developer-ID-signed app open without warnings |

---

### References

- Tauri v2 docs: multi-webview (`unstable` feature), capabilities & remote URLs, updater plugin, Windows & macOS signing — https://v2.tauri.app
- `tauri-apps/tauri-action` — https://github.com/tauri-apps/tauri-action
- OpenID Connect Back-Channel Logout 1.0 — https://openid.net/specs/openid-connect-backchannel-1_0.html
- Internal: `SSO_CLIENT_INTEGRATION.md`, `docs/APP_LAUNCH.md`, `docs/SINGLE_SIGN_OUT.md`, `DEPLOYMENT_GUIDE.md`
