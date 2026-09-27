import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../../contexts/ToastContext";
import MyCoursesPage from "../MyCoursesPage";

const myBuiltCoursesMock = vi.fn();
const mySchemesMock = vi.fn();

vi.mock("../../../../api/elearning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../api/elearning")>();
  return {
    ...actual,
    elearningApi: {
      myBuiltCourses: (...a: any[]) => myBuiltCoursesMock(...a),
      mySchemes: (...a: any[]) => mySchemesMock(...a),
      createFromScheme: vi.fn(),
    },
  };
});

vi.mock("../../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 7, selectedTermId: 3 }),
}));

const course = (over: Partial<any> = {}) => ({
  course_id: 1,
  scheme_id: 11,
  subject_id: 100,
  class_group_id: 200,
  academic_term_id: 3,
  owner_user_id: 1,
  title: "Development of Web User Interface",
  description: null,
  cover_color: null,
  icon: null,
  status: "DRAFT",
  require_sequential_progress: 0,
  auto_publish_from_scheme: 1,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  subject_name: "Development of Web User Interface",
  subject_code: "SPEWI302",
  subject_color: "#e2a03f",
  class_group_name: "L3. Class A",
  term_name: "Term 1",
  section_count: 15,
  published_sections: 2,
  ...over,
});

const schemeRow = (over: Partial<any> = {}) => ({
  subject_id: 100,
  subject_name: "Development of Web User Interface",
  subject_code: "SPEWI302",
  subject_color: "#e2a03f",
  class_group_id: 200,
  class_group_name: "L3. Class A",
  academic_year_id: 7,
  scheme_id: 11,
  validation_status: "PENDING",
  scheme_term_id: 3,
  term_name: "Term 1",
  entries: 15,
  course_id: null,
  course_status: null,
  stage: "scheme",
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <MyCoursesPage />
      </ToastProvider>
    </MemoryRouter>,
  );

describe("MyCoursesPage — finding the schemes a course can be built on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    myBuiltCoursesMock.mockResolvedValue({ data: { data: [] } });
    mySchemesMock.mockResolvedValue({ data: { data: [] } });
  });

  it("asks the API for the selected term, not just the year", async () => {
    renderPage();
    // Omitting the term made the API report every subject as having no scheme of work.
    await waitFor(() => expect(mySchemesMock).toHaveBeenCalledWith(7, 3));
  });

  it("offers a scheme still awaiting validation as ready to set up", async () => {
    mySchemesMock.mockResolvedValue({ data: { data: [schemeRow()] } });
    renderPage();

    expect(await screen.findByText("Development of Web User Interface")).toBeInTheDocument();
    expect(screen.getByText(/scheme pending/i)).toBeInTheDocument();
    const setUp = screen.getByRole("button", { name: /set up/i });
    expect(setUp).toBeEnabled();
    expect(screen.queryByRole("link", { name: /Create the scheme/i })).not.toBeInTheDocument();
  });

  it("never offers 'Create the scheme' for a subject whose course is already listed", async () => {
    myBuiltCoursesMock.mockResolvedValue({ data: { data: [course()] } });
    // The scheme endpoint disagreeing (e.g. a term mismatch) must not produce a contradiction.
    mySchemesMock.mockResolvedValue({
      data: { data: [schemeRow({ stage: "nothing", scheme_id: null, entries: 0 })] },
    });

    renderPage();
    await waitFor(() => expect(myBuiltCoursesMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Create the scheme/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Your other subjects this term")).not.toBeInTheDocument();
  });

  it("still lists a genuinely bare subject with a way to write its scheme", async () => {
    mySchemesMock.mockResolvedValue({
      data: {
        data: [
          schemeRow({
            subject_id: 101,
            subject_name: "Graphic User Interface Design",
            stage: "nothing",
            scheme_id: null,
            entries: 0,
          }),
        ],
      },
    });

    renderPage();
    expect(await screen.findByText("Graphic User Interface Design")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create the scheme/i })).toBeInTheDocument();
  });
});
