import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffDocsPage from "../StaffDocsPage";
import { MODULES, guidesOf } from "../../../docs";

let userType = "TEACHER";
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { profile: { user_type: userType } } }) }));

const mount = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/docs" element={<StaffDocsPage />} />
        <Route path="/docs/:module" element={<StaffDocsPage />} />
        <Route path="/docs/:module/:guide" element={<StaffDocsPage />} />
        <Route path="/home" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("staff documentation page", () => {
  beforeEach(() => {
    userType = "TEACHER";
    window.scrollTo = vi.fn() as any;
  });

  it("shows one folder per app", () => {
    mount("/docs");
    for (const m of MODULES) expect(document.querySelector(`a[href="/docs/${m.id}"]`), m.id).toBeTruthy();
  });

  it("opens a folder on its overview, with the other guides beside it", () => {
    mount("/docs/tendo");
    const guides = guidesOf("tendo");
    expect(screen.getByRole("heading", { level: 2, name: guides[0].title })).toBeTruthy();
    for (const g of guides) expect(screen.getAllByText(g.title).length).toBeGreaterThan(0);
  });

  it("sends an unknown folder or guide back to a page that exists", () => {
    mount("/docs/nope");
    expect(document.querySelector(`a[href="/docs/${MODULES[0].id}"]`)).toBeTruthy();
  });

  it("searches across every folder", () => {
    mount("/docs");
    const word = guidesOf("tupo")[0].title.split(" ")[0];
    fireEvent.change(screen.getByLabelText("Search the guides"), { target: { value: word } });
    expect(screen.getByLabelText("Search results")).toBeTruthy();
  });

  it.each(["STUDENT", "PARENT", ""])("keeps the guides from a %s account", (type) => {
    userType = type;
    mount("/docs/mis/overview");
    expect(screen.getByText("These guides are for staff")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Guides by app" })).toBeNull();
  });
});
