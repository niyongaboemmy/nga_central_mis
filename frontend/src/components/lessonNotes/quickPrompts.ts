// Curated "Ask AI" starting points for lesson notes, grounded in the instructional-design
// categories that actually recur for teachers editing notes (simplification, examples,
// differentiation, structure, assessment) rather than lesson-planning prompts in general.
export interface QuickPrompt {
  label: string;
  prompt: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  { label: "Simplify language", prompt: "Simplify the language so it's easier for students to understand, without losing the meaning." },
  { label: "Add real-world examples", prompt: "Add 2-3 real-world examples relevant to students in Rwanda to illustrate this." },
  { label: "Make more concise", prompt: "Make this more concise — trim it down to the essentials." },
  { label: "Expand with more detail", prompt: "Expand this with more explanation and detail." },
  { label: "Convert to bullet points", prompt: "Reformat this into clear bullet points." },
  { label: "Add a summary", prompt: "Add a short summary at the end." },
  { label: "Add check-for-understanding questions", prompt: "Add 3-5 short questions students can use to check their own understanding." },
  { label: "Fix grammar & spelling", prompt: "Fix any grammar, spelling, or formatting issues, without changing the meaning." },
  { label: "Simplify for struggling students", prompt: "Rewrite this for students who are struggling, using simpler vocabulary and more scaffolding." },
  { label: "Add a challenge for advanced students", prompt: "Add an extension activity or challenge question for advanced students." },
  { label: "Break into numbered steps", prompt: "Break this down into clear, numbered steps." },
  { label: "Define key vocabulary", prompt: "Highlight and define the key vocabulary terms in this section." },
  { label: "Make more engaging", prompt: "Make this more engaging and relatable for students, using a relevant analogy." },
  { label: "Organize into a table", prompt: "Organize this information into a table for easy comparison." },
];
