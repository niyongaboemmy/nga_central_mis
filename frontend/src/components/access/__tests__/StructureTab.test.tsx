import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { StructureTab, roleLabel } from "../StructureTab";
import type { GrantRow, Nodes } from "../../../api/access";

const nodes: Nodes = {
  programs: [
    { id: 1, name: "Coding Academy" },
    { id: 2, name: "IGCSE" },
  ],
  grades: [
    { id: 10, name: "Year 1", program_id: 1, level_order: 1 },
    { id: 11, name: "Year 2", program_id: 1, level_order: 2 },
    { id: 20, name: "Grade 9", program_id: 2, level_order: 1 },
  ],
  classGroups: [
    { id: 100, name: "L3. Class A", grade_id: 10 },
    { id: 101, name: "L4. Class A", grade_id: 11 },
    { id: 200, name: "G9 East", grade_id: 20 },
  ],
  departments: [],
  subjects: [],
};

let seq = 1;
const grant = (over: Partial<GrantRow>): GrantRow =>
  ({
    grant_id: seq++,
    user_id: 1,
    full_name: "Someone",
    username: "someone",
    role_id: 1,
    role_name: "CLASS_TEACHER",
    scope_type: "CLASS_GROUP",
    scope_id: null,
    scope_id2: null,
    academic_year_id: null,
    valid_from: null,
    valid_until: null,
    title: null,
    justification: null,
    source: "RULE",
    status: "ACTIVE",
    last_certified_at: null,
    preset_key: null,
    ...over,
  }) as GrantRow;

const positions: GrantRow[] = [
  grant({ user_id: 5, full_name: "Assadou Assadou", role_name: "PROGRAM_MANAGER", scope_type: "PROGRAM", scope_id: 1 }),
  grant({ user_id: 6, full_name: "Tuyishimire Eric", scope_id: 101 }),
  grant({ user_id: 7, full_name: "Ndazivunnye Felix", scope_id: 101 }),
  grant({ user_id: 8, full_name: "Niyitegeka Faustin", scope_id: 100 }),
  grant({ user_id: 9, full_name: "Niyongabo Emmanuel", role_name: "SUPER_ADMIN", scope_type: "PLATFORM" }),
];

describe("Structure tab", () => {
  it("leads with coverage: key posts, programme leads, class teachers, people", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    expect(screen.getByText("Key school posts filled").nextElementSibling).toHaveTextContent("0/3");
    expect(screen.getByText("Programmes with a lead").nextElementSibling).toHaveTextContent("1/2");
    expect(screen.getByText("Classes with a class teacher").nextElementSibling).toHaveTextContent("2/3");
    expect(screen.getByText("1 with more than one")).toBeInTheDocument();
    expect(screen.getByText("People holding positions").nextElementSibling).toHaveTextContent("5");
  });

  it("opens and closes a programme, and expands everything at once", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    const coding = screen.getByRole("button", { name: /Coding Academy/ });
    expect(coding).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(coding);
    expect(coding).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("L4. Class A")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("button", { name: /IGCSE/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("finds a person and shows only where they hold positions", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    fireEvent.change(screen.getByLabelText("Find a person, programme or class"), { target: { value: "faustin" } });
    expect(screen.getByText("L3. Class A")).toBeInTheDocument();
    expect(screen.queryByText("L4. Class A")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /IGCSE/ })).not.toBeInTheDocument();
  });

  it("clicking a person filters to them", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    fireEvent.click(screen.getByRole("button", { name: /Coding Academy/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Ndazivunnye Felix/ })[0]);
    expect(screen.getByLabelText("Find a person, programme or class")).toHaveValue("Ndazivunnye Felix");
    expect(screen.queryByText("L3. Class A")).not.toBeInTheDocument();
  });

  it("shows only vacancies, and only classes with several class teachers", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    fireEvent.click(screen.getByRole("button", { name: /^Vacancies/ }));
    expect(screen.getByText("G9 East")).toBeInTheDocument();
    expect(screen.queryByText("L3. Class A")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Several class teachers/ }));
    const tile = screen.getByText("L4. Class A").closest("li")!;
    expect(within(tile).getByText("2 class teachers")).toBeInTheDocument();
    expect(screen.queryByText("G9 East")).not.toBeInTheDocument();
  });

  it("offers Assign on vacancies only to those who may assign", () => {
    const onAssign = vi.fn();
    const { rerender } = render(<StructureTab positions={positions} nodes={nodes} />);
    expect(screen.queryByRole("button", { name: /Assign/ })).not.toBeInTheDocument();
    rerender(<StructureTab positions={positions} nodes={nodes} onAssign={onAssign} />);
    fireEvent.click(screen.getByRole("button", { name: "Assign a programme lead for IGCSE" }));
    expect(onAssign).toHaveBeenCalled();
  });

  it("says so when nothing matches, with a way back", () => {
    render(<StructureTab positions={positions} nodes={nodes} />);
    fireEvent.change(screen.getByLabelText("Find a person, programme or class"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(screen.getByRole("button", { name: /IGCSE/ })).toBeInTheDocument();
  });

  it("reads role codes as words", () => {
    expect(roleLabel("CLASS_TEACHER")).toBe("Class teacher");
    expect(roleLabel("Director of Studies")).toBe("Director of Studies");
  });
});
