import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SubjectElearningLink from "../SubjectElearningLink";

const myBuiltCourses = vi.fn();
const myCourses = vi.fn();

vi.mock("../../../api/elearning", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../api/elearning")>();
  return {
    ...actual,
    elearningApi: {
      myBuiltCourses: () => myBuiltCourses(),
      myCourses: () => myCourses(),
    },
  };
});

let permissions: string[] = [];
vi.mock("../../../hooks/usePermissions", () => ({
  default: () => ({ hasPermission: (p: string) => permissions.includes(p) }),
}));

const builder = (over: Partial<any> = {}) => ({
  course_id: 7,
  subject_id: 10,
  class_group_name: "L3. Class A",
  ...over,
});

/** Renders the link and a stub for wherever it navigates, so we can assert the route. */
const renderLink = (subjectId = 10) =>
  render(
    <MemoryRouter initialEntries={["/subjects/10"]}>
      <Routes>
        <Route
          path="/subjects/:id"
          element={<SubjectElearningLink subjectId={subjectId} />}
        />
        <Route
          path="/elearning/courses/:courseId/build"
          element={<p>builder for course</p>}
        />
        <Route path="/elearning/courses" element={<p>course list</p>} />
        <Route
          path="/my-learning/courses/:courseId"
          element={<p>learner course</p>}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("SubjectElearningLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = [];
    myBuiltCourses.mockResolvedValue({ data: { data: [] } });
    myCourses.mockResolvedValue({ data: { data: [] } });
  });

  it("takes a teacher to the course builder for that subject", async () => {
    permissions = ["MANAGE_COURSE_CONTENT"];
    myBuiltCourses.mockResolvedValue({ data: { data: [builder()] } });
    renderLink();

    await userEvent.click(
      await screen.findByRole("button", { name: /Open e-learning/i }),
    );
    expect(screen.getByText("builder for course")).toBeInTheDocument();
  });

  it("takes a student to their own course, not the builder", async () => {
    permissions = ["VIEW_MY_COURSES"];
    myCourses.mockResolvedValue({
      data: {
        data: [
          { course_id: 7, subject_id: 10, class_group_name: "L3. Class A" },
        ],
      },
    });
    renderLink();

    await userEvent.click(
      await screen.findByRole("button", { name: /Go to my learning/i }),
    );
    expect(screen.getByText("learner course")).toBeInTheDocument();
    // A student must never be sent through the teacher's list.
    expect(myBuiltCourses).not.toHaveBeenCalled();
  });

  it("ignores courses belonging to other subjects", async () => {
    permissions = ["MANAGE_COURSE_CONTENT"];
    myBuiltCourses.mockResolvedValue({
      data: { data: [builder({ course_id: 99, subject_id: 11 })] },
    });
    renderLink();

    // No course for subject 10 — a teacher is offered the way to make one.
    expect(
      await screen.findByRole("button", { name: /Build a course/i }),
    ).toBeInTheDocument();
  });

  it("asks which class when one subject has two courses", async () => {
    permissions = ["MANAGE_COURSE_CONTENT"];
    myBuiltCourses.mockResolvedValue({
      data: {
        data: [
          builder({ course_id: 7, class_group_name: "L3. Class A" }),
          builder({ course_id: 8, class_group_name: "L3. Class B" }),
        ],
      },
    });
    renderLink();

    await userEvent.click(
      await screen.findByRole("button", { name: /Open e-learning/i }),
    );
    // It asks rather than guessing which class group was meant.
    expect(
      screen.getByRole("menuitem", { name: "L3. Class A" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "L3. Class B" }),
    );
    expect(screen.getByText("builder for course")).toBeInTheDocument();
  });

  it("offers a student nothing when they have no course for the subject", async () => {
    permissions = ["VIEW_MY_COURSES"];
    renderLink();
    await waitFor(() => expect(myCourses).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing at all without either permission", () => {
    renderLink();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(myBuiltCourses).not.toHaveBeenCalled();
    expect(myCourses).not.toHaveBeenCalled();
  });

  it("stays quiet when the course list fails to load", async () => {
    // The subject page must not break because e-learning is unavailable.
    permissions = ["MANAGE_COURSE_CONTENT"];
    myBuiltCourses.mockRejectedValue(new Error("down"));
    renderLink();
    expect(
      await screen.findByRole("button", { name: /Build a course/i }),
    ).toBeInTheDocument();
  });
});
