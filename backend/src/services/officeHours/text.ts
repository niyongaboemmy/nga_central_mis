/** "TEACHER_ABSENT" -> "Teacher absent". */
export const humanizeCode = (code: string | null | undefined) => {
  const s = String(code ?? "").toLowerCase().replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};
