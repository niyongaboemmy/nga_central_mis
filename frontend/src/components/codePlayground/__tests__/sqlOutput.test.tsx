import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SqlOutput, { parseSqlOutput, toCsv } from "../SqlOutput";

afterEach(cleanup);

// What tm-judge's sql/sqlite kind prints (sqlite3 -bail -header -box).
const BOX = [
  "┌────────────┬───────┐",
  "│    name    │ price │",
  "├────────────┼───────┤",
  "│ Brake pad  │ 12000 │",
  "│ Oil filter │ 5000  │",
  "└────────────┴───────┘",
].join("\n");

describe("parseSqlOutput", () => {
  it("turns each result set into a table and keeps other output as text", () => {
    const parts = parseSqlOutput(`Parts:\n${BOX}\n${BOX.replace(/Brake pad /, "Clutch    ")}\ndone\n`);
    expect(parts.map((p) => p.kind)).toEqual(["text", "table", "table", "text"]);
    expect(parts[1]).toEqual({ kind: "table", columns: ["name", "price"], rows: [["Brake pad", "12000"], ["Oil filter", "5000"]] });
    expect(parts[0]).toEqual({ kind: "text", text: "Parts:" });
    expect(parts[3]).toEqual({ kind: "text", text: "done" });
  });
  it("leaves output that only looks like a table (cut off) as it was printed", () => {
    const cut = BOX.split("\n").slice(0, 4).join("\n");
    expect(parseSqlOutput(cut)).toEqual([{ kind: "text", text: cut }]);
    expect(parseSqlOutput("plain")).toEqual([{ kind: "text", text: "plain" }]);
  });
  it("copies as CSV with quoting", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\n"x,y","say ""hi"""');
  });
});

describe("SqlOutput", () => {
  it("renders a real table with a row count and numbers aligned right", () => {
    render(<SqlOutput text={BOX} />);
    expect(screen.getByTestId("playground-sql-table").textContent).toMatch(/Result 1\s*· 2 rows/);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["name", "price"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("12000").className).toMatch(/text-right/);
    expect(screen.getByText("Brake pad").className).toMatch(/text-left/);
  });
});
