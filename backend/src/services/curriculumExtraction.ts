import { GoogleGenAI, Type } from "@google/genai";
import { ValidationError } from "../errors/CustomError";
import { ImportedElement } from "./curriculumImportJobStore";

const MAX_ELEMENTS = 30;
const MAX_CRITERIA_PER_ELEMENT = 30;

const criteriaSchema = {
  type: Type.OBJECT,
  properties: {
    criteria_number: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ["criteria_number", "description"],
};

const elementSchema = {
  type: Type.OBJECT,
  properties: {
    element_number: { type: Type.INTEGER },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    learning_hours: { type: Type.INTEGER },
    indicative_content: { type: Type.STRING },
    criteria: { type: Type.ARRAY, items: criteriaSchema },
  },
  required: ["element_number", "title", "criteria"],
};

/**
 * Extracts Elements of Competency + Performance Criteria (+ hours/indicative content) from raw
 * curriculum document text via Gemini. Shared by the standalone "Import from Curriculum" flow
 * (curriculumImportAIController.ts) and the Scheme of Work AI-generation flow (schemeAIController.ts)
 * so both callers agree on one extraction implementation instead of drifting apart.
 */
export const generateCurriculumWithGemini = async (
  curriculumText: string,
  subjectName: string,
): Promise<ImportedElement[]> => {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await genAI.models.generateContent({
    model,
    contents: `You are a curriculum specialist at a national TVET board (in the style of RTB — Rwanda TVET Board),
digitizing an official competency-based curriculum document for the subject/module "${subjectName}" into a
structured curriculum management system. You have deep familiarity with how these curricula are organized and know
exactly where to find each piece of information, even when page breaks, running headers/footers, or PDF-to-text
extraction artifacts have scrambled the layout.

Official TVET curriculum documents like this one are consistently structured as follows — use this knowledge to
locate the right information even if headings are slightly reworded or the text around them is noisy:

1. An early section titled something like "Elements of Competency and Performance Criteria" containing a two-column
   summary table: the left column lists numbered "Elements of competency" (e.g. "1. Describe graphic design
   basics", "2. Draw digital sketch", "3. Design User Interface" — these become numbered rows like 1, 2, 3), and the
   right column lists each element's numbered "Performance criteria" (e.g. "1.1 Core concepts and elements of
   Graphic Design are properly described", "1.2 ...", "2.1 ...").
2. A later "Course content" section that repeats the SAME elements as "Learning outcome N: <title>" — matched to
   the element by its number and title — each with a "Learning hours: NN" figure and a bulleted "Indicative
   content" list (often with nested sub-bullets marked with a checkmark or dash) describing exactly what is taught
   under that learning outcome/element. This is the richest source of detail and hours.
3. Sometimes a "Resources required" block follows each learning outcome's indicative content — this is NOT part of
   the indicative content and should be excluded from it.

Your task: extract EVERY element of competency and its performance criteria from the document below, and enrich
each element with its learning hours and indicative content by cross-referencing the "Course content" / "Learning
outcome" section that corresponds to it (same element/outcome number and matching title — titles may be worded
very slightly differently between the summary table and the course-content section; treat them as the same
element when the numbers align and the topics clearly match).

For each element of competency, produce:
- element_number: its number exactly as numbered in the summary table (1, 2, 3, ...)
- title: the element's title, cleaned up (proper capitalization, no trailing punctuation, no page-footer noise)
- description: a short one-sentence description of what a learner does/achieves for this element, written in your
  own words if the document doesn't state one explicitly (e.g. summarize the element's intent)
- learning_hours: the number of hours from the matching "Learning outcome" section's "Learning hours: NN" line, or
  null if genuinely not stated anywhere for this element
- indicative_content: the matching learning outcome's full indicative content, reformatted as clean, concise bullet
  lines separated by newlines (one topic per line, no bullet characters/checkmarks needed — plain text lines), with
  page-footer junk (e.g. "N | Page", "Employable Skills for Sustainable Job Creation") and "Resources required"
  material stripped out. If no indicative content can be matched for this element, use an empty string.
- criteria: every performance criteria listed for this element in the summary table, each with:
  - criteria_number: exactly as given (e.g. "1.1", "2.3") — if the document doesn't number them, number them
    yourself as "<element_number>.<position>"
  - description: the performance criteria text, cleaned up (proper capitalization/punctuation, no footer noise)

Number elements sequentially starting at 1 in the order they appear. Do not invent elements or criteria that aren't
genuinely present in the document, but DO use your subject-matter judgement to clean up OCR/extraction noise,
reassemble text split across page breaks, and de-duplicate anything that clearly repeats (e.g. a table appearing
twice). If the document does not follow this exact TVET format (e.g. it's a different kind of curriculum entirely),
still do your best to extract a reasonable elements/criteria structure from whatever competency and assessment
criteria information it does contain.

DOCUMENT CONTENT (extracted automatically from an uploaded PDF/DOCX — may contain extraction noise; use your
judgement to see past it):
"""
${curriculumText}
"""`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          elements: { type: Type.ARRAY, items: elementSchema },
        },
        required: ["elements"],
      },
    },
  });

  const text = response.text || "{}";
  const parsed = JSON.parse(text);
  const rawElements: any[] = Array.isArray(parsed.elements) ? parsed.elements : [];

  if (rawElements.length === 0) {
    throw new ValidationError(
      "The AI could not identify any elements of competency in this document. Please try a different file.",
    );
  }

  const elements: ImportedElement[] = rawElements
    .filter((el) => el?.title && Array.isArray(el.criteria) && el.criteria.length > 0)
    .sort((a, b) => (a.element_number || 0) - (b.element_number || 0))
    .slice(0, MAX_ELEMENTS)
    .map((el, idx) => ({
      element_number: el.element_number || idx + 1,
      title: String(el.title).trim(),
      description: el.description ? String(el.description).trim() : "",
      learning_hours:
        Number.isInteger(el.learning_hours) && el.learning_hours > 0
          ? el.learning_hours
          : null,
      indicative_content: el.indicative_content
        ? String(el.indicative_content).trim()
        : "",
      criteria: el.criteria
        .filter((c: any) => c?.description)
        .slice(0, MAX_CRITERIA_PER_ELEMENT)
        .map((c: any, cIdx: number) => ({
          criteria_number: c.criteria_number
            ? String(c.criteria_number).trim()
            : `${el.element_number || idx + 1}.${cIdx + 1}`,
          description: String(c.description).trim(),
        })),
    }));

  if (elements.length === 0) {
    throw new ValidationError(
      "The AI extracted elements but none had usable performance criteria. Please try a different file.",
    );
  }

  return elements;
};
