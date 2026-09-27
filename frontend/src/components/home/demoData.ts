/**
 * Home demo data -- LOCAL DEVELOPMENT ONLY.
 *
 * Fills Home with realistic items, lessons, figures, updates and messages so
 * the layout can be judged with a full page instead of an empty one.
 *
 * On only when BOTH hold:
 *   - the Vite dev server is running (`import.meta.env.DEV`; a production build
 *     replaces it with `false` and drops this data), and
 *   - `VITE_HOME_DEMO=true` is set in the local, untracked `frontend/.env`,
 *   - and it is not a test run.
 * Remove that line (or set it to false) and restart Vite to see real data.
 */
import type { AppState } from "./appContract";
import type { AttentionItem, GlanceTile, HomeLens, HomeOverview, QuickAction, TodayLesson } from "./contract";

// Never under test: Vitest reads the same .env and also reports DEV.
export const HOME_DEMO =
  import.meta.env.DEV && import.meta.env.MODE !== "test" && import.meta.env.VITE_HOME_DEMO === "true";

const hhmm = (minutes: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const item = (o: Partial<AttentionItem> & Pick<AttentionItem, "id" | "tier" | "title" | "lens">): AttentionItem => ({
  source: "mis",
  kind: "DEMO",
  via: [],
  depth: "detail",
  count: 1,
  entities: [],
  why: "",
  cta: { label: "Open", href: "/home" },
  ...o,
  id: `demo:${o.id}`,
});

/** Lessons placed around the current time: one done, one on now, the rest still to come. */
const lessonsAroundNow = (kind: "teaching" | "learning"): TodayLesson[] => {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const plan: Array<[string, string, number, number, TodayLesson["plan"], TodayLesson["report"]]> = [
    ["Mathematics", "S3 A", -110, -30, "done", "done"],
    ["Physics", "S4 B", -15, 45, "done", "pending"],
    ["Chemistry", "S3 A", 60, 120, "missing", "upcoming"],
    ["Web Application Development", "L5 SOD", 150, 230, "done", "upcoming"],
  ];
  return plan
    .filter(([, , start]) => now + start < 24 * 60 - 20)
    .map(([subject, group, start, end, p, r], i) => ({
      lesson_key: `demo-${i}`,
      kind,
      slot_id: 9000 + i,
      subject_id: 9000 + i,
      subject_name: subject,
      class_group_id: 9,
      class_group_name: group,
      start_time: hhmm(now + start),
      end_time: hhmm(now + end),
      location: ["Room 12", "Lab 2", "Lab 1", "ICT Lab"][i],
      color: ["#3b6cff", "#8b5cf6", "#10b981", "#f59e0b"][i],
      teacher_name: kind === "learning" ? ["Mr. Mugabo", "Ms. Uwase", "Mr. Habimana", "Ms. Ingabire"][i] : null,
      ...(kind === "teaching" ? { plan: p, report: r } : {}),
      href: "/dashboard",
    }));
};

const STAFF_LENSES: HomeLens[] = [
  { key: "TEACHING", type: "TEACHING", label: "Teaching", reason: "a subject teacher", via: [] },
  { key: "CLASS_GROUP:9", type: "CLASS_GROUP", label: "Class S3 A", reason: "class teacher of S3 A", via: [] },
  { key: "SELF", type: "SELF", label: "Me", reason: "signed in", via: [] },
];

const staffItems = (): AttentionItem[] => [
  item({ id: "sow", tier: "blocking", lens: "TEACHING", count: 2, title: "2 schemes of work not submitted",
    why: "Teaching is in week 22 — lesson notes, plans and courses all hang off the scheme.",
    entities: ["Chemistry · S3 A", "Physics · S4 B"], cta: { label: "Submit", href: "/scheme-of-work" }, due_at: inHours(20) }),
  item({ id: "plan", tier: "blocking", lens: "TEACHING", title: "Chemistry at " + hhmm(new Date().getHours() * 60 + new Date().getMinutes() + 60) + " has no lesson plan",
    why: "The lesson starts within the hour.", entities: ["Chemistry · S3 A"], cta: { label: "Plan it", href: "/scheme-of-work" } }),
  item({ id: "reports", tier: "slipping", lens: "TEACHING", count: 3, title: "3 lessons not reported this week",
    why: "Reports are due by Friday.", entities: ["Mathematics · S3 A", "Physics · S4 B", "+1"], cta: { label: "Report", href: "/reporting" }, waiting_since: ago(50) }),
  item({ id: "register", source: "attendance", tier: "slipping", lens: "CLASS_GROUP:9", title: "Register not taken for S3 A this morning",
    why: "Attendance closes at 10:00.", entities: ["S3 A"], cta: { label: "Take register", href: "/home" } }),
  item({ id: "marks", source: "taskmentor", tier: "slipping", lens: "TEACHING", count: 14, title: "14 quiz submissions to mark",
    why: "Submitted on Task Mentor since Monday.", entities: ["Physics Quiz 3 · S4 B"], cta: { label: "Mark", href: "/home" }, waiting_since: ago(70) }),
  item({ id: "notes", tier: "tidy", lens: "TEACHING", count: 2, title: "2 lesson notes still in draft",
    why: "Students can't see drafts.", entities: ["Newton's Laws", "Acids and Bases"], cta: { label: "Review", href: "/lesson-notes" } }),
  item({ id: "absent", source: "attendance", tier: "tidy", lens: "CLASS_GROUP:9", count: 3, title: "3 students absent twice this week",
    why: "Worth a word with their parents.", depth: "summary", cta: { label: "View", href: "/home" } }),
];

const staffTiles = (): GlanceTile[] => [
  { id: "demo:t1", source: "mis", lens: "TEACHING", label: "Schemes submitted", value: "4/6", status: "warning", href: "/scheme-of-work" },
  { id: "demo:t2", source: "mis", lens: "TEACHING", label: "Reported this week", value: "9/12", status: "good", href: "/reporting" },
  { id: "demo:t3", source: "mis", lens: "TEACHING", label: "Lessons today", value: "4", hint: "Next at " + hhmm(new Date().getHours() * 60 + new Date().getMinutes() + 60) },
  { id: "demo:t4", source: "attendance", lens: "CLASS_GROUP:9", label: "Attendance S3 A", value: "94%", status: "good", hint: "This week" },
  { id: "demo:t5", source: "taskmentor", lens: "TEACHING", label: "Average quiz score", value: "71%", hint: "Last 4 weeks" },
];

const staffActions: QuickAction[] = [
  { id: "demo:a1", label: "Report a lesson", href: "/reporting", icon: "clipboard", lens: "TEACHING" },
  { id: "demo:a2", label: "Write a lesson note", href: "/lesson-notes", icon: "note", lens: "TEACHING" },
  { id: "demo:a3", label: "Scheme of work", href: "/scheme-of-work", icon: "calendar", lens: "TEACHING" },
  { id: "demo:a4", label: "Take register", href: "/home", icon: "check", lens: "CLASS_GROUP:9" },
];

const learnerItems = (): AttentionItem[] => [
  item({ id: "quiz", source: "taskmentor", tier: "blocking", lens: "SELF", title: "Physics quiz closes tonight",
    why: "Quiz 3 on Newton's laws · 10 questions.", entities: ["Physics"], cta: { label: "Start quiz", href: "/home" }, due_at: inHours(4) }),
  item({ id: "overdue", tier: "slipping", lens: "SELF", count: 2, title: "2 learning activities are overdue",
    why: "From your Chemistry and Mathematics courses.", entities: ["Chemistry", "Mathematics"], cta: { label: "Catch up", href: "/my-learning" } }),
  item({ id: "read", tier: "tidy", lens: "SELF", count: 3, title: "3 new lesson notes to read",
    why: "Shared by your teachers this week.", entities: ["Mathematics", "Physics", "Entrepreneurship"], cta: { label: "Read", href: "/shared-lesson-notes" } }),
];

const learnerTiles = (): GlanceTile[] => [
  { id: "demo:l1", source: "mis", lens: "SELF", label: "Lessons today", value: "4", hint: "Next: Chemistry" },
  { id: "demo:l2", source: "mis", lens: "SELF", label: "Learning progress", value: "62%", status: "good", hint: "3 courses" },
  { id: "demo:l3", source: "attendance", lens: "SELF", label: "Attendance", value: "97%", status: "good", hint: "This term" },
  { id: "demo:l4", source: "taskmentor", lens: "SELF", label: "Quiz average", value: "78%", hint: "Last 5 quizzes" },
];

const learnerActions: QuickAction[] = [
  { id: "demo:s1", label: "My learning", href: "/my-learning", icon: "book", lens: "SELF" },
  { id: "demo:s2", label: "My subjects", href: "/my-enrolled-subjects", icon: "layers", lens: "SELF" },
  { id: "demo:s3", label: "Shared notes", href: "/shared-lesson-notes", icon: "note", lens: "SELF" },
  { id: "demo:s4", label: "Talk to my mentor", href: "/my-mentor", icon: "message", lens: "SELF" },
];

/** The real overview with demo content added (real items are kept). */
export const withDemoOverview = (data: HomeOverview): HomeOverview => {
  const learner = data.viewer.persona === "STUDENT" || data.viewer.persona === "PARENT";
  const lenses = learner
    ? data.lenses.length ? data.lenses : [{ key: "SELF", type: "SELF" as const, label: "Me", reason: "a student", via: [] }]
    : [...data.lenses, ...STAFF_LENSES.filter((l) => !data.lenses.some((d) => d.key === l.key))];
  return {
    ...data,
    period: { ...data.period, week_of_term: data.period.week_of_term ?? 9, weeks_in_term: data.period.weeks_in_term ?? 13 },
    lenses,
    today: { ...data.today, lessons: lessonsAroundNow(learner ? "learning" : "teaching"), activities: [
      { id: 9901, title: learner ? "Football training" : "Staff briefing", start_time: "16:30", end_time: "17:30", color: "#ff8a3d" },
    ] },
    items: [...data.items, ...(learner ? learnerItems() : staffItems())],
    // Real tiles only where the demo has none of the same name and the real one says something.
    tiles: (() => {
      const demo = learner ? learnerTiles() : staffTiles();
      const names = new Set(demo.map((t) => t.label));
      return [...demo, ...data.tiles.filter((t) => !names.has(t.label) && t.value && !["0", "0/0", "—"].includes(t.value))];
    })(),
    quick_actions: learner ? learnerActions : staffActions,
  };
};

/** Every connected app answering, with messages, a meeting and a few updates. */
export const demoAppStates = (data: HomeOverview): AppState[] => {
  const learner = data.viewer.persona === "STUDENT" || data.viewer.persona === "PARENT";
  const apps = data.apps.length
    ? data.apps
    : ([
        { source: "taskmentor", name: "Task Mentor" },
        { source: "attendance", name: "Discipline & Attendance" },
        { source: "tupo", name: "Tupo" },
      ] as HomeOverview["apps"]);
  return apps.map(({ source, name }) => ({
    source,
    name,
    status: "ok" as const,
    summary: {
      version: 1 as const,
      source,
      generated_at: new Date().toISOString(),
      provisioned: true,
      items: [],
      tiles: [],
      today_marks: source === "attendance" && !learner
        ? [{ lesson_key: "demo-0", status: "done" as const, href: null }, { lesson_key: "demo-1", status: "missing" as const, href: null }]
        : [],
      comms: source === "tupo"
        ? { chat_unread: 5, mentions: 2, mail_unread: 3, meetings: [
            { id: "demo:m1", title: learner ? "S3 A class meeting" : "Staff briefing", starts_at: inHours(0.5), live: false, href: null },
          ] }
        : null,
      updates: source === "tupo"
        ? [
            { id: "demo:u1", source, kind: "feed.announcement", title: "Sports day moved to Friday", body: null, severity: "info" as const, created_at: ago(2), read: false, href: null },
            { id: "demo:u2", source, kind: "feed.announcement", title: "Term 3 exam timetable published", body: null, severity: "info" as const, created_at: ago(26), read: true, href: null },
          ]
        : source === "taskmentor"
          ? [{ id: "demo:u3", source, kind: "quiz.published", title: learner ? "New quiz: Newton's Laws" : "Quiz results ready for S4 B", body: null, severity: "success" as const, created_at: ago(5), read: false, href: null }]
          : [],
      app_url: null,
    },
  }));
};
