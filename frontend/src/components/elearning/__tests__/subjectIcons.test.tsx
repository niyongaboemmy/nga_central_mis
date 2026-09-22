import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SUBJECT_ICONS, resolveSubjectIcon } from "../ui/subjectIcons";
import SubjectIcon from "../ui/subjectIcons";
import { SubjectCover } from "../ui/primitives";

describe("subject icons", () => {
  it("offers a set of distinct, keyed icons — no emoji anywhere", () => {
    expect(SUBJECT_ICONS.length).toBeGreaterThanOrEqual(10);
    const keys = SUBJECT_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Keys are stored in a VARCHAR(16) column.
    keys.forEach((k) => expect(k.length).toBeLessThanOrEqual(16));
    // Every entry is a real component, not a character.
    SUBJECT_ICONS.forEach((i) => expect(typeof i.Icon).not.toBe("string"));
  });

  it("picks an icon from the subject name when the teacher hasn't chosen one", () => {
    expect(resolveSubjectIcon("Development of Web User Interface").key).toBe("code");
    expect(resolveSubjectIcon("Apply Basic Database Development").key).toBe("database");
    expect(resolveSubjectIcon("Networking fundamentals").key).toBe("network");
    expect(resolveSubjectIcon("Applied Physics I").key).toBe("science");
    expect(resolveSubjectIcon("Maintain Professional Conversation (English)").key).toBe("language");
    expect(resolveSubjectIcon("Graphic User Interface Design").key).toBe("design");
    // Nothing recognisable still yields a usable icon rather than a blank tile.
    expect(resolveSubjectIcon("Zzz Unknown Subject").key).toBe("general");
  });

  it("honours the teacher's choice over the guess, and still renders legacy emoji", () => {
    expect(resolveSubjectIcon("Applied Physics I", "math").key).toBe("math");
    const { container } = render(<SubjectIcon subjectName="Applied Physics I" icon="math" />);
    expect(container.querySelector("svg")).toBeTruthy();
    // A course saved before the icon set existed holds an emoji — show it, don't break.
    render(<SubjectIcon subjectName="Old course" icon="🖥️" />);
    expect(screen.getByText("🖥️")).toBeInTheDocument();
  });

  it("SubjectCover renders an svg tile, not a text glyph", () => {
    const { container } = render(<SubjectCover name="Core CSS Styling" code="CSS1" color="#3b6cff" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toBe("CSS1");
  });
});
