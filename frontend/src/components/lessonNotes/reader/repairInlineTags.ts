/**
 * Lessons generated before the inline-tag fix stored the model's headings, summary and key
 * terms as escaped text, so students saw a literal "<code>let</code>" in the page and in the
 * contents list. This turns those literal pairs back into real elements when the note is
 * shown. Only bare, balanced <code>/<strong>/<em>/<b>/<i> pairs are touched, and never inside
 * code or pre — a note about HTML that shows "<code>" on purpose writes it inside a code block.
 */
const PAIR = /<(code|strong|em|b|i)>([^<>]*?)<\/\1>/g;
const SKIP = new Set(["CODE", "PRE", "TEXTAREA", "SCRIPT", "STYLE", "KBD", "SAMP"]);

export function repairInlineTags(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.includes("</")) return NodeFilter.FILTER_REJECT;
      for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
        if (SKIP.has(el.tagName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets: Text[] = [];
  while (walker.nextNode()) targets.push(walker.currentNode as Text);

  for (const node of targets) {
    const text = node.nodeValue || "";
    PAIR.lastIndex = 0;
    if (!PAIR.test(text)) continue;
    PAIR.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (let m = PAIR.exec(text); m; m = PAIR.exec(text)) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const el = document.createElement(m[1]);
      el.textContent = m[2];
      frag.appendChild(el);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }
}
