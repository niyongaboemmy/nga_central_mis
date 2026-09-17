import {
  LO_Lesson,
  LO_LearningOutcome,
  LO_LearningOutcomeActivity,
  LO_LearningOutcomeResource,
  LO_LessonSection,
  LO_IndicativeContent,
  LO_LessonAssignment,
  LO_LessonEvaluation,
} from "../db/schema";
import { eq } from "drizzle-orm";

export interface LessonPlanSaveInput {
  entryId: number;
  userId: number;
  lessonId?: number;
  lessonData: Record<string, any>;
  outcomes?: any[];
  sections?: any[];
  indicativeContent?: any[];
  assignments?: any[];
  evaluation?: any;
}

/**
 * Inserts (or fully replaces, on update) a lesson plan and all of its nested
 * child rows. Shared by the manual save endpoint and the AI-generation job so
 * both persist lesson plans identically. Must be called within a db.transaction.
 */
export const persistLessonPlan = async (
  tx: any,
  {
    entryId,
    userId,
    lessonId,
    lessonData,
    outcomes,
    sections,
    indicativeContent,
    assignments,
    evaluation,
  }: LessonPlanSaveInput,
): Promise<number> => {
  let finalLessonId = lessonId;

  if (finalLessonId) {
    await tx
      .update(LO_Lesson)
      .set(lessonData)
      .where(eq(LO_Lesson.id, finalLessonId));

    await tx
      .delete(LO_LearningOutcome)
      .where(eq(LO_LearningOutcome.lesson_id, finalLessonId));
    await tx
      .delete(LO_LessonSection)
      .where(eq(LO_LessonSection.lesson_id, finalLessonId));
    await tx
      .delete(LO_IndicativeContent)
      .where(eq(LO_IndicativeContent.lesson_id, finalLessonId));
    await tx
      .delete(LO_LessonAssignment)
      .where(eq(LO_LessonAssignment.lesson_id, finalLessonId));
    await tx
      .delete(LO_LessonEvaluation)
      .where(eq(LO_LessonEvaluation.lesson_id, finalLessonId));
  } else {
    const insertResult = await tx.insert(LO_Lesson).values({
      entry_id: entryId,
      user_id: userId,
      ...lessonData,
    });
    finalLessonId = (insertResult[0] as any).insertId;
  }

  if (outcomes && Array.isArray(outcomes)) {
    for (const outcome of outcomes) {
      const { activities, resources, id: _oldOutcomeId, ...outcomeData } = outcome;
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

  if (sections && Array.isArray(sections)) {
    for (const section of sections) {
      await tx.insert(LO_LessonSection).values({
        ...section,
        lesson_id: finalLessonId,
      });
    }
  }

  if (indicativeContent && Array.isArray(indicativeContent)) {
    for (const content of indicativeContent) {
      await tx.insert(LO_IndicativeContent).values({
        ...content,
        lesson_id: finalLessonId,
      });
    }
  }

  if (assignments && Array.isArray(assignments)) {
    for (const assignment of assignments) {
      await tx.insert(LO_LessonAssignment).values({
        ...assignment,
        lesson_id: finalLessonId,
      });
    }
  }

  if (evaluation) {
    await tx.insert(LO_LessonEvaluation).values({
      ...evaluation,
      lesson_id: finalLessonId,
    });
  }

  return finalLessonId as number;
};
