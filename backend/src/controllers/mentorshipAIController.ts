import { GoogleGenAI, Type } from "@google/genai";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  MentorshipSession,
  MenteeCheckIn,
  AssessmentScore,
  UserProfile,
  Subject,
  MentorAssignment,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import logger from "../utils/logger";

// Same convention as lessonPlanAIController.ts/schemeAIController.ts — Gemini
// via @google/genai, guarded by the same "is it actually configured" check.
const isGeminiConfigured = () =>
  !!process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";

const insightsSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A 2-4 sentence narrative overview of this mentee's trajectory this period.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific, evidence-based positives observed across sessions/grades.",
    },
    concerns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific, evidence-based concerns or recurring challenges, if any.",
    },
    recommended_focus: {
      type: Type.STRING,
      description: "One concrete, actionable recommendation for the mentor's next session.",
    },
  },
  required: ["summary", "strengths", "concerns", "recommended_focus"],
};

// This is a small, single, bounded prompt over already-fetched rows (unlike
// the multi-step lesson-plan generator) — a synchronous request/response is
// enough here; no job-queue/polling infrastructure is warranted.
export const generateMenteeAIInsights = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const studentId = parseInt(req.params.studentId, 10);
  if (!studentId || isNaN(studentId)) throw new ValidationError("Invalid student ID");

  if (!isGeminiConfigured()) {
    throw new ValidationError(
      "AI insights are not available right now — the AI provider is not configured.",
    );
  }

  // Ownership guard: only this student's actual assigned mentor may request
  // insights about them (same MentorAssignment check used elsewhere).
  const [assignment] = await db
    .select({ assignment_id: MentorAssignment.assignment_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.mentor_id, mentorId),
        eq(MentorAssignment.student_id, studentId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!assignment) {
    throw new NotFoundError("Student not found in your assigned mentees");
  }

  const [student] = await db
    .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, studentId))
    .limit(1);

  const sessions = await db
    .select({
      session_date: MentorshipSession.session_date,
      topic: MentorshipSession.topic,
      wellbeing_status: MentorshipSession.wellbeing_status,
      wellbeing_notes: MentorshipSession.wellbeing_notes,
      assignment_completion: MentorshipSession.assignment_completion,
      punctuality_attendance: MentorshipSession.punctuality_attendance,
      discipline_progress: MentorshipSession.discipline_progress,
      challenges_identified: MentorshipSession.challenges_identified,
      guidance_notes: MentorshipSession.guidance_notes,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag: MentorshipSession.stress_flag,
    })
    .from(MentorshipSession)
    .where(and(eq(MentorshipSession.user_id, mentorId), eq(MentorshipSession.student_id, studentId)))
    .orderBy(sql`${MentorshipSession.session_date} DESC`)
    .limit(8);

  if (sessions.length === 0) {
    throw new ValidationError(
      "No mentorship sessions logged yet for this mentee — insights need at least one session to work from.",
    );
  }

  const scores = await db
    .select({
      subject_name: Subject.name,
      score: AssessmentScore.score,
      max_score: AssessmentScore.max_score,
    })
    .from(AssessmentScore)
    .leftJoin(Subject, eq(AssessmentScore.subject_id, Subject.subject_id))
    .where(eq(AssessmentScore.student_id, studentId))
    .orderBy(sql`${AssessmentScore.assessed_at} DESC`)
    .limit(5);

  const checkins = await db
    .select({ category: MenteeCheckIn.category, message: MenteeCheckIn.message })
    .from(MenteeCheckIn)
    .where(and(eq(MenteeCheckIn.mentor_id, mentorId), eq(MenteeCheckIn.student_id, studentId)))
    .orderBy(sql`${MenteeCheckIn.submitted_at} DESC`)
    .limit(5);

  const studentName = `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || "this student";

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const sessionLines = sessions
    .map(
      (s) =>
        `- ${s.session_date}: topic="${s.topic ?? "—"}", wellbeing=${s.wellbeing_status ?? "—"}, ` +
        `assignment=${s.assignment_completion ?? "—"}, punctuality=${s.punctuality_attendance ?? "—"}, ` +
        `discipline_trend=${s.discipline_progress ?? "—"}, integrity_flag=${Boolean(s.dishonesty_flagged)}, ` +
        `stress_flag=${Boolean(s.stress_flag)}` +
        (s.challenges_identified ? `, challenges="${s.challenges_identified}"` : "") +
        (s.wellbeing_notes ? `, wellbeing_notes="${s.wellbeing_notes}"` : ""),
    )
    .join("\n");

  const scoreLines = scores.length
    ? scores.map((s) => `- ${s.subject_name ?? "Subject"}: ${s.score}/${s.max_score}`).join("\n")
    : "(no recent grades on file)";

  const checkinLines = checkins.length
    ? checkins.map((c) => `- [${c.category}] "${c.message}"`).join("\n")
    : "(no self-submitted check-ins from the mentee)";

  let response;
  try {
    response = await genAI.models.generateContent({
      model,
      contents: `You are an experienced academic mentor's assistant, helping analyze a mentee's recent mentorship
record to prepare for their next session. The mentee is ${studentName}.

Recent mentorship sessions (most recent first):
${sessionLines}

Recent grades:
${scoreLines}

Recent self-submitted check-ins from the mentee:
${checkinLines}

Based strictly on this record, produce a concise, evidence-grounded analysis for the mentor. Do not invent facts
not supported by the record above. If there is genuinely nothing concerning, say so plainly rather than manufacturing
a concern.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: insightsSchema,
      },
    });
  } catch (err: any) {
    logger.error("Mentorship AI insights generation failed", { error: err?.message, studentId, mentorId });
    throw new ValidationError("Failed to generate AI insights. Please try again.");
  }

  const parsed = JSON.parse(response.text || "{}");
  if (!parsed.summary) {
    throw new ValidationError("The AI could not generate insights for this mentee. Please try again.");
  }

  return successResponse(res, "AI insights generated", {
    student_id: studentId,
    generated_at: new Date().toISOString(),
    summary: parsed.summary,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    recommended_focus: parsed.recommended_focus ?? null,
    based_on_sessions: sessions.length,
  });
});
