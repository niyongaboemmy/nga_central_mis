import { describe, it, expect } from "vitest";
import { formatBraces, looksSquashed, prettifyCode, splitGluedComments, tidyCode } from "../format";

const SQUASHED =
  "// Array of car parts in inventoryconst parts = [  { id: 1, name: 'Oil Filter', price: 5000, quantity: 25 },  { id: 2, name: 'Brake Pad', price: 12000, quantity: 15 }];" +
  "// Calculate total value for each partconst partsWithTotal = parts.map(part => ({  ...part,  totalValue: part.price * part.quantity}));" +
  "const lowStock = parts.filter(part => part.quantity < 20);console.log(lowStock);";

describe("splitGluedComments", () => {
  it("puts code glued onto a comment back on its own line", () => {
    expect(splitGluedComments("// Array of car parts in inventoryconst parts = [];")).toBe("// Array of car parts in inventory\nconst parts = [];");
  });
  it("leaves ordinary comments alone", () => {
    for (const ok of ["// connect the outlet to the tank", "// reconstruct the list", "const url = 'http://x.rw'; // let it be", "// return early when empty"]) {
      expect(splitGluedComments(ok)).toBe(ok);
    }
  });
});

describe("looksSquashed", () => {
  it("spots a program on one line and passes normal code", () => {
    expect(looksSquashed(SQUASHED)).toBe(true);
    expect(looksSquashed("for (let i = 0; i < 10; i++) {\n    console.log(i);\n}")).toBe(false);
    expect(looksSquashed("const a = 1;")).toBe(false);
  });
});

describe("formatBraces", () => {
  it("lays out C one statement per line with indented blocks", () => {
    const out = formatBraces('#include <stdio.h>int main(void) {int a = 2;if (a > 1) {printf("big\\n");} else {printf("small;\\n");}return 0;}', "c");
    expect(out).toBe(
      ["#include <stdio.h>", "", "int main(void) {", "    int a = 2;", "    if (a > 1) {", '        printf("big\\n");', "    } else {", '        printf("small;\\n");', "    }", "    return 0;", "}"].join("\n"),
    );
  });
  it("keeps for-loop headers and short object literals on one line", () => {
    expect(formatBraces("for (let i = 0; i < 3; i++) { total += i; }const p = { id: 1, name: 'x' };", "javascript")).toBe(
      ["for (let i = 0; i < 3; i++) {", "    total += i;", "}", "const p = { id: 1, name: 'x' };"].join("\n"),
    );
  });
  it("keeps Java's class and method structure", () => {
    const out = formatBraces('public class Main { public static void main(String[] args) { System.out.println("Hi"); } }', "java");
    expect(out).toBe(["public class Main {", "    public static void main(String[] args) {", '        System.out.println("Hi");', "    }", "}"].join("\n"));
  });
  it("breaks statements inside a callback's block and spaces out members", () => {
    expect(formatBraces("const r = xs.map(p => { const f = p * 2; return f; });console.log(r);", "javascript")).toBe(
      ["const r = xs.map(p => {", "    const f = p * 2;", "    return f;", "});", "console.log(r);"].join("\n"),
    );
    expect(formatBraces("import java.util.*;class A {void a() { x(); }void b() { y(); }}", "java")).toBe(
      ["import java.util.*;", "", "class A {", "    void a() {", "        x();", "    }", "", "    void b() {", "        y();", "    }", "}"].join("\n"),
    );
  });
  it("puts a comment glued after ';' on its own line, keeps a spaced trailing comment", () => {
    expect(formatBraces("a = 1;// Next step\nb = 2; // why", "javascript")).toBe(["a = 1;", "// Next step", "b = 2; // why"].join("\n"));
  });
  it("gives <?php its own line", () => {
    expect(formatBraces('<?php $a = 1;echo $a;', "php")).toBe(["<?php", "", "$a = 1;", "echo $a;"].join("\n"));
  });
});

describe("tidyCode", () => {
  it("repairs the squashed lesson example", () => {
    const out = tidyCode(SQUASHED, "javascript");
    const lines = out.split("\n");
    expect(lines[0]).toBe("// Array of car parts in inventory");
    expect(lines[1]).toMatch(/^const parts = \[/);
    expect(out).toContain("// Calculate total value for each part\n");
    expect(out).toContain("\nconst lowStock = parts.filter(part => part.quantity < 20);\nconsole.log(lowStock);");
  });
  it("does not touch code that is already laid out", () => {
    const code = "function add(a, b) {\n  return a + b;\n}";
    expect(tidyCode(code, "javascript")).toBe(code);
  });
});

describe("prettifyCode", () => {
  it("formats JavaScript with Prettier", async () => {
    const out = await prettifyCode(SQUASHED, "javascript", "babel");
    expect(out).toContain("// Array of car parts in inventory\nconst parts = [\n");
    expect(out).toContain('    { id: 1, name: "Oil Filter", price: 5000, quantity: 25 },');
    expect(out).toContain("const lowStock = parts.filter((part) => part.quantity < 20);\nconsole.log(lowStock);\n");
  });
  it("falls back to the brace layout for a fragment Prettier can't parse", async () => {
    const out = await prettifyCode("part.quantity < 20);", "javascript", "babel");
    expect(out.trim()).toBe("part.quantity < 20);");
  });
});
