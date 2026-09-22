import sanitizeHtml from "sanitize-html";

const HEX_COLOR = /^#[0-9a-fA-F]{3,6}$/;
const TEXT_ALIGN = /^(left|center|right|justify)$/;

// Allow-list matches what the Tiptap StarterKit + Image/Table extensions can produce.
// AI output and any client-submitted HTML for a note must go through this before
// it's persisted or rendered — never trust it as pre-sanitized platform content.
export const sanitizeNoteHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "u", "s", "code", "pre", "mark",
      "h1", "h2", "h3", "h4",
      "ul", "ol", "li", "label", "input", "div",
      "blockquote", "hr",
      // colgroup/col: @tiptap/extension-table's own renderHTML emits these to carry
      // per-column resize widths (see createColGroup in its source) — without allowing
      // them here, a teacher's manual column-resize would silently vanish on save.
      "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col",
      "img", "a", "span",
      // E-learning interactive blocks (frontend/src/components/elearning/interactive/nodes.tsx):
      // <details data-type="reveal"><summary>…</summary><div>…</div></details> and
      // <div data-type="inline-check" data-check="{json}">…static fallback…</div>.
      "details", "summary",
    ],
    allowedAttributes: {
      // width/height are the legacy Image-extension output; style carries the resize/
      // float/alignment info tiptap-extension-resize-image writes on the <img> itself
      // (folded from its "containerstyle" attribute below, since that custom attribute
      // means nothing to a plain <img> in the read-only/shared/PDF views).
      img: ["src", "alt", "title", "width", "height", "style"],
      a: ["href", "target", "rel"],
      span: ["style"],
      mark: ["style", "data-color"],
      // colwidth persists Tiptap's column-resize drag; style carries per-cell background
      // shading/padding (see LessonNoteRichEditor's ShadedTableCell/ShadedTableHeader).
      td: ["colspan", "rowspan", "colwidth", "style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      // style carries the table's overall width/min-width, computed from colwidth by the
      // same createColGroup call that produces the colgroup below.
      table: ["style"],
      col: ["style"],
      // Tiptap's TaskList/TaskItem markup: <ul data-type="taskList"><li data-type="taskItem"
      // data-checked="true"><label><input type="checkbox" checked></label><div>...
      ul: ["data-type"],
      li: ["data-type", "data-checked"],
      input: [{ name: "type", values: ["checkbox"] }, "checked", "disabled"],
      p: ["style", "class"],
      details: ["data-type", "class"],
      div: ["data-type", "data-check", "class"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      h4: ["style"],
    },
    allowedStyles: {
      span: {
        color: [HEX_COLOR],
        "background-color": [HEX_COLOR],
      },
      mark: {
        "background-color": [HEX_COLOR],
        color: [/^inherit$/],
      },
      img: {
        width: [/^\d+(\.\d+)?(px|%)$/],
        height: [/^\d+(\.\d+)?(px|%)$/, /^auto$/],
        float: [/^(left|right|none)$/],
        "text-align": [TEXT_ALIGN],
      },
      td: {
        "background-color": [HEX_COLOR],
        // Matches the toolbar's Compact/Normal/Spacious presets ("<rem>rem <rem>rem").
        padding: [/^\d+(\.\d+)?rem \d+(\.\d+)?rem$/],
      },
      th: {
        "background-color": [HEX_COLOR],
        padding: [/^\d+(\.\d+)?rem \d+(\.\d+)?rem$/],
      },
      table: {
        width: [/^\d+(\.\d+)?px$/],
        "min-width": [/^\d+(\.\d+)?px$/],
      },
      col: {
        width: [/^\d+(\.\d+)?px$/],
        "min-width": [/^\d+(\.\d+)?px$/],
      },
      p: { "text-align": [TEXT_ALIGN] },
      h1: { "text-align": [TEXT_ALIGN] },
      h2: { "text-align": [TEXT_ALIGN] },
      h3: { "text-align": [TEXT_ALIGN] },
      h4: { "text-align": [TEXT_ALIGN] },
    },
    allowedSchemes: ["http", "https", "data"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
      // tiptap-extension-resize-image stores resize/alignment as a "containerstyle"
      // attribute on the <img> (read by its own NodeView JS at edit time) rather than
      // a real `style` attribute, so a plain renderer (shared view, PDF export) would
      // silently ignore it. Fold it into `style` so it round-trips everywhere, not just
      // back into the Tiptap editor.
      img: (tagName, attribs) => {
        const merged = [attribs.style, attribs.containerstyle].filter(Boolean).join("; ");
        const { containerstyle, wrapperstyle, ...rest } = attribs;
        return { tagName, attribs: merged ? { ...rest, style: merged } : rest };
      },
    },
  });
