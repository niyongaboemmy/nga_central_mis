# E-Learning Module — UX / UI Implementation Plan (Simplicity · Modernity · Interactivity · Delight)

**Date:** 2026-09-21
**Builds on:** [`ELEARNING_MODULE_IMPLEMENTATION_PLAN.md`](./ELEARNING_MODULE_IMPLEMENTATION_PLAN.md) (data model, API, phases). That plan says *what* the module stores and serves; this one says *how it should feel* and adds the design-system, interaction and front-end work needed to get there. Phase numbers below map 1:1 to the phases of the base plan; nothing here changes its schema except the two small additions in §6.3.
**Reference research:** Duolingo (habit loops, micro-interactions, mascot), Khan Academy (calm, content-first dashboards), Brilliant/Quizlet (interactive checks), Canvas/Moodle 4 (course index), Apple HIG & Material 3 Expressive (motion, reduced motion), WCAG 2.2 (target size 2.5.8), typographic ergonomics (45–75 CPL), Self-Determination Theory research on gamification (what to *avoid*).

---

## 0. Executive summary

The base plan produces a correct e-learning module. This plan makes it one that a 17-year-old on a phone *wants* to open, and that a teacher can fill in five minutes after class. Four design goals, each with a measurable target:

| Goal | Meaning for this module | Target (Phase 2 UAT) |
|---|---|---|
| **Simplicity** | Three student screens, one teacher builder, no page that needs a manual. Progressive disclosure everywhere. | A new student reaches this week's lesson in ≤ 2 taps from login; a teacher publishes a week in ≤ 60 s |
| **Modernization** | A coherent, token-based design system (radius, elevation, motion, semantic colour) on top of the existing Tailwind/Inter/framer-motion stack; light and dark first-class; bento-style overview | Zero ad-hoc hex colours in `elearning/`; Lighthouse a11y ≥ 95, perf ≥ 85 on a mid-range Android |
| **Interactivity** | Every action answers instantly (optimistic UI), content responds (checks, reveals, "continue"), spring motion with meaning | Perceived latency: all taps give feedback < 100 ms; item-to-item navigation < 300 ms |
| **Delight ("cute")** | Warm, friendly, personal — a mascot with restraint, celebrations that mark *real* learning, microcopy that talks like a good teacher, never a casino | SUS ≥ 80 with a student panel; no public leaderboards (research-backed, §4.4) |

The recommendation is a **"calm-by-default, joyful-on-achievement"** system: the everyday surfaces (course index, reader) are quiet and content-first like Khan Academy; achievement moments (week completed, criterion demonstrated, streak kept) are celebrated with Duolingo-grade micro-interactions. This split is what keeps "cute" from becoming noise.

---

## 1. Research findings that shape the design

### 1.1 What the best learning products do

| Product | Pattern worth adopting | Pattern to avoid |
|---|---|---|
| **Duolingo** | "Play first, profile second": land the user *in* a lesson, not on a settings page. Micro-interactions on every action (button press, correct answer, progress bar fill). Completion celebrated with confetti and a one-line message. A mascot that carries emotion (encouragement, gentle nudge). Streaks as a *personal* habit signal. | Guilt-based notifications; loss-aversion streak mechanics that punish; hearts/lives; monetised gems. School context = no manipulation. |
| **Khan Academy** | Neutral, uncluttered palette so *content* is the colour; personalised "up next" dashboard; hints and step-by-step guidance; mastery per skill shown as a simple filled bar. | — |
| **Brilliant** | Interactive checks *inside* the reading (tap to reveal, drag to order, pick the answer) rather than a quiz at the end; instant, kind feedback with an explanation. | — |
| **Quizlet** | Flashcard-style review derived from content; "learn / test / match" modes on the same material. | Ads, upsell interruptions. |
| **Moodle 4** | Persistent course index with completion dots; "activity requirements at a glance". | Dense, form-heavy activity settings. |
| **Canvas** | Modules as weekly playlists; "Mark as done"; module states locked/unlocked/started/completed. | Deep menus; settings hidden three levels down. |

### 1.2 Design-science principles applied

- **Progressive disclosure** (Nielsen; UXPin/IxDF 2026 guides): show the one thing needed now; details behind a tap. Reduces cognitive load, the primary complaint students have about LMSs.
- **Fitts's law & WCAG 2.2 §2.5.8**: targets ≥ 44×44 px on touch (WCAG AAA; 24 px is the AA floor). Primary actions in the thumb zone (bottom third of a phone).
- **Typographic measure**: 45–75 characters per line (66 ideal) for the reader; the existing reader already has font-scale/line-height prefs — keep and expose them in one tap.
- **Norman's three levels**: *visceral* (rounded, warm, soft shadows, friendly mascot), *behavioural* (fast, forgiving, predictable), *reflective* ("I'm 70 % through Element 1 and I can prove it"). Design every screen to hit all three.
- **Motion with meaning** (Apple HIG, Material 3 Expressive): spring physics for state changes, duration 150–300 ms for UI, ≤ 600 ms for celebrations; honour `prefers-reduced-motion` — reduce to opacity-only fades.
- **Self-Determination Theory**: intrinsic motivation needs *autonomy, competence, relatedness*. Meta-analyses find gamification raises autonomy/relatedness but leaderboards *decrease* competence for lower-ranked students and "BPL" (badges-points-leaderboards) for trivial actions is perceived as manipulative. Hence: personal progress, mastery framing, optional cooperative goals; **no public leaderboards, no badges for logging in**.
- **Aesthetic trends 2026 with restraint**: bento grids for overviews, subtle glass for floating chrome (bottom bar, index drawer), soft-UI rounded cards, expressive type for headings. Rule from the trend literature itself: a trend earns its place only if it makes the screen easier to use.

### 1.3 Audit of the current MIS screens (from the four screenshots reviewed)

| Observation | Impact | Fix in this plan |
|---|---|---|
| Scheme calendar page stacks **two red alert banners** ("Action Required", "2 teaching days missing…") above the calendar; six toolbar buttons of equal weight | Alarm fatigue; primary action unclear | One inline, dismissible notice with a single CTA; toolbar → one primary + overflow (§3.3) |
| Curriculum tab is information-rich but text-dense; criteria rows repeat "Taught in N scheme entries…" | Good data, high load | Reuse as a *drawer* inside the course builder with chips, not paragraphs |
| Lesson-notes list: cards with 3–4 status pills each (Published / Students can view / PDF · 49 p.) | Pills compete; no hierarchy | One status, one secondary meta line, cover thumbnail |
| Student "My Library": flat list sorted by recency, "about 105 min of reading" | No sense of *now* or *next*; no progress | Replaced by **My Learning** home (§3.1) |
| Whole app is a dark, high-contrast slate theme with pill buttons and Inter | Solid base, slightly "admin tool" | Keep tokens; add warmth (accent, radius scale, mascot), light theme parity |

---

## 2. Design system extension (`frontend/src/design/`)

Everything below extends `tailwind.config.js`; no new CSS framework, no new component library. `framer-motion`, `lucide-react`, `recharts` are already dependencies.

### 2.1 Tokens

```js
// tailwind.config.js → theme.extend
colors: {
  // keep background/surface/card/text/border tokens; add semantic + brand
  brand:   { 50:'#eef4ff', 100:'#d9e6ff', 500:'#3b6cff', 600:'#2f56d9', 700:'#2444ad' }, // primary (existing blue family)
  accent:  { 100:'#ffe9d6', 500:'#ff8a3d', 600:'#e5731f' },  // warm "joy" colour — celebrations, streak flame, mascot
  success: { 100:'#dcfce7', 500:'#22c55e', 700:'#15803d' },
  warning: { 100:'#fef3c7', 500:'#f59e0b', 700:'#b45309' },
  danger:  { 100:'#fee2e2', 500:'#ef4444', 700:'#b91c1c' },
  // per-subject colour still comes from Subject.color; tint it with color-mix() at 12 % for card backgrounds
},
borderRadius: { xl:'1rem', '2xl':'1.25rem', '3xl':'1.75rem', pill:'9999px' },
boxShadow: {
  soft:  '0 1px 2px rgb(15 23 42 / .04), 0 8px 24px -12px rgb(15 23 42 / .12)',
  float: '0 12px 40px -12px rgb(15 23 42 / .25)',
  glow:  '0 0 0 4px rgb(59 108 255 / .18)',
},
fontSize: { 'display':['2rem',{lineHeight:'1.15',letterSpacing:'-0.02em',fontWeight:'700'}] },
transitionTimingFunction: { spring:'cubic-bezier(.2,.8,.2,1)' },
```

- **Type scale**: display 32 / h1 24 / h2 20 / body 16 (reader 17–18 default) / meta 13. Inter for UI; the reader keeps its serif option.
- **Spacing rhythm**: 4-pt grid; card padding 16 (phone) / 20 (desktop); section gap 24.
- **Elevation**: flat by default; `shadow-soft` on cards; `shadow-float` + `backdrop-blur` only on floating chrome (bottom bar, index drawer, toasts).
- **Dark mode**: same tokens, surfaces from the existing `surface.dark`/`card.dark`; accent stays warm. Subject tints use `color-mix(in oklab, var(--subject) 18%, transparent)` so they work on both.

### 2.2 Motion vocabulary (`design/motion.ts`)

| Name | Use | Spec |
|---|---|---|
| `tap` | any pressable | scale 0.97 on press, spring back (stiffness 500, damping 30) |
| `reveal` | drawers, sheets, item view swap | y 12→0 + opacity, 220 ms, `spring` |
| `fill` | progress ring/bar | width/stroke animates 400 ms ease-out, never from 0 on re-render (animate from previous value) |
| `check` | completion dot | scale 0→1.15→1 + colour, 320 ms |
| `celebrate` | week/element complete | confetti burst ≤ 600 ms (`canvas-confetti`, ~2 KB) + mascot pose + one line; max once per event |
| `shake` | wrong answer in a knowledge check | x ±4 px, 3 cycles, 240 ms — *plus* kind text; never red flash |

`useReducedMotion()` from framer-motion switches all to 120 ms opacity fades and disables confetti. One helper, `motionProps(name)`, so components never hand-write transitions.

### 2.3 Component inventory (`frontend/src/components/elearning/ui/`)

| Component | Role | Notes |
|---|---|---|
| `SubjectCover` | Colour-tinted card header with subject emoji/icon, code chip | Icon auto-picked by `CourseCategory` (e.g. 🖥️ ICT, 📐 Maths); teacher can override |
| `ProgressRing` / `ProgressBar` | Course / section / element progress | SVG ring, animated `fill`, label inside; `aria-valuenow` |
| `CompletionDot` | Item state in the index | grey / half / green with `check` motion |
| `ItemCard` | An item in a section | 56 px min height, icon by type, meta (min · due), state; whole card is the target |
| `WeekPill` | "Week 4 · 21–25 Sep" | Highlights *this week*; today's section auto-scrolls into view |
| `BottomActionBar` | Reader bottom chrome | Prev · Mark done · Next; glass; thumb-zone; hides on scroll-down, shows on scroll-up |
| `IndexDrawer` | Course index | Persistent ≥ 1024 px, sheet on phone; swipe to open |
| `Mascot` | Small illustrated character ("Umuhoza" — name to be chosen with students) with 6 poses: hello, thinking, cheering, sleepy, nudge, book | Inline SVG, ≤ 20 KB total; appears in empty states, celebrations, AI tutor; **never** blocks content |
| `KnowledgeCheckCard` | Inline MCQ / true-false / tap-to-reveal | Instant feedback, explanation, "try again"; keyboard 1-4 |
| `AITutorSheet` | Bottom sheet chat scoped to the course | Suggested questions from section criteria; cites items |
| `EmptyState` | Mascot + one sentence + one CTA | Copy table in §5 |
| `Toast` | Non-blocking confirmation | Bottom-centre, 3 s, undo where possible |
| `StreakChip` (opt-in) | Personal weekly learning streak | Hidden by default; student turns it on in profile (autonomy) |

All interactive components: ≥ 44×44 px hit area, visible focus ring (`shadow-glow`), `aria-*` labels, no colour-only meaning (icon + text).

---

## 3. Information architecture & key screens

### 3.1 Student — three screens, no more

```
/my-learning                     Home       "What's next" — bento overview
/my-learning/courses/:id         Course     index + item view (two-pane / drawer)
/my-learning/me                  Me         mastery, streak (opt-in), reading prefs, AI history
```
Library ("all notes") becomes a filter inside Home, not a separate page. Everything else is a sheet or drawer, never a new route.

**Home (bento grid, mobile stacks to one column)**
1. **Hero "Up next"** — largest tile: subject cover tint, "Week 4 · CSS Grid", the next incomplete item with type icon and estimated minutes, one button *Continue*. Powered by `GET /my/courses` (`next_item`). Mascot says hello with time-of-day copy.
2. **This week** — one row of subject chips with mini progress rings for the current week; tap → that section.
3. **Due soon** — max 3 items with due dates; empty → mascot "Nothing due. Nice."
4. **Subjects** — cards with ring, teacher avatar, last activity; tap → course.
5. **Keep going** (Phase 2) — element(s) at ≥ 70 % with "2 more to complete Element 1" (competence framing — near-goal nudges work; far-goal ones don't).

**Course page**
- Left/drawer: `IndexDrawer` — sections as `WeekPill` + items with `CompletionDot`; current week expanded, others collapsed (progressive disclosure); a slim ring at the top for course progress.
- Main: item view. Note → existing reader (measure capped at 68 ch, `useReaderPrefs` menu in the top-right); document → viewer; page → typography prose; video → 16:9 with saved position; Task Mentor → launch card with status; knowledge check → `KnowledgeCheckCard`.
- `BottomActionBar`: ← Prev · **Mark as done** (or auto ✓ for VIEW) · Next →. Keyboard `[`/`]`, `d`.
- Completing the last required item of a week → `celebrate` + "Week 4 done. You covered criteria 2.1 and 2.2." + *Next week* button (if published) or *Back home*.

**Me**
- Mastery per subject: elements as cards, criteria as dots (covered / demonstrated), plain-language: "You've shown 6 of 10 criteria in Element 1".
- Streak chip toggle (default off), reading preferences, AI tutor history, "download this week for offline" (Phase 5).

### 3.2 Teacher — one builder, fast paths

`/elearning/courses/:id/build` (also as the **Course** tab on the scheme page)

- **Left rail**: weeks (from the scheme) with status pill (Hidden / Scheduled 21 Sep / Published) and item count; drag to reorder manual sections only (scheme weeks keep scheme order — no double source of truth).
- **Main**: selected week — items list, drag handles, inline rename, kebab for settings. Big, friendly **"+ Add"** button opens a *command palette style* picker (type to search notes, materials, quizzes; or pick "Page / Video / Link / Check"). Notes not yet published show a *Publish note* switch inline.
- **Right drawer (on demand)**: item settings — completion rule as a segmented control with plain words ("Opens it" / "Marks it done" / "Submits in Task Mentor" / "Scores ≥ __ %"), required toggle, due date, criteria chips with *Suggest with AI*.
- **Fast paths** (the 60-second publish):
  1. "Set up course" → weeks pre-filled with notes/materials (base plan seeding) → review → **Publish course**.
  2. After class: open today's week from the calendar notification → toggle *Published* → done.
  3. Empty week banner (single, inline, not red): "Week 4 goes live Monday and has no content yet. *Add a note* · *Skip this week*".
- **Preview as student**: a switch in the header that renders the learner components in a phone-width frame.
- **Insights tab** (Phase 2): funnel bars per week (recharts, brand palette), "Students who haven't started" list with one-tap *Nudge* (sends a friendly notification, template in §5), most-missed check question.

### 3.3 Retro-fits to existing screens (small, high value)

- Scheme calendar: collapse the two alert banners into one `Alert` with a single CTA; toolbar → **Primary (Calendar/Timeline toggle) + "Course" tab + overflow menu** for PDF/Edit/Cover/Delete.
- Lesson-note cards: one status pill, cover thumbnail (first image or generated gradient with title initials), reading time.
- Global: adopt the `tap` motion on `ui/Button`, add `size="lg"` (48 px) for mobile primary actions.

### 3.4 Admin

`/admin/elearning` register keeps the existing admin table language but adds a **bento KPI row** (courses live, median completion, students active this week, weeks published on time) and an engagement heat-map (subjects × weeks). No mascot, no celebrations — admin surfaces stay calm.

---

## 4. Interaction design

### 4.1 Feedback & latency
- Optimistic updates for *done*, *publish*, reorder; rollback with toast + undo on failure.
- Skeletons (existing `shimmer`) for lists; item view swaps with `reveal`; prefetch next item on hover/idle.
- Reader heartbeat (base plan) doubles as "reading position" — reopening an item scrolls to where the student left off, with a subtle "Continue from here" pill.

### 4.2 Navigation ergonomics
- Phone: bottom tab bar (Home · Course · Me), index as swipe-in sheet, `BottomActionBar` in thumb zone; back gesture respected (routes, not modals, for item view).
- Desktop: two-pane, index persistent, `j/k` to move, `Enter` to open, `/` to search the course.
- Deep links: every item has a stable URL; the calendar's lesson slot links to the section; Task Mentor returns to the item after a quiz (`?return=/my-learning/courses/:id/items/:itemId`).

### 4.3 Learning interactivity
- **Inline knowledge checks** rendered *between* note sections (teacher inserts a "check" block in the Tiptap editor — a new node type `knowledgeCheck` in `LessonNoteRichEditor`), not only as separate items. Instant feedback: correct → `check` motion + "Yes — because …"; wrong → `shake` + hint + retry. Ungraded, unlimited.
- **Tap-to-reveal** and **flip cards** as Tiptap nodes for definitions/examples (Brilliant/Quizlet pattern) — cheap to build, high engagement.
- **AI tutor** as a bottom sheet with 3 suggested questions derived from the section's criteria ("Explain 2.1 in simpler words", "Give me an example", "Quiz me on this week"); answers cite the item; "Quiz me" produces a 3-question inline check.
- **Review mode** (Phase 3): "Review Week 3" generates flashcards from headings/definitions of the week's notes — Quizlet-style, but from the teacher's own content.

### 4.4 Gamification — what's in, what's out (evidence-based)

| In | Out |
|---|---|
| Personal progress rings/bars everywhere (competence) | Public leaderboards (harm low achievers) |
| Week/element completion celebrations (real achievement) | Badges for logging in / opening a PDF (trivialising) |
| Opt-in personal streak, forgiving (a "rest day" per week; no loss animation) | Hearts/lives, penalties, guilt notifications |
| Near-goal nudges ("2 more to finish Element 1") | Far-goal pressure ("You are 40 % behind") |
| Class-level cooperative goal, opt-in per teacher ("Class A read 80 % of Week 4 🎉") — relatedness without ranking | Individual rankings, XP shops |
| Kind, specific microcopy from the mascot | Sarcasm, shame |
| Choice: order within a week is free unless the teacher enables sequential (autonomy) | Forced linear paths by default |

---

## 5. Microcopy & personality

Voice: a good teacher — warm, short, specific, second person, no exclamation-mark spam. Mascot speaks in ≤ 12 words.

| Situation | Copy |
|---|---|
| Home, morning | "Morning, Aline. Week 4 of Web UI is waiting." |
| Empty course (student) | "Your teacher hasn't published anything yet. Check back Monday." |
| Empty week (teacher) | "Week 4 goes live Monday and is still empty. Add a note or skip it." |
| Item done (VIEW) | ✓ quietly, no toast |
| Marked done | "Done. Next: *CSS Grid basics* (8 min)." |
| Week complete | "Week 4 done — you covered 2.1 and 2.2." |
| Element demonstrated | "Element 1 complete. That's a real skill now." |
| Wrong answer | "Not quite — look at how the selector is written. Try again." |
| Nudge (teacher → student) | "Hi Aline — Week 4 has two short notes ready when you are. — Mr Niyongabo" |
| Offline | "You're offline. Saved notes still open; progress syncs later." |
| Error | "That didn't save. We'll retry — or tap to try now." |

Language: English now; strings live in one `copy.ts` so Kinyarwanda/French can be added without touching components.

---

## 6. Implementation plan (mapped to the base plan's phases)

### Phase 0 — Design foundations (3–4 days, runs alongside base Phase 0)
- Add tokens (§2.1), motion helpers (§2.2), `Mascot` SVG set, `copy.ts`; Storybook-free "kitchen sink" route `/dev/elearning-ui` behind `import.meta.env.DEV` for visual review in light/dark.
- Low-fi Figma (or code) prototypes of Home, Course, Builder; 5 quick hallway tests with students and 3 teachers (15 min each). Pick the mascot name.
- Define budgets: JS for `elearning/` chunk ≤ 180 KB gzip; LCP ≤ 2.5 s on a 3G-ish profile; all lists virtualised beyond 50 rows.

### Phase 1 — Student Home + Course page, Builder v1 (with base Phase 1, +5–6 days on top)
- Build the component inventory (§2.3) minus `KnowledgeCheckCard`, `AITutorSheet`, `StreakChip`.
- Home bento (tiles 1–4), Course page (index drawer, item views for note/document/link, bottom bar), Me (prefs only).
- Builder v1: rail + list + "+ Add" palette + settings drawer + preview-as-student.
- Retro-fits §3.3.
- Tests: RTL component tests for `ProgressRing` (aria), `IndexDrawer` (keyboard), `BottomActionBar` (hide/show on scroll); Playwright smoke on phone viewport (login → Continue → item → Next) — ≤ 2 taps assertion.

### Phase 2 — Progress, celebrations, insights (with base Phase 2, +4–5 days)
- `CompletionDot`/`fill` wired to progress API; optimistic done; `celebrate` on week/element; "Keep going" tile; near-goal nudges.
- Teacher Insights tab with recharts (brand palette, no 3D, no gradients on data); *Nudge* action.
- Reduced-motion QA pass; contrast QA (4.5:1 text, 3:1 UI) both themes.

### Phase 3 — Interactive content (with base Phase 3, +6–7 days)
- Tiptap nodes: `knowledgeCheck`, `reveal`, `flipCard`; teacher toolbar buttons with AI "make a check from this paragraph".
- `KnowledgeCheckCard`, video player with resume, `ItemCard` for Task Mentor launch with live status.
- Review mode (flashcards from a week).

### Phase 4 — Mastery UI (with base Phase 4, +3–4 days)
- Me → mastery cards; teacher/admin heat-map; plain-language criteria states; export keeps the calm admin style.

### Phase 5 — AI tutor sheet, offline, streak (with base Phase 5, +4–5 days)
- `AITutorSheet` with suggested questions and citations; offline banner + cached-week indicator; opt-in `StreakChip` with rest-day logic; class cooperative goal (teacher opt-in).

### 6.3 Two small schema additions to the base plan
- `Course.icon` VARCHAR(16) NULL — teacher-chosen emoji/icon key for `SubjectCover` (falls back to category).
- `UserLearningPrefs` (user_id PK, streak_enabled TINYINT DEFAULT 0, celebrations_enabled TINYINT DEFAULT 1, reduced_motion TINYINT NULL, updated_at) — per-account (not per-device) because it encodes *choices*, unlike reader prefs.

**UX effort on top of the base plan: ~25–31 days** (designer-developer hybrid; ~40 % overlaps with front-end work already counted in the base plan, so the *net* addition is closer to 15–18 days).

---

## 7. Quality gates & metrics

| Gate | Check |
|---|---|
| Accessibility | axe clean on all `elearning/` routes; keyboard-only run-through; screen-reader labels on rings/dots; targets ≥ 44 px on touch; `prefers-reduced-motion` honoured |
| Ergonomics | Reader measure 45–75 CPL at every font scale; thumb-zone actions on phone; no horizontal scroll at 360 px |
| Performance | Budgets in Phase 0; image `loading=lazy`; confetti lazy-imported; index list virtualised |
| Consistency | Lint rule: no raw hex in `elearning/**` (Tailwind tokens only); motion only via `motionProps` |
| Delight sanity | Each celebration tied to a `LearningEvent` verb `COMPLETED` on a section/element — never to trivial actions |
| Success metrics (from `LearningEvent`) | Weekly active learners / enrolled; median time-to-first-item after publish; week completion rate; knowledge-check retry-to-correct rate; teacher publish latency (entry COMPLETED → section PUBLISHED); SUS with student panel each term |

---

## 8. Open questions

1. Mascot: illustrated character vs. abstract shape? (Student panel in Phase 0 decides; must work at 24 px and in both themes.)
2. Should celebrations be on by default for adult learners (Level 5+)? Proposed: on, with the one-tap off switch in Me.
3. Class cooperative goals need a teacher opt-in *and* a floor (don't show "Class A 12 %"); confirm threshold (proposed: show only when ≥ 50 %).
4. Bottom tab bar on phone conflicts with the existing global `Sidebar`/`Navbar` — proposed: learner routes render inside a lighter `LearnerLayout` (no admin sidebar), like the SSO login pages already bypass `Layout`.

---

## Sources

- Duolingo design breakdowns — [925 Studios](https://www.925studios.co/blog/duolingo-design-breakdown), [StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo), [Micro-interactions on Duolingo (Medium)](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682), [Streak system design (Medium)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f), [Gamification as design language](https://blakecrosley.com/guides/design/duolingo)
- Learning-app UX & progressive disclosure — [Studio21: 5 UX principles for education apps](https://medium.com/@Studio21/5-ux-design-principles-every-education-app-should-follow-1f2c818e0012), [UXPin: progressive disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [IxDF: progressive disclosure](https://ixdf.org/literature/topics/progressive-disclosure), [Bricx: eLearning interface examples 2026](https://bricxlabs.com/blogs/elearning-interface-design-examples), [Khan Academy UX case study](https://medium.com/@danielgordonemail/khan-academy-a-ux-ui-case-study-230640d6ee00)
- Gamification evidence — [Meta-analysis: gamification, intrinsic motivation, autonomy/relatedness (ETR&D 2023)](https://link.springer.com/article/10.1007/s11423-023-10337-7), [Effects of game elements on need satisfaction (Computers in Human Behavior)](https://www.sciencedirect.com/science/article/pii/S074756321630855X), [Leaderboards and low achievers (JOTSE)](https://www.jotse.org/index.php/jotse/article/view/3321/1020), [Growth Engineering: the dark side of gamification](https://www.growthengineering.co.uk/dark-side-of-gamification/), [ICE Blog: SDT lens on gamification](https://icenet.blog/2025/06/17/align-the-game-to-your-aim-considering-gamification-through-the-lens-of-self-determination-theory/)
- Ergonomics & accessibility — [WCAG 2.5.8 target size guide (AllAccessible)](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide), [Smashing: accessible target sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/), [UXPin: optimal line length](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/), [Baymard: line length readability](https://baymard.com/blog/line-length-readability), [Fitts's law](https://en.wikipedia.org/wiki/Fitts%27s_law), [eLearning Industry: mobile-first learning](https://elearningindustry.com/mobile-first-learning-designing-educational-apps-that-actually-engage)
- Motion & emotional design — [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Apple HIG vs Material Design (Medium)](https://medium.com/@shivaniy0211/apples-human-interface-guidelines-vs-google-s-material-design-guidelines-e28db15028c0), [Emotional Design (Norman)](https://en.wikipedia.org/wiki/Emotional_Design)
- 2026 UI trends (applied with restraint) — [Brucira: top UI trends](https://blog.brucira.com/top-ui-design-trends/), [Midrocket: UI design trends 2026](https://midrocket.com/en/guides/ui-design-trends-2026/), [Intuitia: app design trends 2026](https://www.intuitia.tech/blog/app-design-trends), [WriterDock: bento grids & beyond](https://writerdock.in/blog/bento-grids-and-beyond-7-ui-trends-dominating-web-design-2026)
