/**
 * Every user-facing string of the e-learning module lives here (UX plan §5) so
 * Kinyarwanda / French can be added without touching components. Voice: a good teacher —
 * warm, short, specific, second person.
 */
const timeOfDay = (d = new Date()) => {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
};

export const copy = {
  home: {
    title: "My Learning",
    /** The greeting has to agree with the page under it: saying a week "is waiting" while
     *  every ring reads 100% made the home screen argue with itself. `pending` is how many
     *  required things are actually left across every subject. */
    greeting: (
      firstName: string | undefined,
      courseTitle?: string | null,
      weekTitle?: string | null,
      pending = 1,
      overdue = 0,
    ) => {
      const name = firstName ? `, ${firstName}` : "";
      if (overdue > 0) {
        return `${timeOfDay()}${name}. ${overdue} thing${overdue === 1 ? " is" : "s are"} past due — best to clear ${overdue === 1 ? "it" : "them"} first.`;
      }
      if (pending === 0)
        return `${timeOfDay()}${name}. Everything your teachers have set is done.`;
      if (courseTitle && weekTitle)
        return `${timeOfDay()}${name}. ${weekTitle} of ${courseTitle} is waiting.`;
      if (courseTitle)
        return `${timeOfDay()}${name}. ${courseTitle} is ready when you are.`;
      return `${timeOfDay()}${name}.`;
    },
    upNext: "Up next",
    continueBtn: "Continue",
    startBtn: "Start",
    thisWeek: "This week",
    dueSoon: "Due soon",
    /** One ranked list replaced the separate This week / Due soon / Keep going cards. */
    queue: "What's next",
    nothingDue: "Nothing due. Nice.",
    subjects: "Your subjects",
    keepGoing: "Keep going",
    nearGoal: (remaining: number, section: string) =>
      `${remaining} more to finish ${section}`,
    library: "All notes",
    emptyTitle: "Nothing here yet",
    emptyBody:
      "Your teachers haven't published a course yet. Check back on Monday.",
    allCaughtUp: "You're all caught up for now.",
    // Caught-up hero
    caughtUpEyebrow: "Caught up",
    caughtUpTitle: "Nothing left to do right now",
    caughtUpBody: (weeks: number) =>
      weeks > 0
        ? `You've finished every week your teachers have opened. ${weeks} more ${weeks === 1 ? "week is" : "weeks are"} still to come.`
        : "You've finished every week your teachers have opened.",
    reviewBtn: "Review what you've learnt",
    browseBtn: "Browse the course",
    resumeLabel: "Pick up where you left off",
    // Stat strip
    statOverall: "Overall",
    statThisWeek: "Done this week",
    statWeeks: "Weeks finished",
    statSkills: "Skills covered",
    streakLabel: (weeks: number) => `${weeks}-week streak`,
    streakHint: "Weeks in a row you've studied — only you can see this.",
    // Notifying strip
    needsYou: "Needs you",
    overdueOne: (n: number) => `${n} overdue`,
    dueSoonCount: (n: number) => `${n} due soon`,
    newWeek: (n: number) => `${n} new ${n === 1 ? "week" : "weeks"} open`,
    allClear: "Nothing needs you right now",
  },
  course: {
    index: "Course index",
    thisWeekPill: "This week",
    locked: "Locked",
    lockedBody: (reason: string | null) =>
      reason || "Finish the items before this one first.",
    emptyStudent: "Your teacher hasn't published anything for this week yet.",
    emptyCourse:
      "Your teacher hasn't published anything yet. Check back Monday.",
    prev: "Previous",
    next: "Next",
    markDone: "Mark as done",
    done: "Done",
    doneWithNext: (title: string, minutes?: number | null) =>
      `Done. Next: ${title}${minutes ? ` (${minutes} min)` : ""}.`,
    doneLast: "Done. That was the last item here.",
    weekComplete: (week: string, criteria: string[]) =>
      criteria.length
        ? `${week} done — you covered ${criteria.join(", ")}.`
        : `${week} done.`,
    nextWeek: "Next week",
    backHome: "Back home",
    awaitingResult: "Awaiting your result",
    openIn: (where: string) => `Open in ${where}`,
    download: "Download",
    continueFromHere: "Continue from here",
    minutes: (m: number) => `${m} min`,
    criteriaCovered: (n: number, total: number, element: string) =>
      `You have covered ${n} of ${total} criteria of ${element}`,
    // --- lesson reader ---
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    readingTime: (m: number) => `${m} min read`,
    teachesLabel: "What this teaches you",
    endOfLesson: "End of this step",
    upNextLabel: "Up next",
    lastInWeek: "That was the last step of this week",
    weekDoneCta: "See the week",
    linkOpensElsewhere: (host: string) => `This opens ${host} in a new tab.`,
    linkAfterOpening: "Come back here and mark it done when you've read it.",
    backToWeek: "Back to the week",
    scrollHint: "Scroll to read",
    // --- focus mode ---
    focusEnter: "Focus mode",
    focusExit: "Leave focus mode",
    focusHint: "Press Esc to leave focus mode",
    focusOf: (n: number, total: number) => `${n} of ${total} in this week`,
    askAI: "Ask the AI tutor",
    readerSettings: "Reading settings",
  },
  check: {
    title: "Quick check",
    submit: "Check answer",
    tryAgain: "Try again",
    nextQuestion: "Next question",
    correct: "Yes — that's it.",
    correctWhy: (why: string) => `Yes — ${why}`,
    wrong: "Not quite — try again.",
    wrongHint: (hint: string) => `Not quite — ${hint} Try again.`,
    finished: (score: number, total: number) =>
      score === total
        ? `All ${total} right. That's a real skill now.`
        : `${score} of ${total} right. Have another go at the ones you missed.`,
    retake: "Do it again",
  },
  builder: {
    title: "Course builder",
    setUp: "Set up course",
    setUpBody:
      "Weeks come from your scheme of work, pre-filled with the notes and materials you already have.",
    // The course gate and the week gate are different scopes; the words have to say so,
    // or a teacher switches a week on and wonders why students still see nothing.
    publishCourse: "Publish the whole course",
    unpublishCourse: "Move course back to draft",
    published: "Published",
    draft: "Draft",
    hidden: "Hidden",
    scheduled: (date: string) => `Scheduled ${date}`,
    addItem: "Add",
    emptyWeek: (week: string, when?: string | null) =>
      when
        ? `${week} goes live ${when} and is still empty. Add a note or skip it.`
        : `${week} is still empty. Add a note or skip it.`,
    previewAsStudent: "Preview as student",
    exitPreview: "Exit preview",
    insights: "Insights",
    content: "Content",
    settings: "Settings",
    noteDraftHint: "Students can't open this note until it's published.",
    // A lesson note's alignment is stored on the note (LessonNoteCriteria), and the course
    // item API refuses to set it — so the brief's criteria are read-only for a note.
    criteriaLockedOnNote:
      "A lesson note carries its own performance criteria, so they can't be ticked here — set them on the note and they'll show up in this list.",
    publishNote: "Publish note",
    reseed: "Pull in new notes & materials",
    nudge: "Nudge",
    nudged: (n: number) =>
      `Sent a friendly nudge to ${n} student${n === 1 ? "" : "s"}.`,
    completionRules: {
      NONE: "Nothing to complete",
      VIEW: "Opens it",
      MARK_DONE: "Marks it done",
      SUBMIT: "Submits a result",
      MIN_SCORE: "Scores at least",
    } as Record<string, string>,
    itemTypes: {
      LESSON_NOTE: "Lesson note",
      SUBJECT_DOCUMENT: "Material",
      PAGE: "Page",
      VIDEO: "Video",
      LINK: "Link",
      HEADER: "Heading",
      KNOWLEDGE_CHECK: "Quick check",
      TASKMENTOR_QUIZ: "Task Mentor quiz",
      TASKMENTOR_ASSIGNMENT: "Task Mentor assignment",
      DISCUSSION: "Discussion",
      FILE: "File",
      FLASHCARDS: "Flashcards",
      EXIT_TICKET: "Exit ticket",
      PRACTICAL_TASK: "Practical task",
    } as Record<string, string>,
  },
  me: {
    title: "Me",
    mastery: "My mastery",
    masteryBody: "What you've covered and shown, per subject.",
    prefs: "Preferences",
    celebrations: "Celebrate when I finish a week",
    streak: "Show my weekly streak",
    reducedMotion: "Reduce motion",
    covered: "Covered",
    demonstrated: "Shown",
    notCovered: "Not yet",
    shown: (n: number, total: number, element: string) =>
      `You've shown ${n} of ${total} criteria in ${element}`,
  },
  errors: {
    save: "That didn't save. We'll retry — or tap to try now.",
    offline: "You're offline. Saved notes still open; progress syncs later.",
    generic: "Something went wrong. Try again in a moment.",
  },
  nudgeTemplate: (student: string, week: string, teacher: string) =>
    `Hi ${student} — ${week} has new content ready when you are. — ${teacher}`,
};

export type Copy = typeof copy;
