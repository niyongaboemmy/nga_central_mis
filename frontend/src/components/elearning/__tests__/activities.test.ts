import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { blanksOf, hydrateActivities, parseActivity, sameAnswer, shuffledOrder } from "../interactive/activities";
import { activityFromText, activityToText } from "../interactive/nodes";

const mount = (activity: unknown) => {
  const root = document.createElement("div");
  root.innerHTML = `<div data-type="activity" data-activity='${JSON.stringify(activity).replace(/'/g, "&#39;")}'><p>fallback</p></div>`;
  document.body.innerHTML = "";
  document.body.appendChild(root);
  return root;
};

describe("Lesson Studio activities", () => {
  it("parses and rejects activity data", () => {
    expect(parseActivity({ kind: "fill_blank", text: "An [[element]] is a part" })?.kind).toBe("fill_blank");
    expect(parseActivity({ kind: "fill_blank", text: "no blanks here" })).toBeNull();
    expect(parseActivity({ kind: "order_steps", steps: ["a", "b"] })).toBeNull();
    expect(parseActivity("not json")).toBeNull();
    expect(blanksOf("A [[ul]] list and an [[ol]] list")).toEqual(["ul", "ol"]);
    expect(sameAnswer(" Padding. ", "padding")).toBe(true);
    expect(sameAnswer("", "x")).toBe(false);
  });

  it("never shuffles steps back into the correct order", () => {
    for (let seed = 1; seed < 50; seed++) {
      const o = shuffledOrder(4, seed);
      expect([...o].sort()).toEqual([0, 1, 2, 3]);
      expect(o).not.toEqual([0, 1, 2, 3]);
    }
  });

  it("fill in the blanks: wrong then right, with polite feedback", async () => {
    const user = userEvent.setup();
    const root = mount({ kind: "fill_blank", text: "The [[padding]] sits inside the border", explanation: "Margin is outside." });
    const onAnswer = vi.fn();
    hydrateActivities(root, onAnswer);
    hydrateActivities(root, onAnswer); // idempotent
    const input = screen.getByRole("textbox", { name: "Blank 1" });
    await user.type(input, "margin");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    await user.clear(input);
    await user.type(input, "Padding");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    expect(root.textContent).toContain("Margin is outside.");
  });

  it("order the steps with up/down buttons (no drag needed on a phone)", async () => {
    const user = userEvent.setup();
    const steps = ["Open the editor", "Write the HTML", "Save the file"];
    const root = mount({ kind: "order_steps", prompt: "Build a page", steps });
    const onAnswer = vi.fn();
    hydrateActivities(root, onAnswer);
    // Bubble the right step to each position using the move buttons.
    for (let target = 0; target < steps.length; target++) {
      for (let guard = 0; guard < 5; guard++) {
        const items = [...root.querySelectorAll("li")].map((li) => li.textContent || "");
        const at = items.findIndex((t) => t.includes(steps[target]));
        if (at === target) break;
        await user.click(screen.getByRole("button", { name: `Move "${steps[target]}" up` }));
      }
    }
    await user.click(screen.getByRole("button", { name: "Check order" }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
  });

  it("match the pairs with accessible selects", async () => {
    const user = userEvent.setup();
    const pairs = [
      { left: "ul", right: "unordered list" },
      { left: "ol", right: "ordered list" },
      { left: "a", right: "link" },
    ];
    const root = mount({ kind: "match_pairs", prompt: "Match", pairs });
    const onAnswer = vi.fn();
    hydrateActivities(root, onAnswer);
    for (const p of pairs) await user.selectOptions(screen.getByRole("combobox", { name: `Meaning of ${p.left}` }), p.right);
    await user.click(screen.getByRole("button", { name: "Check matches" }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
  });

  it("keeps the static fallback for a broken block", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-type="activity" data-activity="{bad"><p>fallback</p></div>';
    hydrateActivities(root);
    expect(root.textContent).toBe("fallback");
  });

  it("round-trips the teacher's text form in the editor", () => {
    const order = parseActivity({ kind: "order_steps", prompt: "P", steps: ["a", "b", "c"] })!;
    expect(activityFromText("order_steps", activityToText(order), "P")).toEqual(order);
    const match = parseActivity({ kind: "match_pairs", prompt: "M", pairs: [{ left: "x", right: "1 = one" }, { left: "y", right: "2" }, { left: "z", right: "3" }] })!;
    expect(activityFromText("match_pairs", activityToText(match), "M")).toEqual(match);
  });
});
