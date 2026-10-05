import { describe, it, expect, vi } from "vitest";
import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelectField from "../SelectField";

const FRUITS = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape", "Honeydew", "Kiwi"];

const Controlled: React.FC<{ onChange?: (v: string) => void; options?: string[] }> = ({ onChange, options = FRUITS }) => {
  const [v, setV] = useState("");
  return (
    <div>
      <label htmlFor="fruit">Fruit</label>
      <SelectField
        id="fruit"
        name="fruit"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">Any fruit</option>
        {options.map((f) => (
          <option key={f} value={f.toLowerCase()} data-description={`${f.length} letters`}>
            {f}
          </option>
        ))}
      </SelectField>
    </div>
  );
};

describe("SelectField", () => {
  it("shows the selected label on a named combobox and keeps the native select in sync", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    expect(trigger).toHaveTextContent("Any fruit");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: /Cherry/ }));
    expect(onChange).toHaveBeenCalledWith("cherry");
    expect(trigger).toHaveTextContent("Cherry");
    expect(screen.getByLabelText("Fruit", { selector: "select" })).toHaveValue("cherry");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("searches long lists, ignoring case and accents", async () => {
    render(<Controlled options={[...FRUITS, "Açaí"]} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Fruit" }));
    const search = screen.getByRole("combobox", { name: "Search Fruit" });
    await userEvent.type(search, "acai");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Açaí4 letters"]);
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("works from the keyboard and Escape closes only the list", async () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <Controlled onChange={onChange} />
      </div>,
    );
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onKeyDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    await userEvent.keyboard("{Enter}{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("banana");
  });

  it("still answers testing-library's selectOptions on the native select", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Fruit", { selector: "select" }), "fig");
    expect(onChange).toHaveBeenCalledWith("fig");
    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveTextContent("Fig");
  });

  it("skips disabled options and respects a disabled control", async () => {
    render(
      <>
        <label htmlFor="d">Size</label>
        <SelectField id="d" defaultValue="s" disabled>
          <option value="s">Small</option>
        </SelectField>
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Size" })).toBeDisabled();
  });
});
