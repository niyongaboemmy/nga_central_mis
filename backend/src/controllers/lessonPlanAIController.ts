import { randomUUID } from "crypto";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  SchemeOfWorkEntry,
  SchemeOfWork,
  Subject,
  ClassGroup,
  AcademicTerm,
  AcademicYear,
  UserProfile,
  LO_Lesson,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";
import { createJob, getJob, updateJob } from "../services/aiLessonJobStore";
import { persistLessonPlan } from "../services/lessonPlanPersistence";
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

const lessonPlanSchema: JSONSchema = {
  type: "object",
  properties: {
    session_code: { type: "string" },
    sector: { type: "string" },
    trade: { type: "string" },
    level: { type: "string" },
    module_code: { type: "string" },
    module_name: { type: "string" },
    big_question: { type: "string" },
    total_duration_minutes: { type: "number" },
    outcomes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          duration_minutes: { type: "number" },
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                trainer_activities: { type: "string" },
                learner_activities: { type: "string" },
              },
              required: ["trainer_activities", "learner_activities"],
            },
          },
          resources: {
            type: "array",
            items: {
              type: "object",
              properties: { resource_name: { type: "string" } },
              required: ["resource_name"],
            },
          },
        },
        required: ["code", "title", "description", "duration_minutes"],
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_type: { type: "string" },
          trainer_activities: { type: "string" },
          learner_activities: { type: "string" },
          resources: { type: "string" },
          duration_minutes: { type: "number" },
        },
        required: [
          "section_type",
          "trainer_activities",
          "learner_activities",
          "resources",
          "duration_minutes",
        ],
      },
    },
    indicativeContent: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          content: { type: "string" },
        },
        required: ["category", "content"],
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" } },
        required: ["description"],
      },
    },
    evaluation: {
      type: "object",
      properties: {
        teacher_notes: { type: "string" },
        references: { type: "string" },
      },
      required: ["teacher_notes"],
    },
  },
  required: ["big_question", "outcomes", "sections", "evaluation"],
};

/**
 * Rescales a list's duration_minutes so they sum to EXACTLY totalMinutes,
 * preserving the AI's relative weighting between items. This is a hard
 * numeric guarantee — the prompt asks the AI to get close, but rounding and
 * occasional AI arithmetic slips mean the sums can't be trusted as-is, so we
 * enforce the total deterministically afterward rather than just hoping.
 */
const distributeDurations = <T extends { duration_minutes?: number }>(
  items: T[],
  totalMinutes: number,
): T[] => {
  if (items.length === 0 || totalMinutes <= 0) return items;

  const rawTotal = items.reduce((sum, i) => sum + Math.max(i.duration_minutes || 0, 0), 0);
  let allocated = 0;

  return items.map((item, idx) => {
    if (idx === items.length - 1) {
      // Last item absorbs the rounding remainder so the sum is always exact.
      const remaining = totalMinutes - allocated;
      return { ...item, duration_minutes: Math.max(remaining, 1) };
    }
    const weight = rawTotal > 0 ? (item.duration_minutes || 0) / rawTotal : 1 / items.length;
    const share = Math.max(Math.round(weight * totalMinutes), 1);
    allocated += share;
    return { ...item, duration_minutes: share };
  });
};

const generateLessonPlan = async (context: {
  subjectName: string;
  classGroupName: string;
  termName: string;
  weekNumber: string;
  topic: string;
  subTopic: string;
  objective: string;
  methodology: string;
  resources: string;
  evaluation: string;
  learningPlace: string;
  observation: string;
  instructorName: string;
  totalMinutes: number;
  customPrompt?: string;
}) => {
  const hours = (context.totalMinutes / 60).toFixed(2).replace(/\.00$/, "");

  const { data: parsed } = await generateStructuredContent<any>({
    schemaName: "lesson_plan",
    schema: lessonPlanSchema,
    prompt: `You are ${context.instructorName || "an experienced, subject-matter-expert teacher"},
a professional teacher of "${context.subjectName}" for class "${context.classGroupName}" (${context.termName}).
You are personally preparing a detailed, classroom-ready lesson plan for ${context.weekNumber} of your Scheme of
Work — the way a seasoned teacher plans their own lesson, not a generic template.

This week's plan from your Scheme of Work reads:
- Topic (Indicative Content): ${context.topic}
- Sub-topic: ${context.subTopic || "(none specified)"}
- Learning Outcome / Objective: ${context.objective}
- Methodology / Learning Activities: ${context.methodology}
- Resources: ${context.resources}
- Evaluation / Evidence of Formative Assessment: ${context.evaluation}
- Learning Place: ${context.learningPlace || "(not specified)"}
- Observation notes: ${context.observation || "(none)"}

THE SESSION IS EXACTLY ${context.totalMinutes} MINUTES LONG (${hours} hour${context.totalMinutes === 60 ? "" : "s"}).
This is a hard constraint, not a suggestion — every duration you assign must be planned against this real, fixed
class period, the way a teacher budgeting an actual timetable slot would.

Expand this into a full, professional lesson plan grounded in exactly this week's topic and objective — do not
invent unrelated content. Produce:
- A concise "big question" that frames the lesson's inquiry for trainees.
- One or more learning outcomes (code like "LO1", title, description, duration_minutes), each with trainer/learner
  activities and any specific resources needed. Distribute the full ${context.totalMinutes} minutes across the
  outcomes' duration_minutes fields IN PROPORTION TO HOW SUBSTANTIAL EACH OUTCOME ACTUALLY IS — do not split evenly
  unless the outcomes are genuinely equal in weight. Their duration_minutes must sum to ${context.totalMinutes}.
- Exactly three lesson sections with section_type "Introduction", "Development", and "Conclusion". Their
  duration_minutes must ALSO sum to exactly ${context.totalMinutes}. Follow realistic classroom pacing: Introduction
  and Conclusion are typically short framing/wrap-up moments (roughly 10-15% of the session each), with Development
  taking the large majority of the time for the actual teaching/practice — unless the content genuinely justifies a
  different balance, which you should explain via the activities themselves.
- indicativeContent entries breaking the topic into the specific sub-points a teacher would actually cover.
- Practical assignments/homework grounded in the topic.
- An evaluation with teacher_notes (how you'll assess understanding this lesson) and any references used.

Keep every field specific and classroom-realistic — the way a teacher who actually teaches this subject would
write it, not a vague summary. Get the minute-by-minute budgeting genuinely right; don't just fill in round numbers.${
      context.customPrompt
        ? `\n\nThe teacher also gave these specific instructions for this lesson — follow them carefully,
adjusting the plan above to honor them without ignoring the scheme-of-work content already given:
"${context.customPrompt}"`
        : ""
    }`,
  });

  if (!parsed.outcomes || !Array.isArray(parsed.outcomes) || parsed.outcomes.length === 0) {
    throw new ValidationError(
      "The AI could not generate a lesson plan for this week. Please try again.",
    );
  }

  // Enforce the exact total regardless of how well the AI's own arithmetic landed.
  parsed.outcomes = distributeDurations(parsed.outcomes, context.totalMinutes);
  if (Array.isArray(parsed.sections)) {
    parsed.sections = distributeDurations(parsed.sections, context.totalMinutes);
  }
  parsed.total_duration_minutes = context.totalMinutes;

  return parsed;
};

const processJob = async (
  jobId: string,
  params: {
    userId: number;
    entryId: number;
    lessonId?: number;
    totalMinutes: number;
    // The specific calendar day the teacher generated this plan for — e.g.
    // clicking the 15th inside a scheme week that runs Mon 14th to Fri 18th.
    // Falls back to the entry's own start date only when the caller never
    // sent one, so old clients still work.
    lessonDate?: string;
    // Free-text steer from the teacher (e.g. "focus more on group work",
    // "this class struggles with fractions, add a recap") — optional, added
    // on top of the scheme-of-work-derived prompt rather than replacing it.
    customPrompt?: string;
  },
) => {
  try {
    updateJob(jobId, { status: "loading", message: "Loading week context..." });

    const rows = await db
      .select({
        entry: SchemeOfWorkEntry,
        subjectName: Subject.name,
        classGroupName: ClassGroup.name,
        termName: AcademicTerm.name,
        yearName: AcademicYear.name,
      })
      .from(SchemeOfWorkEntry)
      .innerJoin(SchemeOfWork, eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id))
      .innerJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
      .innerJoin(ClassGroup, eq(SchemeOfWork.class_group_id, ClassGroup.class_group_id))
      .innerJoin(AcademicTerm, eq(SchemeOfWork.academic_term_id, AcademicTerm.academic_term_id))
      .innerJoin(AcademicYear, eq(AcademicTerm.academic_year_id, AcademicYear.academic_year_id))
      .where(eq(SchemeOfWorkEntry.entry_id, params.entryId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError("Scheme of work entry not found");
    }

    const { entry, subjectName, classGroupName, termName, yearName } = rows[0];

    const profile = await db
      .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
      .from(UserProfile)
      .where(eq(UserProfile.user_id, params.userId))
      .limit(1);
    const instructorName = profile[0]
      ? [profile[0].first_name, profile[0].last_name].filter(Boolean).join(" ")
      : "";

    updateJob(jobId, { status: "analyzing", message: "Analyzing this week with AI..." });

    const generated = await generateLessonPlan({
      subjectName: subjectName || "this subject",
      classGroupName: classGroupName || "",
      termName: termName || "",
      weekNumber: entry.week_number || "this week",
      topic: entry.topic || "",
      subTopic: entry.sub_topic || "",
      objective: entry.objective || "",
      methodology: entry.methodology || "",
      resources: entry.resources || "",
      evaluation: entry.evaluation || "",
      learningPlace: entry.learning_place || "",
      observation: entry.observation || "",
      instructorName,
      totalMinutes: params.totalMinutes,
      customPrompt: params.customPrompt,
    });

    updateJob(jobId, { status: "structuring", message: "Structuring lesson plan..." });

    const weekMatch = /(\d+)/.exec(entry.week_number || "");
    const sections = (generated.sections || []).filter((s: any) =>
      ["Introduction", "Development", "Conclusion"].includes(s.section_type),
    );
    const totalDuration = generated.total_duration_minutes || params.totalMinutes;

    const lessonData = {
      session_code: generated.session_code || "",
      sector: generated.sector || "",
      trade: generated.trade || "",
      level: generated.level || "",
      module_code: generated.module_code || "",
      module_name: generated.module_name || subjectName || "",
      week: weekMatch ? parseInt(weekMatch[1], 10) : null,
      term: termName || "",
      school_year: yearName || "",
      class_name: classGroupName || "",
      number_of_trainees: null,
      lesson_date: params.lessonDate || entry.start_date,
      start_time: null,
      end_time: null,
      instructor_name: instructorName,
      big_question: generated.big_question || "",
      total_duration_minutes: totalDuration,
    };

    updateJob(jobId, { status: "saving", message: "Saving lesson plan..." });

    const lessonId = await db.transaction(async (tx) =>
      persistLessonPlan(tx, {
        entryId: params.entryId,
        userId: params.userId,
        lessonId: params.lessonId,
        lessonData,
        outcomes: generated.outcomes || [],
        sections,
        indicativeContent: generated.indicativeContent || [],
        assignments: generated.assignments || [],
        evaluation: generated.evaluation
          ? {
              teacher_notes: generated.evaluation.teacher_notes || "",
              references: generated.evaluation.references || "",
              prepared_by: instructorName,
              verified_by: "",
            }
          : null,
      }),
    );

    await recordActivity(
      params.userId,
      "LESSON_PLAN_AI_GENERATE",
      `AI-generated lesson plan for entry ID ${params.entryId} (${entry.week_number})`,
      "LO_Lesson",
      lessonId,
      { entry_id: params.entryId },
      params.userId,
    );

    updateJob(jobId, {
      status: "done",
      message: "Lesson plan generated successfully!",
      lessonId,
    });
  } catch (err: any) {
    logger.error("AI lesson plan generation failed", { jobId, error: err?.message });
    updateJob(jobId, {
      status: "error",
      message: "Generation failed",
      error: err?.message || "AI lesson plan generation failed",
    });
  }
};

export const startAILessonGeneration = asyncHandler(async (req: any, res: any) => {
  if (!isAnyProviderConfigured()) {
    throw new ValidationError(
      "AI lesson plan generation is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }

  const { entry_id, lesson_id, session_hours, lesson_date, custom_prompt } =
    req.body;
  if (!entry_id) {
    throw new ValidationError("entry_id is required");
  }

  // Regenerating an existing lesson plan is restricted to whoever created
  // it — without this, anyone able to reach this endpoint with an arbitrary
  // lesson_id could overwrite someone else's plan (persistLessonPlan's
  // update path trusts lessonId blindly once it gets this far).
  if (lesson_id) {
    const [existing] = await db
      .select({ user_id: LO_Lesson.user_id })
      .from(LO_Lesson)
      .where(eq(LO_Lesson.id, parseInt(lesson_id, 10)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError("Lesson plan not found");
    }
    if (existing.user_id !== req.user.userId) {
      throw new AuthorizationError(
        "Only the teacher who created this lesson plan can regenerate it",
      );
    }
  }

  const customPrompt =
    typeof custom_prompt === "string" && custom_prompt.trim()
      ? custom_prompt.trim().slice(0, 2000)
      : undefined;
  // Accept only a plain YYYY-MM-DD (or a "...T..." timestamp we trim down to
  // that) — never hand a raw Date-ish value to the AI job, since round-
  // tripping it through Date/toISOString is exactly what shifts it a day.
  const lessonDate =
    typeof lesson_date === "string" && lesson_date
      ? lesson_date.split("T")[0]
      : undefined;

  let totalMinutes = 100; // matches the app's prior implicit default
  if (session_hours !== undefined && session_hours !== null && session_hours !== "") {
    const hours = parseFloat(session_hours);
    if (isNaN(hours) || hours <= 0 || hours > 12) {
      throw new ValidationError("Session hours must be a number between 0 and 12");
    }
    totalMinutes = Math.round(hours * 60);
  }

  const userId = req.user.userId;
  const jobId = randomUUID();
  createJob(jobId, userId);

  successResponse(res, "AI lesson plan generation started", { jobId }, 202);

  processJob(jobId, {
    userId,
    entryId: parseInt(entry_id, 10),
    lessonId: lesson_id ? parseInt(lesson_id, 10) : undefined,
    totalMinutes,
    lessonDate,
    customPrompt,
  });
});

export const getAILessonGenerationStatus = asyncHandler(async (req: any, res: any) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job || job.userId !== req.user.userId) {
    throw new NotFoundError("Generation job not found");
  }

  successResponse(res, "Job status", {
    status: job.status,
    stepIndex: job.stepIndex,
    totalSteps: job.totalSteps,
    message: job.message,
    lessonId: job.lessonId,
    error: job.error,
  });
});
