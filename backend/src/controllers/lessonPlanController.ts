import { Request, Response } from "express";
import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

export const getLessonPlansByEntry = async (req: Request, res: Response) => {
  console.log(
    "CRITICAL_DEBUG: getLessonPlansByEntry for entryId:",
    req.params.entryId,
  );
  try {
    const { entryId } = req.params;

    // Fetch lessons for this entry
    const lessons = await db
      .select()
      .from(LO_Lesson)
      .where(eq(LO_Lesson.entry_id, Number(entryId)));

    // For each lesson, fetch all related details
    const fullyDetailedLessons = await Promise.all(
      lessons.map(async (lesson) => {
        const outcomes = await db
          .select()
          .from(LO_LearningOutcome)
          .where(eq(LO_LearningOutcome.lesson_id, lesson.id));

        const outcomesWithDetails = await Promise.all(
          outcomes.map(async (outcome) => {
            const activities = await db
              .select()
              .from(LO_LearningOutcomeActivity)
              .where(
                eq(LO_LearningOutcomeActivity.learning_outcome_id, outcome.id),
              );

            const resources = await db
              .select()
              .from(LO_LearningOutcomeResource)
              .where(
                eq(LO_LearningOutcomeResource.learning_outcome_id, outcome.id),
              );

            return { ...outcome, activities, resources };
          }),
        );

        const sections = await db
          .select()
          .from(LO_LessonSection)
          .where(eq(LO_LessonSection.lesson_id, lesson.id));

        const indicativeContent = await db
          .select()
          .from(LO_IndicativeContent)
          .where(eq(LO_IndicativeContent.lesson_id, lesson.id));

        const assignments = await db
          .select()
          .from(LO_LessonAssignment)
          .where(eq(LO_LessonAssignment.lesson_id, lesson.id));

        const evaluation = await db
          .select()
          .from(LO_LessonEvaluation)
          .where(eq(LO_LessonEvaluation.lesson_id, lesson.id));

        return {
          ...lesson,
          outcomes: outcomesWithDetails,
          sections,
          indicativeContent,
          assignments,
          evaluation: evaluation[0] || null,
        };
      }),
    );

    console.log(
      `DEBUG: Returning ${fullyDetailedLessons.length} lesson plans for entry ${entryId}`,
    );
    res.json(fullyDetailedLessons);
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

    const result = await db.transaction(async (tx) => {
      let finalLessonId = lesson_id;

      if (lesson_id) {
        // Update Master Record - only update lessonData fields, not user_id
        await tx
          .update(LO_Lesson)
          .set(lessonData)
          .where(eq(LO_Lesson.id, lesson_id));

        // Clear existing related data for a clean re-write (common pattern for complex forms)
        // Note: In production, you might want to do a proper sync/diff to preserve IDs
        await tx
          .delete(LO_LearningOutcome)
          .where(eq(LO_LearningOutcome.lesson_id, lesson_id));
        await tx
          .delete(LO_LessonSection)
          .where(eq(LO_LessonSection.lesson_id, lesson_id));
        await tx
          .delete(LO_IndicativeContent)
          .where(eq(LO_IndicativeContent.lesson_id, lesson_id));
        await tx
          .delete(LO_LessonAssignment)
          .where(eq(LO_LessonAssignment.lesson_id, lesson_id));
        await tx
          .delete(LO_LessonEvaluation)
          .where(eq(LO_LessonEvaluation.lesson_id, lesson_id));
      } else {
        // Create Master Record - ensure user_id is set AFTER spread to override any undefined value
        const insertResult = await tx.insert(LO_Lesson).values({
          entry_id: Number(entry_id),
          user_id: userId,
          ...lessonData,
        });
        finalLessonId = (insertResult[0] as any).insertId;
      }

      // 1. Save Outcomes
      if (outcomes && Array.isArray(outcomes)) {
        for (const outcome of outcomes) {
          const {
            activities,
            resources,
            id: oldOutcomeId,
            ...outcomeData
          } = outcome;
          const outResult = await tx.insert(LO_LearningOutcome).values({
            ...outcomeData,
            lesson_id: finalLessonId,
          });
          const newOutcomeId = (outResult[0] as any).insertId;

          if (activities && Array.isArray(activities)) {
            for (const activity of activities) {
              await tx.insert(LO_LearningOutcomeActivity).values({
                ...activity,
                learning_outcome_id: newOutcomeId,
              });
            }
          }

          if (resources && Array.isArray(resources)) {
            for (const resource of resources) {
              await tx.insert(LO_LearningOutcomeResource).values({
                ...resource,
                learning_outcome_id: newOutcomeId,
              });
            }
          }
        }
      }

      // 2. Save Sections
      if (sections && Array.isArray(sections)) {
        for (const section of sections) {
          await tx.insert(LO_LessonSection).values({
            ...section,
            lesson_id: finalLessonId,
          });
        }
      }

      // 3. Save Indicative Content
      if (indicativeContent && Array.isArray(indicativeContent)) {
        for (const content of indicativeContent) {
          await tx.insert(LO_IndicativeContent).values({
            ...content,
            lesson_id: finalLessonId,
          });
        }
      }

      // 4. Save Assignments
      if (assignments && Array.isArray(assignments)) {
        for (const assignment of assignments) {
          await tx.insert(LO_LessonAssignment).values({
            ...assignment,
            lesson_id: finalLessonId,
          });
        }
      }

      // 5. Save Evaluation
      if (evaluation) {
        await tx.insert(LO_LessonEvaluation).values({
          ...evaluation,
          lesson_id: finalLessonId,
        });
      }

      return finalLessonId;
    });

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
    await db.delete(LO_Lesson).where(eq(LO_Lesson.id, Number(id)));
    res.json({ message: "Lesson plan deleted successfully" });
  } catch (error) {
    logger.error("Error deleting lesson plan:", error);
    res.status(500).json({ message: "Error deleting lesson plan" });
  }
};

export const extractLessonPlan = asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw new ValidationError("No file uploaded");
  }

  const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
  const html = result.value;

  if (
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== "your_openai_api_key_here"
  ) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting pedagogical data from lesson plan documents into a structured relational format.
            Return a valid JSON object matching this structure:
            {
              "session_code": string,
              "sector": string,
              "trade": string,
              "level": string,
              "module_code": string,
              "module_name": string,
              "week": number,
              "term": string,
              "school_year": string,
              "class_name": string,
              "number_of_trainees": number,
              "lesson_date": "YYYY-MM-DD",
              "start_time": "HH:MM",
              "end_time": "HH:MM",
              "instructor_name": string,
              "big_question": string,
              "total_duration_minutes": number,
              "outcomes": [
                {
                  "code": string (LO1, LO2...),
                  "title": string,
                  "description": string,
                  "duration_minutes": number,
                  "activities": [{ "trainer_activities": string, "learner_activities": string }],
                  "resources": [{ "resource_name": string }]
                }
              ],
              "sections": [
                {
                  "section_type": "Introduction" | "Conclusion",
                  "trainer_activities": string,
                  "learner_activities": string,
                  "resources": string,
                  "duration_minutes": number
                }
              ],
              "indicativeContent": [{ "category": string, "content": string }],
              "assignments": [{ "description": string }],
              "evaluation": {
                "teacher_notes": string,
                "references": string,
                "prepared_by": string,
                "verified_by": string
              }
            }
            
            Strictly follow this structure. For activities, split trainer and learner roles.`,
          },
          {
            role: "user",
            content: `Extract lesson plan data from this HTML: \n\n${html}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(
        completion.choices[0].message.content || "{}",
      );
      return successResponse(
        res,
        "Lesson plan extracted successfully (AI powered)",
        extracted,
      );
    } catch (err) {
      console.error("OpenAI Error, falling back to basic extraction:", err);
    }
  }

  // Fallback basic extraction logic (Simplified for new structure)
  const clean = (str: string) =>
    str
      ? str
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

  const extractAfter = (str: string, label: string) => {
    const idx = str.toLowerCase().indexOf(label.toLowerCase());
    if (idx === -1) return "";
    return str.substring(idx + label.length).trim();
  };

  const rows = html.split("<tr>");
  const extracted: any = {
    outcomes: [],
    sections: [],
    indicativeContent: [],
    assignments: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cleanRow = clean(row);
    if (cleanRow.toLowerCase().includes("sector:")) {
      extracted.sector = extractAfter(
        cleanRow.split(/trade:/i)[0],
        "Sector:",
      ).trim();
      extracted.trade = extractAfter(
        cleanRow.split(/level:/i)[0],
        "Trade:",
      ).trim();
      const dateMatch = cleanRow.match(
        /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/,
      );
      if (dateMatch)
        extracted.lesson_date = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
    }
    // Minimal fallback: populate some headers
    if (cleanRow.includes("Learning Outcomes"))
      extracted.big_question = cleanRow;
  }

  successResponse(
    res,
    "Lesson plan extracted successfully (Basic fallback)",
    extracted,
  );
});
