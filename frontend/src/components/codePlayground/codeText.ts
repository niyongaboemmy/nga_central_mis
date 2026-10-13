/**
 * The text of a lesson's <pre> block, with its lines. `textContent` alone drops the
 * line breaks AI-written and pasted HTML often uses inside code — <br>, or one <p>/<div>
 * per line — and joins every line into one ("inventoryconst parts = …").
 */
export function codeTextOf(pre: HTMLElement): string {
  const clone = pre.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p, div, li").forEach((block) => {
    if (block.nextSibling || block.parentElement !== clone) block.after("\n");
  });
  return (clone.textContent ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/, "");
}

/** The same repair on HTML, before an editor parses it (see backend sanitizeNoteHtml). */
export const normalizePreLineBreaks = (html: string): string =>
  html.replace(/(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/gi, (_m, open: string, body: string, close: string) => {
    const fixed = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li)>\s*/gi, "\n")
      .replace(/<(p|div|li)\b[^>]*>/gi, "")
      .replace(/\n+(<\/code>\s*)$/i, "$1")
      .replace(/\n+$/, "");
    return open + fixed + close;
  });
