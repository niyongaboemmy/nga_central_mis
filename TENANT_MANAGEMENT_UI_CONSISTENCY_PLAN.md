# Tenant management UI — consistency audit and fix plan

**Scope:** the platform console (`/platform/*`) and the school-facing tenant pages (`/subscription`, `/support-access`, status banner, setup checklist) in `frontend/src/components/tenantMgmt/**`. The public register wizard and applicant tracker share the same kit, so they change too and must be re-checked, but they are not the target.
**Type:** frontend only. No API or migration changes.
**Audit method:** code audit with class usage measured across the whole app (474 component files) and compared with `tenantMgmt`. No live screenshots were taken. Phase 0 adds them.

| Revision | Code audited | What changed |
|---|---|---|
| v1 (2026-11-25) | `origin/main` @ `d25525b6` | First audit (tenantMgmt 8.8k lines) |
| **v2 (2026-11-25)** | `origin/main` @ `d56d6276` | Re-review after **#158** (school administrators: new `SchoolAdminsTab.tsx`, 638 lines, and an *Admins* tab on School detail), **#159** (one person in several schools: "already in another school" panel in `CreateUserModal.tsx`) and #160 (test fix). tenantMgmt is now 9.5k lines. See §2a. |

### Implementation status (2026-11-25)
All phases are implemented on branch `feat/tenant-ui-consistency`, not yet committed. Measured result:
- Border utilities in the most-bordered pages: Admins 24→1, Schools 15→1, Settings 13→0, Application detail 16→6, School detail 12→4.
- No `brand-*`, slate, alpha-less dark border, shadow or accent strip is left. `designTokens.test.ts` enforces this.

Deviations from the plan:
- **Header stats:** the console header has no stats row, because Overview's tiles and the tab badges already show those counts.
- **Billing:** the in-page "To confirm / Invoices" tabs became a segmented pill, so only one tab rail shows.
- **School detail on phones:** shows 2 tabs (`visibleSm`), with the rest behind More.

**Added on request: edit school details.**
- New endpoint `PUT /platform/tenants/:id/details`, needing PLATFORM_TENANTS_LIFECYCLE and a reason. It edits name, legal name, timezone and country. The slug stays fixed.
- On a rename, the school's own `School.name` is updated only while it still equals the old name.
- The registry cache is invalidated, `publishTenantChanged` is sent, and a `tenant.details` audit row is written.
- UI: Overview → Details → **Edit details**. Tests: `backend/src/__tests__/tenantDetailsEdit.test.ts` and `PlatformConsole.test.tsx` → "school details".

### v2 summary
The new features copied the old tenant kit instead of fixing it, so the problem got bigger:

| Metric (tenantMgmt) | v1 | v2 |
|---|---|---|
| Border utilities | 292 | **316** |
| Dark borders with no alpha | ≈ 61 | **66** (0 with alpha) |
| `brand-*` accents (vs `blue-*` 71) | 182 | **213** |
| Light-mode `slate-*` classes | 447 | **493** |
| Most-bordered file | platformShared (17) | **SchoolAdminsTab (24)** |

Two new problems: a person picker built twice in two styles (F11), and two stacked tab bars on School detail, which now has 8 tabs (F12).

---

## 1. Root cause

Tenant management was built on its **own design kit** (`tenantMgmt/kit/index.tsx` and `platform/platformShared.tsx`): `Card`, `Btn`, `IconBtn`, `inputCls`, `TabBar`, `KpiTile`, `ActionCard`, `Spinner`. Its surface recipe differs from the rest of the MIS:

| | Rest of the MIS | Tenant management |
|---|---|---|
| Dark page canvas | `dark:bg-black` (SystemLayout) | same |
| Dark card surface | translucent: `dark:bg-gray-800/30–/50` (most common: `/40`, 194×; `/30`, 127×) | **opaque `dark:bg-gray-900`** (38×) and `dark:bg-gray-800` |
| Dark border | low alpha: `dark:border-gray-700/20–/50` (≈ 470 uses) | **full-strength `gray-700` / `gray-600` / `gray-800`** (66×), **no alpha borders at all** |
| Boxes inside a card | tinted inset, no border | **another border** (tiles, logo boxes, footers, list rows) |
| Accent blue | `blue-*` (4,181 uses vs 700 `brand-*`); Sidebar, `ui/Button` and the Schools tabs all use `blue-600` / `blue-400` | **`brand-*`** (213 vs 71 blue): `#2f56d9` primary, pale `brand-200` text in dark mode |
| Light neutrals | gray (73%) | **slate** (493 slate classes; PR #151 only moved the dark side to gray) |

On a black canvas, an opaque `gray-900` card with a solid `#374151` outline draws a bright grey rectangle. Inside it sits another outlined rectangle, then a `border-t` footer, then a `divide-y` list. That stacking is the "lots of border lines" effect, and it reads as a different product.

Standing rule, kept: **no shadows**, so borders still provide depth. The fix is **one hairline border per section, at low alpha**, not zero borders.

---

## 2. Findings (ordered by visual impact)

### F1 — Border weight in dark mode *(critical)*
- `platformShared.tsx` `Card`: `border-slate-200 … dark:border-gray-700 dark:bg-gray-900`. It is used 50× and sets the tone of every page.
- `kit` `KpiTile`, `ActionCard`, `PackageCard`, `Timeline`, `JourneyStepper`, `DropZone`: all solid `gray-700` / `gray-600`.
- `inputCls` (61 uses): `dark:border-gray-700 dark:bg-gray-800`. The system input recipe (Schools.tsx:511) is `dark:bg-gray-900/50 dark:border-gray-700/30`.
- `TabBar` underline rail: `dark:border-gray-700`. Schools.tsx:367 uses `/30`.

### F2 — Border density: boxes inside boxes *(critical)*
229 `border` utilities, plus 42 `ring-2`, 11 `border-t`, 4 `divide-y` and 4 `border-l`. Worst cases:
- **SchoolsPage** card (l.68): outer border + bordered logo box (l.55) + `border-t` meta footer (l.94). Three lines per card, in a grid of cards.
- **ActionCard** (kit): bordered card + `border-t` footer with a tinted band.
- **KpiTile**: every tile has its own border, so a KPI row is a strip of outlines.
- **OverviewPage**: `Card` → `divide-y` list (l.136); the pipeline step circles use `border-2` (l.218).
- **ApplicationDetailPage**: bordered document rows (l.351) inside list sections; a `border-2` checkbox (l.430); a sticky footer with `border-t` (l.169).
- **SchoolDetailPage**: 8 `Card`s, plus `border-t` grids (l.398), bordered app rows (l.500), and a `border-l-2` audit rail (l.698).
- **SettingsPage**: every list item is a bordered box (l.200) inside a `Card`.

Page ranking by border count (v2): **SchoolAdminsTab 24**, platformShared 17, ApplicationDetail 16, Schools 15, Settings 13, SchoolDetail 12, Overview 12, TenantStatusBanner 9, Applications 8, Billing 7.

### F3 — Two different blues *(high)*
The console's primary blue (`brand-600` #2f56d9) and its dark-mode accent text (`brand-200` #b6ccff) sit next to Sidebar / `ui/Button` / Schools blue (`blue-600` #2563eb, `blue-400`). The tab underline, primary buttons, links and selected states visibly change colour when you move from any other page into `/platform`.

### F4 — No page header; each tab invents its own *(high)*
`PlatformConsole` opens straight into a `TabBar`. There is no icon tile, title or subtitle like the `PageHeader` pattern (sideProjects/PageHeader.tsx) other modules use. Each tab then adds its own `h1` with different weights: Overview "Platform at a glance" is `font-extrabold`, SchoolDetail and ApplicationDetail are `text-xl font-bold`. The Overview Refresh button is a hand-made bordered pill.

### F5 — Parallel primitives instead of the system ones *(medium)*
Only 5 tenant files import `components/ui/*`. `Btn` (52×) is `font-semibold` with a bordered white "ghost". `ui/Button` is `font-normal` and its secondary is a filled `gray-200` / `gray-800/70`. Inputs, cards, tabs and empty states are all re-implemented, so the two kits drift every time one of them changes.

### F6 — Light-mode neutrals are slate *(medium)*
`border-slate-200/300`, `bg-slate-50/100` and `text-slate-600` give light mode a cooler, blue-grey cast next to gray pages. PR #151 fixed only the dark side.

### F7 — Typography louder than the system *(medium)*
`font-extrabold` on KPI values, prices and the Overview h1, where the system uses `bold`. `text-[11px]` is used 18× for body labels. Section titles are `text-sm font-bold`, where other modules use `text-base font-semibold`.

### F8 — Too much ambient motion *(medium)*
Every "live" `StatusPill` breathes, so a list of pending applications pulses on every row. Also: `KpiTile` `animate-ping`, an `EmptyState` icon that floats forever, an `ActionCard` icon that wobbles every 3 s, and `CountUp` on every number. The rest of the MIS uses one-shot reveals only.

### F9 — Spinners where the rule asks for skeletons *(medium)*
14 page-level `<Spinner />` (PlatformConsole:49, SchoolDetail:57, ApplicationDetail:83, Billing:106, Packages:65, Support:58, Settings:71, Applications:124, Audit:71, …). The standing UI rule is a skeleton for content loads. SchoolsPage already has one (l.208), so that pattern can be reused.

---

## 2a. Findings in the new features (v2)

### F10 — School detail → Admins tab (`platform/SchoolAdminsTab.tsx`, #158) *(high)*
It repeats F1–F3, F6 and F7 in one file:
- **Bordered rows on a tab panel:** each `AdminRow` (l.207) is `rounded-2xl border … dark:border-gray-700 dark:bg-gray-900`. A school with 3–4 admins shows a stack of outlined boxes. The loading skeleton (l.80) also draws a border per row.
- **Kind radio cards** (l.334) and **role chips** (l.552): `border-slate-200 dark:border-gray-700` when off and `border-brand-500` / `bg-brand-600` when on. Every option is outlined, so a choice of two shows 2 outlines plus the input borders under them.
- **Search results** in the assign dialog (l.494): a bordered row per person, inside the bordered glass modal. The "picked" person (l.519) is a `border-brand-300` box.
- **Credentials dialog** (l.615): a `Card` (opaque, bordered) inside `Modal`, so two frames are nested.
- Accents use `brand-100/600/700/800` and `dark:text-brand-200` throughout (avatar, `Chip` brand tone, the ShieldCheck icon, the email hover). The `Chip` (l.183) is a fourth pill style next to `StatusPill`, `CountBadge` and the side-projects pills. It uses `text-[11px] font-bold`.
- Light mode is all slate (`text-slate-600`, `bg-slate-100`, `border-slate-200`).
- Good as built: skeletons (not spinners) and toasts through `act()`. Keep both.

### F11 — "Already in another school" in Create user (`CreateUserModal.tsx`, #159) *(high)*
- Uses **navy dark surfaces**: `dark:bg-slate-800`, `dark:border-slate-600/700`, `dark:bg-slate-800/70`. That is the exact slate-vs-gray drift that PR #151 removed from tenantMgmt, now back in a shared modal.
- Nested frames: a bordered blue panel (`border-blue-200 … bg-blue-50/60`) holds a bordered white result row (`border-gray-200 dark:border-slate-700`). The "picked" state is another `border-blue-300` box.
- Its search input is hand-made (`rounded-xl border-gray-200 dark:border-slate-600 dark:bg-slate-800`), so it matches neither the system input nor `inputCls`.
- **The same feature is built twice:** "find a person who is already in another school and add them here" exists as the `AssignModal` in `SchoolAdminsTab` (platform side, `brand-*` + slate) and as this panel (school side, `blue-*` + slate-800). Two styles, two code paths, one job.

### F12 — Stacked tab bars on School detail, now 8 tabs *(medium)*
`/platform/schools/:tid` shows the console `TabBar` with the School-detail `TabBar` directly under it. That makes two underline rails and two active underlines in two rows. #158 added *Admins*, so the inner bar now holds 8 tabs (Overview, Admins, Package, Apps, Usage, Billing, Lifecycle, Audit) and scrolls sideways on phones and narrow laptops.

---

## 3. Target design rules (apply to every tenant screen)

1. **One border per section.** Only the outermost container of a section has a border. Anything inside uses a tinted inset (`bg-gray-50 dark:bg-gray-800/50`), spacing, or a hairline divider. Never a second outlined box.
2. **Dark borders always carry alpha:** `dark:border-gray-700/40` for cards, `/30` for inputs and dividers. No static `dark:border-gray-600`, and no solid `dark:border-gray-700` or `gray-800`.
3. **Dark surfaces are translucent:** cards `dark:bg-gray-800/40`, insets `dark:bg-gray-800/50`, inputs `dark:bg-gray-900/50`. No opaque `dark:bg-gray-900` cards on the black canvas.
4. **One blue:** `blue-600` (hover `blue-700`) for actions; `text-blue-600 dark:text-blue-400` for accent text; `bg-blue-50 dark:bg-blue-500/15` for soft fills. No `brand-*` in tenantMgmt. Green, amber and red mean status only.
5. **Gray neutrals** in light mode too (`gray-*`, not `slate-*`).
6. **Quiet motion:** one-shot reveal on mount. A pulse is allowed only on a status that needs *this* user's action (e.g. `PAYMENT_SUBMITTED` for a confirmer) and never on more than one element per row.
7. **No shadows, no accent strips** (existing rules, unchanged).

---

## 4. Implementation plan

### Phase 0 — Baseline screenshots (½ day)
- Playwright script `frontend/scripts/shoot-tenant-ui.mjs`: signs in as a local super admin and captures every console tab plus `/subscription` and `/support-access`, in light and dark, at 1440 and 390 px wide. It also captures `/schools` and `/side-projects` as the reference look.
- Store under `reports/tenant-ui/before/`. Re-run after each PR into `after/`.

### Phase 1 — Shared tokens + kit primitives (PR A, highest leverage, ~1.5 days)
1. **New `frontend/src/design/surfaces.ts`** (sits next to `design/motion.ts`), the single source of truth:
   ```ts
   export const surface = {
     card:    "rounded-2xl border border-gray-200 bg-white dark:border-gray-700/40 dark:bg-gray-800/40",
     inset:   "rounded-xl bg-gray-50 dark:bg-gray-800/50",
     input:   "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700/30 dark:bg-gray-900/50 dark:text-white",
     divider: "border-gray-100 dark:border-gray-700/30",
     rail:    "border-gray-200 dark:border-gray-700/30",
   };
   export const accent = { solid: "bg-blue-600 hover:bg-blue-700 text-white", text: "text-blue-600 dark:text-blue-400", soft: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", ring: "focus-visible:ring-blue-500" };
   ```
2. **`platformShared.tsx`**
   - `Card` → `surface.card`. Add `<Card.Section>` / `<Inset>` helpers so pages stop hand-writing inner borders.
   - `inputCls` → `surface.input`. All 61 call sites pick it up with no edits.
   - `Btn`: primary → `accent.solid`. Ghost → the system secondary (`bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800/70 dark:text-white dark:hover:bg-gray-800`, **no border**). Use `font-medium` to meet `ui/Button` halfway. Keep the API so callers do not change.
   - `IconBtn`, `Switch` (on = `bg-blue-600`, matching the Schools.tsx toggles), `Stepper`: brand → blue, slate → gray.
   - `TabBar`: rail `surface.rail`; active underline `bg-blue-600 dark:bg-blue-400`; active text `text-blue-600 dark:text-blue-400`. This copies Schools.tsx:367.
   - `Spinner` stays for buttons and inline use only. Add `Skeleton`, `SkeletonCard`, `SkeletonRows`.
3. **`kit/index.tsx`**
   - `KpiTile`: drop the border and use `surface.inset`, styled like the PageHeader stat chips. `alert` becomes red value text plus a static red dot (no `animate-ping`). `font-extrabold` → `font-bold`.
   - `ActionCard`: no footer `border-t` or band; actions sit right-aligned in the body row.
   - `PackageCard`: `surface.card`; selected = `ring-2 ring-blue-600 border-transparent`; price `font-bold`.
   - `Timeline`: `border-l-2` → 1 px `surface.rail` line; dot rings `ring-gray-200 dark:ring-gray-700/40`.
   - `JourneyStepper`: pending circles `border-gray-200 dark:border-gray-700/40` (was `gray-600`).
   - `StatusPill`: add a `live?: boolean` prop that defaults to **off**. Callers turn it on only for the current user's actionable status. The static dot stays.
   - `EmptyState`: no infinite float. `DropZone`: dashed `border-gray-300 dark:border-gray-700/50`.
   - `ACCENTS`, `TONES`, `Meter` / `MeterBar`: brand → blue; package shades become `blue-400…800`.
4. **Codemod across `tenantMgmt/**`** (scripted `sed`, reviewed by diff):
   - `brand-50→blue-50`, `brand-600→blue-600`, `brand-700→blue-700`, `brand-500→blue-500`, `dark:text-brand-200→dark:text-blue-400`, `dark:bg-brand-500/15→dark:bg-blue-500/15`
   - light-mode `slate-N → gray-N`
   - `dark:border-gray-700 → dark:border-gray-700/40` wherever no alpha is present; static `dark:border-gray-600 → dark:border-gray-700/40` (form controls `→ /30`); `dark:border-gray-800 → dark:border-gray-700/30`
   - `dark:divide-gray-800 → dark:divide-gray-700/30`
   - card-level `dark:bg-gray-900 → dark:bg-gray-800/40`. Exceptions to keep: modal or sticky backgrounds that must be opaque (ApplicationDetail sticky bar → `dark:bg-black/80 backdrop-blur`).
5. **Promote `sideProjects/PageHeader.tsx` → `components/ui/PageHeader.tsx`** and re-export it from the old path so side projects keep working. Swap its `slate` classes for `gray`.

**Exit check:** existing vitest suites pass (`PlatformConsole`, `SchoolCard`, `TenantStatusBanner`, `SubscriptionPage`, `SupportAccessPage`, `SetupChecklistCard`, `InvoiceCard`, `PaymentProofForm`, `RegisterSchoolPage`, `supportSession`). Fix any test that asserts old class names.

### Phase 2 — Console shell (PR A, ½ day)
- `PlatformConsole.tsx`: render `<PageHeader icon={Building2} title="Platform" subtitle="Schools, applications and billing across every tenant" actions={<Refresh/>} stats={[to review, payments to confirm, setup failures, live schools]} tabs={<TabBar …/>} />`. The badge counts already in `badges` feed the stats. `attention` tone applies to non-zero failures and payments.
- `OverviewPage`: remove its own header block and Refresh button (l.109–128), which now live in the shell. It starts directly with "Needs you now".
- Detail pages (`SchoolDetailPage`, `ApplicationDetailPage`): keep a compact back-link + `text-xl font-bold` title row, without repeating the PageHeader.
- **F12, one tab rail per screen:** on a detail route the shell drops the console `TabBar` into the PageHeader's compact mode (title + back to the list; the console tabs are reachable from the breadcrumb). The School-detail tabs then become the page's only underline rail. For the 8 tabs: show the first 5 (Overview, Admins, Package, Apps, Usage) and put Billing / Lifecycle / Audit behind a "More" menu below `lg`. This is the same ⋯ overflow pattern Task Mentor course details uses.
- Shell loading: `PageHeader` skeleton + `SkeletonCard` grid instead of `<Spinner />`.

### Phase 3 — Page-by-page border removal (PR B, ~2 days)
Apply rule 1 ("one border per section"):

| Page | Change |
|---|---|
| **SchoolsPage** | Card → `surface.card`. Logo box: drop the border and use `bg-gray-50 dark:bg-gray-900/50` (the Schools.tsx:110 look at low alpha). Meta footer: drop `border-t` and use a `surface.inset` strip (or plain `pt-3`). Skeleton matches. |
| **OverviewPage** | "Needs you now": `divide-y` → spaced rows with hover inset (`hover:bg-gray-50 dark:hover:bg-gray-800/50`). Pipeline circles: `border-2` → filled inset circles; current step solid blue. |
| **ApplicationsPage** | Rows become a list inside one card with `/30` dividers, not bordered rows. The dashed unassigned avatar becomes a filled gray chip. |
| **ApplicationDetailPage** | Document rows (l.351): `surface.inset`, no border. Checklist (l.430): use the system checkbox look (`rounded-md`, `border-gray-300 dark:border-gray-600/60`, blue when checked). Sticky decision bar: `border-t surface.divider` + `dark:bg-black/80 backdrop-blur`. Merge the small adjacent `Card`s (summary + contact) into one card with insets. |
| **SchoolDetailPage** | Collapse the 8 cards into 3–4 sections (Summary / Usage & limits / Apps & overrides / Activity). App rows (l.500) become insets, with the "on" state shown as a blue soft fill (not an emerald border). Override grid: drop `border-t` (l.398). Audit rail: thin `surface.rail`. |
| **SchoolAdminsTab** (v2) | Admin rows (l.207) become one `surface.card` list with `/30` dividers, not one box per admin; the skeleton (l.80) matches. Kind radio cards (l.334): off = `surface.inset` with no border, on = `ring-2 ring-blue-600` + `bg-blue-50 dark:bg-blue-500/15`. Role chips (l.552): off = filled `bg-gray-100 dark:bg-gray-800/70` with no border, on = `bg-blue-600 text-white`. Search results (l.494) become hover-inset rows; the picked person (l.519) is a `surface.inset` with a blue avatar, not a bordered blue box. Credentials (l.615): replace the `Card` inside the `Modal` with `surface.inset`. Delete the local `Chip` (l.183) and use the shared pill (Phase 1, `StatusPill` gains a `tone` prop). |
| **SettingsPage** | Items (l.200) become insets; only the active item gets `ring-1 ring-blue-500/40`. |
| **BillingPage / PackagesPage / SupportPage / AuditPage** | Card + insets; table-like lists use `/30` dividers; page-level skeletons. |

### Phase 4 — School-facing pages + shared bits (PR C, ~1 day)
- `account/SubscriptionPage`, `SupportAccessPage` (input l.182 → `surface.input`), `TenantStatusBanner` (9 borders → a tinted banner with no border, status colour as fill), `LockedFeature`, `SetupChecklistCard`.
- `shared/InvoiceCard`, `PaymentProofForm` (l.31: field border `/30`, red only on error), `paymentBits`.
- **F11, one person picker:** extract `components/people/PersonElsewherePicker.tsx` (search input, skeleton rows, result rows, picked state; props `onPick`, `excludeTenantId`, `renderAside`). It is built on `surface.*` and `accent.*` with gray neutrals and no nested borders. Use it in both `SchoolAdminsTab` → `AssignModal` and the `CreateUserModal` "already in another school" panel. That deletes both hand-made versions, and with them every `dark:bg-slate-800` / `dark:border-slate-600/700` in `CreateUserModal`. The panel wrapper becomes a borderless `bg-blue-50/60 dark:bg-blue-500/10` tint. `CreateUserModalElsewhere.test.tsx` and the `PlatformConsole` admin tests find elements by role and text, not class, so they should pass unchanged.
- `onboarding/MessagesThread` composer (l.101) and `register/fields.tsx` / `SchoolFields.tsx` inputs → `surface.input`, so the public wizard follows the codemod. Re-shoot the register and tracker pages.

### Phase 5 — Typography + motion pass (PR C, ½ day)
- `font-extrabold` → `font-bold` throughout tenantMgmt.
- Section titles: `SectionTitle` → `text-base font-semibold text-gray-900 dark:text-white`.
- `text-[11px]` kept only for pills and badges; body labels become `text-xs`.
- Motion: remove `KpiTile` ping, `EmptyState` float and `ActionCard` wobble. `StatusPill` live only where Phase 1 enabled it. `CountUp` only on Overview KPIs.

### Phase 6 — Guard against regressions (PR C, ¼ day)
Add `frontend/src/components/tenantMgmt/__tests__/designTokens.test.ts` (vitest). It reads every `.tsx` file under `tenantMgmt/`, plus `components/people/**` and `CreateUserModal.tsx`, and fails on:
- `\bbrand-\d` · `\bslate-\d` · `(violet|indigo|purple|sky|cyan)-\d`
- `dark:border-gray-(600|700|800)(?!/)` · `dark:divide-gray-\d+(?!/)`
- `shadow-` · `border-[lt]-(2|4)\b` paired with a colour (accent strips)

- `dark:(bg|border)-slate-\d` (catches the F11 regression in shared modals)

It prints the file and line so the next contributor sees the rule. v2 shows why this matters: #158 and #159 shipped without anything checking these rules and added 24 borders, 31 `brand-*` and 46 `slate-*` classes.

---

## 5. Delivery

| PR | Contents | Risk |
|---|---|---|
| **A** | Phase 1 + 2: tokens, kit, codemod, PageHeader promotion, console shell, single tab rail (F12) | Medium: touches every tenant screen through the kit; covered by the existing tests and before/after screenshots |
| **B** | Phase 3: platform page sweeps, including SchoolAdminsTab (F10) | Low: visual only |
| **C** | Phases 4–6: school-facing pages, shared `PersonElsewherePicker` (F11), typography/motion, guard test | Low–medium: the picker refactor touches user creation; covered by `CreateUserModalElsewhere.test.tsx` |

Estimate: **~6–7 working days** (v1: 5–6; +1 day for the Admins tab, picker extraction and tab overflow).

**Sequencing note:** `feat/school-switch` is in progress in this worktree (backend only so far). If it adds frontend UI under `tenantMgmt/` or a school switcher in the chrome, land PR A (tokens + kit) first, or build the switcher on `design/surfaces.ts` from the start. Otherwise it becomes the next F10. No migration. Normal frontend deploy. After the deploy, check the live `PlatformConsole-*.js` chunk for a new class (e.g. `dark:border-gray-700/40`) before treating a report of "still looks old" as a code issue (stale-chunk trap from PR #151/#152).

## 6. Acceptance criteria
- In dark mode, a console tab shows **at most one visible outline per section**, and the outline is no brighter than `/schools` cards.
- Put a `/platform/schools` screenshot next to `/schools` and `/side-projects`: the card surface, border, blue, tab underline and button styles match.
- No `brand-*`, light-mode `slate-*`, or alpha-less dark border remains in `tenantMgmt`, and no `dark:*-slate-*` remains in `CreateUserModal` (the guard test passes).
- School detail shows exactly one tab rail, and its tabs fit at 390 px without sideways scrolling.
- "Find a person in another school" looks the same in the platform Admins tab and in Create user, because one component draws both.
- Every content load shows a skeleton; every action still toasts its outcome.
- All tenantMgmt vitest suites pass; `tsc -b` is clean.
