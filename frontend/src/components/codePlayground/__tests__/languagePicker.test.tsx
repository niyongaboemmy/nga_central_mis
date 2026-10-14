import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LanguagePicker from "../LanguagePicker";
import { LANGUAGES, languageById, languageMatches, runsLive } from "../languages";
import { starterProject, WEB_STARTER } from "../project";
import { DEFAULT_BLOCK } from "../playgroundData";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const ids = (q: string) => LANGUAGES.filter((l) => languageMatches(l, q)).map((l) => l.id);

describe("languageMatches", () => {
  it("finds languages by name, short name, alias, file extension and topic", () => {
    expect(ids("py")).toContain("python");
    expect(ids("c#")).toEqual(["csharp"]);
    expect(ids(".rs")).toEqual(["rust"]);
    expect(ids("sqlite")).toEqual(["sql"]);
    expect(ids("database")).toEqual(["sql"]);
    expect(ids("kotlin")).toEqual(["kotlin"]);
    expect(ids("web page")).toContain("html");
    expect(ids("  ")).toHaveLength(LANGUAGES.length);
    expect(ids("cobol")).toEqual([]);
  });
});

describe("runsLive", () => {
  it("runs input-reading runner programs live, and SQL, browser code in one go", () => {
    expect(runsLive(languageById("python")!, true)).toBe(true);
    expect(runsLive(languageById("c")!, true)).toBe(true);
    // SQL's runner reads the script from stdin: live, it would wait for the student forever.
    expect(runsLive(languageById("sql")!, true)).toBe(false);
    expect(runsLive(languageById("javascript")!, true)).toBe(false);
    expect(runsLive(languageById("python")!, false)).toBe(false);
  });
});

describe("HTML, CSS & JavaScript by default", () => {
  it("new playground blocks start as a web page", () => {
    expect(DEFAULT_BLOCK.language).toBe("html");
    expect(DEFAULT_BLOCK.code).toMatch(/<style>[\s\S]*<script>/);
  });
  it("its project is three linked files", () => {
    const p = starterProject(languageById("html")!);
    expect(p).toBe(WEB_STARTER);
    expect(p.files.map((f) => f.path)).toEqual(["index.html", "style.css", "script.js"]);
    expect(p.files[0].content).toMatch(/href="style.css"/);
    expect(p.files[0].content).toMatch(/src="script.js"/);
    expect(starterProject(languageById("python")!).files).toEqual([{ path: "main.py", content: languageById("python")!.starter }]);
  });
});

describe("LanguagePicker", () => {
  const setup = (value = "html") => {
    const onPick = vi.fn();
    render(<LanguagePicker value={languageById(value)!} runnerKeys={new Set(["python", "java", "sql"])} interactive onPick={onPick} />);
    fireEvent.click(screen.getByTestId("playground-language"));
    return { onPick, search: screen.getByTestId("playground-language-search") as HTMLInputElement };
  };

  it("opens with a search box that filters the list", () => {
    const { search } = setup();
    expect(screen.getAllByRole("option").length).toBe(LANGUAGES.length);
    fireEvent.change(search, { target: { value: "jav" } });
    const shown = screen.getAllByRole("option").map((o) => o.getAttribute("data-language"));
    expect(shown).toContain("java");
    expect(shown).toContain("javascript");
    expect(shown).not.toContain("python");
  });

  it("Enter picks the first match; arrows move", () => {
    const { search, onPick } = setup();
    fireEvent.change(search, { target: { value: "sql" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(languageById("sql"));
    expect(screen.queryByTestId("playground-language-search")).toBeNull();

    fireEvent.click(screen.getByTestId("playground-language"));
    const s2 = screen.getByTestId("playground-language-search");
    fireEvent.change(s2, { target: { value: "java" } });
    const options = screen.getAllByRole("option");
    expect(s2.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(s2, { key: "ArrowDown" });
    expect(s2.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(s2, { key: "ArrowUp" });
    fireEvent.keyDown(s2, { key: "ArrowUp" });
    // Wraps around to the last one.
    expect(s2.getAttribute("aria-activedescendant")).toBe(options[options.length - 1].id);
    fireEvent.keyDown(s2, { key: "Enter" });
    expect(onPick).toHaveBeenLastCalledWith(languageById(options[options.length - 1].getAttribute("data-language")!));
  });

  it("says when nothing matches, and Esc clears then closes", () => {
    const { search } = setup();
    fireEvent.change(search, { target: { value: "cobol" } });
    expect(screen.getByTestId("playground-language-empty").textContent).toMatch(/cobol/);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search.value).toBe("");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByTestId("playground-language-search")).toBeNull();
  });

  it("puts the languages used last on top", () => {
    const { search } = setup();
    fireEvent.change(search, { target: { value: "kotlin" } });
    fireEvent.keyDown(search, { key: "Enter" });
    cleanup();
    setup("html");
    const recent = screen.getByRole("group", { name: "Recently used" });
    expect(recent.querySelector('[data-language="kotlin"]')).not.toBeNull();
  });
});
