/** Find-in-note: wraps matches in <mark> elements inside the already-rendered note DOM.
 *
 *  The note body is injected with dangerouslySetInnerHTML and never re-rendered by React
 *  while the reader is open, so mutating it directly is safe — but every mutation must be
 *  undone through clearFindMarks() before the content is replaced or the component unmounts.
 *
 *  A DOM-wrapping approach is used rather than the CSS Custom Highlight API because marks
 *  are also needed as scroll targets (and, in book mode, to work out which page a hit is on),
 *  and because it works in every browser the school's students actually use. */

export const FIND_MARK_CLASS = "note-find-hit";
export const FIND_ACTIVE_CLASS = "note-find-hit-active";

/** Two characters is the point where highlighting stops being noise on a 5,000-word note. */
export const MIN_FIND_LENGTH = 2;

export const clearFindMarks = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll(`mark.${FIND_MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    // Re-join the text nodes we split, so repeated searches don't fragment the DOM.
    parent.normalize();
  });
};

export const applyFindMarks = (root: HTMLElement | null, query: string): HTMLElement[] => {
  clearFindMarks(root);
  if (!root) return [];
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_FIND_LENGTH) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      // KaTeX renders formulas as a tree of spans holding duplicated/annotation text —
      // splitting those text nodes visibly corrupts the rendered maths.
      if (!parent || parent.closest(".katex, script, style")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  const hits: HTMLElement[] = [];
  for (const node of textNodes) {
    const original = node.nodeValue || "";
    const lower = original.toLowerCase();
    let index = lower.indexOf(needle);
    if (index === -1) continue;

    // `current` always holds the still-unsearched tail; `consumed` is how much of the
    // original string that tail starts at, so offsets stay correct across splits.
    let current: Text = node;
    let consumed = 0;
    while (index !== -1) {
      const matchNode = current.splitText(index - consumed);
      const tail = matchNode.splitText(needle.length);
      const mark = document.createElement("mark");
      mark.className = FIND_MARK_CLASS;
      matchNode.parentNode?.replaceChild(mark, matchNode);
      mark.appendChild(matchNode);
      hits.push(mark);

      consumed = index + needle.length;
      current = tail;
      index = lower.indexOf(needle, consumed);
    }
  }
  return hits;
};

export const setActiveFindMark = (hits: HTMLElement[], activeIndex: number) => {
  hits.forEach((hit, i) => hit.classList.toggle(FIND_ACTIVE_CLASS, i === activeIndex));
};
