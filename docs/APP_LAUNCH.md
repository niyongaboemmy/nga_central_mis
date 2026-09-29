# Opening NGA apps in their installed app window

**Problem (2026-09-30):** tapping another app in any NGA launcher (MIS Apps menu, Task Mentor and Tendo "Apps", Tupo app switcher) opened a browser tab, even when that app was installed on the device.

**Why:** Chrome opens a link in an installed web app ("navigation capturing") only for a real link that opens a new top-level page (`<a target="_blank" rel="noopener">`):
- desktop: Chrome 139+ on Windows, Mac and Linux, on by default for apps with `launch_handler`
- Android: WebAPK

Chrome never does this for a scripted `window.open()` (an *auxiliary browsing context*). The old menu opened `about:blank` first and set its address after the SSO call, so Chrome could never route it to the app.

## Every launcher, every app

Users can switch apps from any app, so all four behave the same:

| App | Launcher | Shared code |
|---|---|---|
| MIS | `frontend/src/components/ui/SystemsMenu.tsx` | `appLaunch.ts`, `reminders/pwa.ts`, `ReminderNudge` |
| Task Mentor | `client/src/components/Layout/SystemsMenu.tsx` | `client/src/pwa/ngaLaunch.ts`, `ngaInstall.tsx`, `public/sw.js` |
| Tendo (Discipline & Attendance) | `client/src/components/Layout/SystemsMenu.tsx` | `client/src/pwa/ngaLaunch.ts`, `ngaInstall.tsx`, `public/sw.js` |
| Tupo | `apps/web/src/components/shell/AppsSwitcher.tsx` | `apps/web/src/pwa/ngaLaunch.ts`, `ngaInstall.tsx`, `public/sw.js` |

`ngaLaunch.ts` and `ngaInstall.tsx` are identical copies across the three spoke apps. Change them together.

## What changed

- **MIS Apps menu** (`frontend/src/components/ui/SystemsMenu.tsx`, `appLaunch.ts`)
  - Tiles are real links.
  - SSO codes are minted when the menu opens: single-use, 5-minute life, refreshed every 4 minutes and after each use.
  - If a code isn't ready yet, the click falls back to the old scripted launch, which works but opens a tab.
- **MIS Launch Handler** (`frontend/src/reminders/pwa.ts`, `routeLaunch`): links captured into the already-open MIS window are routed inside the SPA.
- **"Opened from the app" marker:** when a launcher runs inside an installed app, the link carries `nga_launch=app`. MIS, opened that way in a tab, immediately shows its install sheet.
- **Task Mentor, Tendo and Tupo** (`src/pwa/ngaInstall.tsx`, identical in all three, plus `public/sw.js`)
  - Both are now fully installable, and each manifest has `launch_handler: navigate-existing`. Task Mentor also has a real manifest now.
  - Opened with the marker in a browser tab, they immediately show an "Install {app}" card: Chrome/Edge's one-click install, or the exact steps on iPhone/iPad, Safari on Mac and Firefox.

## Limits (browser rules, not choices)

- **No silent install.** A site can't install itself; the user must confirm. "Continue in the browser" stays available.
- **No cross-origin install check on desktop.** A desktop page can't tell whether an app on another origin is installed: `getInstalledRelatedApps` supports that on Android only. So MIS always renders the link, and the browser decides.
- **The user can turn capturing off.** Each installed app has an "Open supported links" setting (`chrome://apps` → the app → App settings).
- **Ganzaa is external:** it opens in its app only if its own site is installable.
- **Next:** the Web Install API (`navigator.install`, planned for Chrome 156) will let the MIS tile itself install, or open, the target app in one step. Add it as a progressive enhancement once it ships.
