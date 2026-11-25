import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Design rule: every button is a pill (`rounded-full`). Card-like buttons (option
 * cards, tiles, drop zones) use the card radius (`rounded-2xl` / `rounded-3xl`).
 * Square-ish radii (`rounded`, `-sm`, `-md`, `-lg`, `-xl`) on a <button> fail here.
 * Directional radii (rounded-l-lg…) stay allowed for segmented controls.
 */
const SRC = join(__dirname, "..", "..");
const BANNED = /(^|[\s"'`{(:])(rounded(?:-(?:none|sm|md|lg|xl))?)(?=$|[\s"'`})])/;

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(node_modules|__tests__|vendor)$/.test(f)) files(p, out);
    } else if (f.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** End of a JSX opening tag, aware of {expressions}, strings and nested template literals. */
function tagEnd(s: string, i: number): number {
  const st: string[] = ["jsx"];
  for (let j = i + 7; j < s.length; j++) {
    const c = s[j];
    const top = st[st.length - 1];
    if (top === '"' || top === "'") {
      if (c === "\\") j++;
      else if (c === top) st.pop();
      continue;
    }
    if (top === "`") {
      if (c === "\\") j++;
      else if (c === "`") st.pop();
      else if (c === "$" && s[j + 1] === "{") {
        st.push("{");
        j++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") st.push(c);
    else if (c === "{") st.push("{");
    else if (c === "}" && top === "{") st.pop();
    else if (c === ">" && top === "jsx") return j;
  }
  return -1;
}

describe("button shape", () => {
  it("keeps every <button> rounded-full (or a card radius for tiles)", () => {
    const offenders: string[] = [];
    for (const f of files(SRC)) {
      const s = readFileSync(f, "utf8");
      const re = /<button\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const end = tagEnd(s, m.index);
        if (end < 0) continue;
        const tag = s.slice(m.index, end + 1);
        const hit = tag.match(BANNED);
        if (hit) {
          const line = s.slice(0, m.index).split("\n").length;
          offenders.push(`${relative(SRC, f)}:${line} uses "${hit[2]}"`);
        }
        re.lastIndex = end + 1;
      }
    }
    expect(offenders, `Use rounded-full on buttons:\n${offenders.join("\n")}`).toEqual([]);
  });
});
