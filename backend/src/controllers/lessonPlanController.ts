import { Request, Response } from "express";
import { loadLessonPlansForEntries, loadReadableSchemeForEntry } from "../services/curriculumChain/lessonPlans";
import { db } from "../db";
import {
  LO_Lesson,
  LO_LearningOutcome,
  LO_LearningOutcomeActivity,
  LO_LearningOutcomeResource,
  LO_LessonSection,
  LO_IndicativeContent,
  LO_LessonAssignment,
  LO_LessonEvaluation,
  SchemeOfWorkEntry,
  User,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import logger from "../utils/logger";
import mammoth = require("mammoth");
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError } from "../errors/CustomError";
import { persistLessonPlan } from "../services/lessonPlanPersistence";
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

// gpt-4o is the strongest of the configured models at extracting structure from messy,
// inconsistently-formatted uploaded DOCX lesson plans — prefer it first when available,
// but still fall through to the rest of AI_PROVIDER_ORDER rather than requiring OpenAI.
const EXTRACTION_PROVIDER_ORDER = ["openai", "gemini", "groq", "deepseek", "glm"];

const extractionSchema: JSONSchema = {
  type: "object",
  properties: {
    session_code: { type: "string" },
    sector: { type: "string" },
    trade: { type: "string" },
    level: { type: "string" },
    module_code: { type: "string" },
    module_name: { type: "string" },
    week: { type: "number" },
    term: { type: "string" },
    school_year: { type: "string" },
    class_name: { type: "string" },
    number_of_trainees: { type: "number" },
    lesson_date: { type: "string", description: "YYYY-MM-DD" },
    start_time: { type: "string", description: "HH:MM" },
    end_time: { type: "string", description: "HH:MM" },
    instructor_name: { type: "string" },
    big_question: { type: "string" },
    total_duration_minutes: { type: "number" },
    outcomes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string", description: "LO1, LO2, ..." },
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
          section_type: { type: "string", description: "Introduction, Conclusion, or Development" },
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
        prepared_by: { type: "string" },
        verified_by: { type: "string" },
      },
      required: ["teacher_notes", "references", "prepared_by", "verified_by"],
    },
  },
  required: [
    "session_code",
    "sector",
    "trade",
    "level",
    "module_code",
    "module_name",
    "week",
    "term",
    "school_year",
    "class_name",
    "number_of_trainees",
    "lesson_date",
    "start_time",
    "end_time",
    "instructor_name",
    "big_question",
    "total_duration_minutes",
    "outcomes",
    "sections",
    "indicativeContent",
    "assignments",
    "evaluation",
  ],
};

/**
 * `GET /lesson-plans/entry/:entryId`. Only people who may read the entry's scheme of work
 * (owner, co-teacher of the same class, scheme validators) get its plans; anyone else gets
 * 404 so entry ids can't be probed. Loaded in a fixed number of queries.
 */
export const getLessonPlansByEntry = async (req: Request, res: Response) => {
  try {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ message: "Invalid entry id" });
    }
    const user = (req as any).user;
    const scheme = await loadReadableSchemeForEntry(entryId, user.userId, user.permissions ?? []);
    if (!scheme) return res.status(404).json({ message: "Scheme of work entry not found" });
    const byEntry = await loadLessonPlansForEntries([entryId]);
    res.json(byEntry.get(entryId) ?? []);
  } catch (error) {
    logger.error("Error fetching lesson plans:", error);
    res.status(500).json({ message: "Error fetching lesson plans" });
  }
};

export const createOrUpdateLessonPlan = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId; // Changed from user_id to userId
    console.log("DEBUG: userId from auth:", userId);
    const {
      id: lesson_id,
      entry_id,
      outcomes,
      sections,
      indicativeContent,
      assignments,
      evaluation,
      user_id: _user_id, // Exclude from lessonData
      created_at: _created_at, // Exclude from lessonData
      ...lessonData
    } = req.body;

    // Normalize lesson_date to string format if it's a Date object
    if (lessonData.lesson_date) {
      if (
        typeof lessonData.lesson_date === "object" &&
        lessonData.lesson_date.toISOString
      ) {
        lessonData.lesson_date = lessonData.lesson_date
          .toISOString()
          .split("T")[0];
      } else if (
        typeof lessonData.lesson_date === "string" &&
        lessonData.lesson_date.includes("T")
      ) {
        lessonData.lesson_date = lessonData.lesson_date.split("T")[0];
      }
    }

    console.log("DEBUG: lessonData keys:", Object.keys(lessonData));

    if (!entry_id) {
      return res.status(400).json({ message: "Entry ID is required" });
    }

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // A plan may only be attached to an entry of a scheme the caller can read (owner or
    // co-teacher); before this, any signed-in user could add plans to any entry id.
    const readable = await loadReadableSchemeForEntry(Number(entry_id), userId, (req as any).user?.permissions ?? []);
    if (!readable) {
      return res.status(404).json({ message: "Scheme of work entry not found" });
    }

    // Editing an existing lesson plan is restricted to whoever created it —
    // persistLessonPlan's update path otherwise trusts lesson_id blindly and
    // will happily overwrite any row it's given, regardless of caller.
    if (lesson_id) {
      const [existing] = await db
        .select({ user_id: LO_Lesson.user_id })
        .from(LO_Lesson)
        .where(eq(LO_Lesson.id, Number(lesson_id)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Lesson plan not found" });
      }
      if (existing.user_id !== userId) {
        return res.status(403).json({
          message: "Only the teacher who created this lesson plan can edit it",
        });
      }
    }

    const result = await db.transaction(async (tx) =>
      persistLessonPlan(tx, {
        entryId: Number(entry_id),
        userId,
        lessonId: lesson_id,
        lessonData,
        outcomes,
        sections,
        indicativeContent,
        assignments,
        evaluation,
      }),
    );

    res.json({
      message: lesson_id
        ? "Lesson plan updated successfully"
        : "Lesson plan created successfully",
      lessonId: result,
    });
  } catch (error) {
    logger.error("Error saving structured lesson plan:", error);
    res.status(500).json({ message: "Error saving lesson plan" });
  }
};

export const deleteLessonPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    const [existing] = await db
      .select({ user_id: LO_Lesson.user_id })
      .from(LO_Lesson)
      .where(eq(LO_Lesson.id, Number(id)))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ message: "Lesson plan not found" });
    }
    if (existing.user_id !== userId) {
      return res.status(403).json({
        message: "Only the teacher who created this lesson plan can delete it",
      });
    }

    await db.delete(LO_Lesson).where(eq(LO_Lesson.id, Number(id)));
    res.json({ message: "Lesson plan deleted successfully" });
  } catch (error) {
    logger.error("Error deleting lesson plan:", error);
    res.status(500).json({ message: "Error deleting lesson plan" });
  }
};

import * as cheerio from "cheerio";

export const extractLessonPlan = asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw new ValidationError("No file uploaded");
  }

  const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
  const html = result.value;

  if (isAnyProviderConfigured()) {
    try {
      const { data: extracted } = await generateStructuredContent<any>(
        {
          schemaName: "lesson_plan_extraction",
          schema: extractionSchema,
          prompt: `You are an expert at extracting pedagogical data from lesson plan documents into a structured
relational format. For activities, split trainer and learner roles. Extract lesson plan data from this HTML:

${html}`,
        },
        { providerOrder: EXTRACTION_PROVIDER_ORDER },
      );
      return successResponse(
        res,
        "Lesson plan extracted successfully (AI powered)",
        extracted,
      );
    } catch (err) {
      logger.warn("AI lesson plan extraction failed, falling back to deterministic extraction", {
        error: (err as Error).message,
      });
    }
  }

  // Fallback deterministic extraction logic using Cheerio
  const $ = cheerio.load(html);

  const cleanText = (text: string) => text.trim().replace(/\s+/g, " ");

  const extracted: any = {
    outcomes: [],
    sections: [],
    indicativeContent: [],
    assignments: [],
    evaluation: {
      teacher_notes: "",
      references: "",
      prepared_by: "",
      verified_by: "",
    },
  };

  /**
   * Get clean text from a cheerio element, converting <br> and </p> to newlines.
   */
  const getInnerText = (el: any): string => {
    let h = $(el).html() || "";
    h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    return cheerio.load(h).text().trim();
  };

  // ── Inline header scan ─────────────────────────────────────────────────────
  // The top header rows contain "Sector: ICT  Trade: SPEs  Level: 3  Date: …"
  // all packed into merged cells. We scan every cell for "Label: Value" tokens.
  const inlineFind = (label: string): string => {
    let found = "";
    $("th, td").each((_i, el) => {
      if (found) return;
      const text = getInnerText(el);
      // Escape label for regex, but allow '&' literal (mammoth decodes HTML entities)
      const escaped = label
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/&amp;/gi, "&");
      // Value may be on same line OR next line (when label/<p> and value/<p> are separate)
      const re = new RegExp(
        escaped + "[^:\\n]*[:\\uff1a]\\s*([^\\n]*)(?:\\n([^\\n]+))?",
        "i",
      );
      const m = text.match(re);
      if (m) {
        const sameLine = (m[1] || "").trim();
        const nextLine = (m[2] || "").trim();
        found = cleanText(sameLine || nextLine);
      }
    });
    return found;
  };

  extracted.sector = inlineFind("Sector") || inlineFind("Department");
  extracted.trade = inlineFind("Trade");
  extracted.level = inlineFind("Level");
  extracted.term = inlineFind("Term");
  extracted.school_year = inlineFind("School year")
    .replace(/Term.*/i, "")
    .trim();
  extracted.class_name = inlineFind("Class(es)") || inlineFind("Class");
  extracted.instructor_name =
    inlineFind("Instructor name") || inlineFind("Instructor");
  extracted.module_name = inlineFind("Module (Code") || inlineFind("Module");

  // Language focus, facilitation, specific knowledge — each lives in a single merged cell
  extracted.language_focus = inlineFind("Language focus");
  extracted.facilitation_techniques = inlineFind("Facilitation technique");
  extracted.specific_subject_knowledge = inlineFind(
    "Specific subject knowledge",
  );

  const weekStr = inlineFind("Week");
  if (weekStr) {
    const wm = weekStr.match(/\d+/);
    if (wm) extracted.week = parseInt(wm[0]);
  }

  const traineesStr = inlineFind("No. Trainees") || inlineFind("Trainees");
  if (traineesStr) {
    const tm = traineesStr.match(/\d+/);
    if (tm) extracted.number_of_trainees = parseInt(tm[0]);
  }

  const dateStr = inlineFind("Date");
  if (dateStr) {
    const dm = dateStr.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (dm)
      extracted.lesson_date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }

  const timeStr = inlineFind("Time");
  if (timeStr) {
    const tm = timeStr.match(/(\d{1,2}:\d{2})\s*[-\u2013]\s*(\d{1,2}:\d{2})/);
    if (tm) {
      extracted.start_time = tm[1];
      extracted.end_time = tm[2];
    }
  }

  // ── Row-by-row extraction ──────────────────────────────────────────────────
  // For each table row, identifies the label in the first <th/td> and the value
  // from the remaining cells. This prevents one field bleeding into another.
  $("tr").each((_i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    if (tds.length === 0) return;

    const labelCell = getInnerText(tds[0]).toLowerCase().trim();
    const valueAll = tds
      .slice(1)
      .map((td) => getInnerText(td))
      .join("\n")
      .trim();
    const allCellsText = tds.map((td) => getInnerText(td)).join(" ");

    // ── Learning Outcomes ─────────────────────────────────────────────────
    if (
      labelCell === "learning outcomes" ||
      labelCell.startsWith("learning outcome")
    ) {
      // Value cell contains "At the end of the lesson…\nOutcome1\nOutcome2…"
      const lines = valueAll
        .replace(/^at the end of the lesson[^\n]*\n?/i, "")
        .split("\n")
        .map((l) => cleanText(l))
        .filter((l) => l.length > 5);
      lines.forEach((line) => {
        extracted.outcomes.push({
          code: `LO${extracted.outcomes.length + 1}`,
          title: line,
          description: line,
          duration_minutes: 0,
          activities: [],
          resources: [],
        });
      });
    }

    // ── Indicative Content ────────────────────────────────────────────────
    else if (labelCell === "indicative content") {
      valueAll
        .split("\n")
        .map((l) => cleanText(l))
        .filter((l) => l.length > 3)
        .forEach((l) =>
          extracted.indicativeContent.push({ category: "General", content: l }),
        );
    }

    // ── Big Question / Topic ──────────────────────────────────────────────
    else if (
      allCellsText.toLowerCase().includes("topic of the session") ||
      allCellsText.toLowerCase().includes("big question")
    ) {
      const stripped = allCellsText
        .replace(/topic of the session[^:]*:/i, "")
        .replace(/big question[^:]*:/i, "")
        .trim();
      if (stripped) extracted.big_question = cleanText(stripped);
    }

    // ── Range / Total duration ────────────────────────────────────────────
    else if (labelCell.startsWith("range")) {
      const minMatch = valueAll.match(/(\d+)\s*minutes?/i);
      if (minMatch) extracted.total_duration_minutes = parseInt(minMatch[1]);
    }

    // ── Objectives / Learning Intentions ─────────────────────────────────
    else if (
      labelCell.includes("objectives") ||
      labelCell.includes("learning intentions")
    ) {
      extracted.session_objectives = cleanText(
        allCellsText
          .replace(/objectives\/learning intentions[^:]*:/i, "")
          .trim(),
      );
    }

    // ── Language Focus ────────────────────────────────────────────────────
    else if (labelCell.includes("language focus")) {
      extracted.language_focus =
        extracted.language_focus || cleanText(valueAll);
    }

    // ── Facilitation Techniques ───────────────────────────────────────────
    else if (labelCell.includes("facilitation technique")) {
      extracted.facilitation_techniques =
        extracted.facilitation_techniques || cleanText(valueAll);
    }

    // ── Specific Subject Knowledge ────────────────────────────────────────
    else if (labelCell.includes("specific subject knowledge")) {
      extracted.specific_subject_knowledge =
        extracted.specific_subject_knowledge || cleanText(valueAll);
    }

    // ── Assignment / Homework ─────────────────────────────────────────────
    else if (
      labelCell.includes("assignment") ||
      labelCell.includes("homework")
    ) {
      extracted.assignments.push({ description: cleanText(allCellsText) });
    }

    // ── Evaluation / Teacher Notes ────────────────────────────────────────
    else if (
      labelCell.includes("evaluation of the session") ||
      labelCell.includes("teacher")
    ) {
      extracted.evaluation.teacher_notes = cleanText(allCellsText);
    }

    // ── References ────────────────────────────────────────────────────────
    else if (labelCell.startsWith("reference")) {
      extracted.evaluation.references = cleanText(valueAll);
    }
  });

  // ── Prepared by / Verified by (appear as standalone <p> tags) ─────────────
  $("p").each((_i, p) => {
    const t = getInnerText(p);
    const prepM = t.match(/prepared\s+(?:and\s+signed\s+)?by[:\s]+(.+)/i);
    if (prepM) extracted.evaluation.prepared_by = cleanText(prepM[1]);
    const veriM = t.match(/verified\s+by[:\s]+(.+)/i);
    if (veriM) extracted.evaluation.verified_by = cleanText(veriM[1]);
  });

  // ── Sections: Introduction / Development / Conclusion ─────────────────────
  let activeSection: any = null;
  $("tr").each((_i, tr) => {
    const tds = $(tr).find("th, td").toArray();
    if (tds.length === 0) return;
    const rowText = tds
      .map((td) => getInnerText(td))
      .join(" ")
      .toLowerCase();

    // Skip evaluation text rows so they don't get misidentified as learner activities simply because they say "Did trainees understand..."
    if (rowText.includes("evaluation of the session")) return;

    // Check if row marks a section transition
    let newSectionType: string | null = null;
    const firstCellText = getInnerText(tds[0]).toLowerCase();

    if (
      firstCellText === "introduction" ||
      firstCellText.startsWith("introduction ")
    )
      newSectionType = "Introduction";
    else if (
      firstCellText === "development/body" ||
      firstCellText === "development" ||
      firstCellText.startsWith("development ")
    )
      newSectionType = "Development";
    else if (
      firstCellText === "conclusion" ||
      firstCellText.startsWith("conclusion/plenary")
    )
      newSectionType = "Conclusion";

    if (
      newSectionType &&
      (!activeSection || activeSection.section_type !== newSectionType)
    ) {
      activeSection = {
        section_type: newSectionType,
        trainer_activities: "",
        learner_activities: "",
        resources: "",
        duration_minutes: 0,
      };
      extracted.sections.push(activeSection);
      // If this row is ONLY the header (small text), skip parsing activities from it to avoid junk.
      if (
        rowText.length < 50 &&
        !rowText.includes("trainer") &&
        !rowText.includes("trainee")
      )
        return;
    }

    if (!activeSection) return;

    const cell0Text = getInnerText(tds[0]);
    const c0Lower = cell0Text.toLowerCase();

    // Has Trainer activities?
    if (c0Lower.includes("trainer")) {
      const m = cell0Text.match(
        /trainer.*?activities[:\s]*([\s\S]+?)(?=(?:learner|trainee).*?activities|$)/i,
      );
      let content = m ? cleanText(m[1]) : cleanText(cell0Text);
      // Remove any leading "LO1: ... LO2: ..."
      content = content.replace(/^(?:LO\d+.*?\n)+/gi, "").trim();
      if (content && !content.match(/^trainer.*?activities$/i)) {
        activeSection.trainer_activities +=
          (activeSection.trainer_activities ? "\n" : "") + content;
      }
    }

    // Has Learner/Trainee activities?
    if (c0Lower.includes("trainee") || c0Lower.includes("learner")) {
      const m = cell0Text.match(
        /(?:learner|trainee).*?activities[:\s]*([\s\S]+)/i,
      );
      let content = m ? cleanText(m[1]) : "";
      if (!m && !c0Lower.includes("trainer")) {
        content = cleanText(cell0Text).replace(
          /^(?:learner|trainee).*?activities[:\s]*/i,
          "",
        );
      }
      if (content) {
        activeSection.learner_activities +=
          (activeSection.learner_activities ? "\n" : "") + content;
      }
    }

    // Has Resources?
    if (tds.length >= 2) {
      const resText = getInnerText(
        tds.length >= 3 ? tds[tds.length - 2] : tds[1],
      );
      if (
        resText &&
        !resText.toLowerCase().includes("minutes") &&
        !resText.match(/^\d+$/)
      ) {
        activeSection.resources +=
          (activeSection.resources ? " " : "") + cleanText(resText);
      }
    }

    // Has Duration? (Aggregate all "X minutes" matches)
    const allMins = [...rowText.matchAll(/(\d+)\s*min(?:utes?)?/gi)];
    let sumMins = 0;
    allMins.forEach((m) => (sumMins += parseInt(m[1] || "0")));
    if (sumMins > 0) {
      activeSection.duration_minutes += sumMins;
    }
  });

  successResponse(
    res,
    "Lesson plan extracted successfully (Deterministic parser)",
    extracted,
  );
});
