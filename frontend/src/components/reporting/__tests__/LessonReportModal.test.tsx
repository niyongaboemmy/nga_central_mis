import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LessonReportModal from "../LessonReportModal";
import { buildAdHocOccurrence, ReportableLesson } from "../../../api/reports";

const submitLessonReportMock = vi.fn((_payload: any) =>
  Promise.resolve({ data: { data: { lesson_report_id: 1 } } }),
);
const updateLessonReportMock = vi.fn((_id: number, _payload: any) =>
  Promise.resolve({ data: { data: { lesson_report_id: 1 } } }),
);
const getLessonReportByIdMock = vi.fn((_id: number) =>
  Promise.resolve({
    data: {
      data: {
        lesson_report_id: 1,
        lesson_id: 55,
        entry_id: 77,
        subject_id: 10,
        class_group_id: 100,
        delivery_date: "2026-03-05",
        status: "PARTIAL",
        attendance_count: 22,
        completion_rate: 60,
        reflection_notes: "Ran out of time",
        evidence_url: "",
        schedule_flag: "ON_TIME",
        is_ad_hoc: false,
        support_request_category_ids: [2],
        challenge_category_ids: [11],
      },
    },
  }),
);
const getSupportRequestCategoriesMock = vi.fn(() =>
  Promise.resolve({
    data: {
      data: [
        { category_id: 1, label: "Technical / IT Support", is_active: 1 },
        { category_id: 2, label: "Infrastructure / Facilities", is_active: 1 },
      ],
    },
  }),
);
const getChallengeCategoriesMock = vi.fn(() =>
  Promise.resolve({
    data: {
      data: [
        { category_id: 10, label: "Electricity / Power", is_active: 1 },
        { category_id: 11, label: "Connectivity", is_active: 1 },
      ],
    },
  }),
);
vi.mock("../../../api/reports", async () => {
  const actual = await vi.importActual<any>("../../../api/reports");
  return {
    ...actual,
    reportsApi: {
      ...actual.reportsApi,
      submitLessonReport: (payload: any) => submitLessonReportMock(payload),
      updateLessonReport: (id: number, payload: any) => updateLessonReportMock(id, payload),
      getLessonReportById: (id: number) => getLessonReportByIdMock(id),
      getSupportRequestCategories: () => getSupportRequestCategoriesMock(),
      getChallengeCategories: () => getChallengeCategoriesMock(),
    },
  };
});

const getAllAssignedSubjectsMock = vi.fn(() =>
  Promise.resolve({
    data: {
      data: [
        {
          subject_id: 10,
          subject_name: "Mathematics",
          subject_code: "MATH",
          grades: [
            { grade_id: 1, grade_name: "Grade 1", program_id: 1, program_name: "Primary", class_group_id: 100, class_group_name: "Year One A", academic_year_id: 1, academic_year_name: "2026", assigned_at: "", validation_status: "APPROVED", validation_comment: null, scheme_id: null },
            { grade_id: 1, grade_name: "Grade 1", program_id: 1, program_name: "Primary", class_group_id: 101, class_group_name: "Year One B", academic_year_id: 1, academic_year_name: "2026", assigned_at: "", validation_status: "APPROVED", validation_comment: null, scheme_id: null },
          ],
        },
      ],
    },
  }),
);
vi.mock("../../../api/academics", async () => {
  const actual = await vi.importActual<any>("../../../api/academics");
  return {
    ...actual,
    myAssignedSubjectsApi: { getAll: () => getAllAssignedSubjectsMock() },
  };
});

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

const scheduledLesson: ReportableLesson = {
  slot_id: 1,
  date: "2026-03-05",
  start_time: "08:00",
  end_time: "09:00",
  subject_name: "Mathematics",
  subject_code: "MATH",
  subject_color: "#3B82F6",
  module_code: "M1",
  module_name: "Algebra",
  big_question: null,
  topic: "Linear Equations",
  sub_topic: null,
  objective: null,
  learning_outcomes: [],
  lesson_id: 55,
  entry_id: 77,
  reporting_status: "PENDING",
  lesson_report: null,
};

describe("LessonReportModal — ad-hoc vs scheduled mode", () => {
  beforeEach(() => {
    submitLessonReportMock.mockClear();
    updateLessonReportMock.mockClear();
    getLessonReportByIdMock.mockClear();
    getAllAssignedSubjectsMock.mockClear();
    getSupportRequestCategoriesMock.mockClear();
    getChallengeCategoriesMock.mockClear();
  });

  it("scheduled mode shows the Delivery Status picker and no subject/class-group selects", () => {
    render(
      <LessonReportModal
        lesson={scheduledLesson}
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    expect(screen.getByText("Delivery Status")).toBeInTheDocument();
    expect(screen.queryByText("Subject")).not.toBeInTheDocument();
    expect(screen.queryByText("Class Group")).not.toBeInTheDocument();
  });

  it("ad-hoc mode shows subject/class-group selects and hides the Delivery Status picker", async () => {
    render(
      <LessonReportModal
        lesson={buildAdHocOccurrence("2026-03-06")}
        isAdHoc
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await waitFor(() => expect(getAllAssignedSubjectsMock).toHaveBeenCalled());
    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("Class Group")).toBeInTheDocument();
    expect(screen.queryByText("Delivery Status")).not.toBeInTheDocument();
  });

  it("ad-hoc mode disables submit until both subject and class group are chosen, then submits with subject_id/class_group_id", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(
      <LessonReportModal
        lesson={buildAdHocOccurrence("2026-03-06")}
        isAdHoc
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={onSubmitted}
      />,
    );

    await waitFor(() => expect(getAllAssignedSubjectsMock).toHaveBeenCalled());

    const submitButton = screen.getByRole("button", { name: /log activity/i });
    expect(submitButton).toBeDisabled();

    const [subjectSelect, classGroupSelect] = Array.from(document.querySelectorAll("select"));
    await user.selectOptions(subjectSelect, "10");
    await user.selectOptions(classGroupSelect, "100");

    expect(submitButton).not.toBeDisabled();

    await user.click(submitButton);

    await waitFor(() => expect(submitLessonReportMock).toHaveBeenCalledTimes(1));
    const payload = submitLessonReportMock.mock.calls[0]?.[0];
    expect(payload?.subject_id).toBe(10);
    expect(payload?.class_group_id).toBe(100);
    expect(payload?.status).toBeUndefined();
    expect(payload?.lesson_id).toBeUndefined();
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("renders Support Needed / Challenges category chips and includes toggled selections in the submit payload", async () => {
    const user = userEvent.setup();
    render(
      <LessonReportModal
        lesson={scheduledLesson}
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await waitFor(() => expect(getSupportRequestCategoriesMock).toHaveBeenCalled());
    await waitFor(() => expect(getChallengeCategoriesMock).toHaveBeenCalled());

    const supportChip = await screen.findByRole("button", { name: "Technical / IT Support" });
    const challengeChip = await screen.findByRole("button", { name: "Electricity / Power" });

    await user.click(supportChip);
    await user.click(challengeChip);

    await user.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(submitLessonReportMock).toHaveBeenCalledTimes(1));
    const payload = submitLessonReportMock.mock.calls[0]?.[0];
    expect(payload?.support_request_category_ids).toEqual([1]);
    expect(payload?.challenge_category_ids).toEqual([10]);
  });

  it("opening an already-reported scheduled lesson fetches and prefills its details, then updates on submit", async () => {
    const user = userEvent.setup();
    const reportedLesson: ReportableLesson = {
      ...scheduledLesson,
      reporting_status: "REPORTED",
      lesson_report: {
        lesson_report_id: 1,
        status: "PARTIAL",
        attendance_count: 22,
        completion_rate: 60,
        schedule_flag: "ON_TIME",
      },
    };

    render(
      <LessonReportModal
        lesson={reportedLesson}
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await waitFor(() => expect(getLessonReportByIdMock).toHaveBeenCalledWith(1));

    // Prefilled from the fetched detail
    expect(await screen.findByDisplayValue("22")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ran out of time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update report/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /update report/i }));

    await waitFor(() => expect(updateLessonReportMock).toHaveBeenCalledTimes(1));
    expect(updateLessonReportMock.mock.calls[0][0]).toBe(1);
    const payload = updateLessonReportMock.mock.calls[0][1];
    expect(payload.attendance_count).toBe(22);
    expect(payload.reflection_notes).toBe("Ran out of time");
    expect(payload.support_request_category_ids).toEqual([2]);
    expect(payload.challenge_category_ids).toEqual([11]);
  });

  it("editing an ad-hoc report shows the subject/class-group as read-only, not as editable selects", async () => {
    getLessonReportByIdMock.mockResolvedValueOnce({
      data: {
        data: {
          lesson_report_id: 2,
          lesson_id: null,
          entry_id: null,
          subject_id: 10,
          class_group_id: 100,
          delivery_date: "2026-03-06",
          status: "UNPLANNED",
          attendance_count: null,
          completion_rate: 100,
          reflection_notes: "",
          evidence_url: "",
          schedule_flag: "ON_TIME",
          is_ad_hoc: true,
          support_request_category_ids: [],
          challenge_category_ids: [],
        },
      },
    } as any);

    const adHocReportedLesson: ReportableLesson = {
      ...buildAdHocOccurrence("2026-03-06"),
      is_ad_hoc: true,
      reporting_status: "REPORTED",
      lesson_report: {
        lesson_report_id: 2,
        status: "UNPLANNED" as any,
        attendance_count: null,
        completion_rate: 100,
        schedule_flag: "ON_TIME",
      },
    };

    render(
      <LessonReportModal
        lesson={adHocReportedLesson}
        isAdHoc
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await waitFor(() => expect(getLessonReportByIdMock).toHaveBeenCalledWith(2));
    await waitFor(() => expect(getAllAssignedSubjectsMock).toHaveBeenCalled());

    // No editable Subject/Class Group selects in edit mode...
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // ...but the resolved names are shown read-only.
    expect(await screen.findByText(/Mathematics/)).toBeInTheDocument();
    expect(await screen.findByText(/Year One A/)).toBeInTheDocument();
  });

  it("picking a subject/class-group that already has an ad-hoc report for the day switches into editing it", async () => {
    const user = userEvent.setup();
    getLessonReportByIdMock.mockResolvedValueOnce({
      data: {
        data: {
          lesson_report_id: 3,
          lesson_id: null,
          entry_id: null,
          subject_id: 10,
          class_group_id: 100,
          delivery_date: "2026-03-06",
          status: "UNPLANNED",
          attendance_count: 5,
          completion_rate: 80,
          reflection_notes: "Already logged this one",
          evidence_url: "",
          schedule_flag: "ON_TIME",
          is_ad_hoc: true,
          support_request_category_ids: [],
          challenge_category_ids: [],
        },
      },
    } as any);

    const existingDayLessons: ReportableLesson[] = [
      {
        ...buildAdHocOccurrence("2026-03-06"),
        subject_id: 10,
        class_group_id: 100,
        is_ad_hoc: true,
        reporting_status: "REPORTED",
        lesson_report: {
          lesson_report_id: 3,
          status: "UNPLANNED" as any,
          attendance_count: 5,
          completion_rate: 80,
          schedule_flag: "ON_TIME",
        },
      },
    ];

    render(
      <LessonReportModal
        lesson={buildAdHocOccurrence("2026-03-06")}
        isAdHoc
        existingDayLessons={existingDayLessons}
        academicTermId={1}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await waitFor(() => expect(getAllAssignedSubjectsMock).toHaveBeenCalled());

    const subjectSelect = document.querySelectorAll("select")[0];
    expect(screen.getByRole("option", { name: /Mathematics \(already logged\)/, hidden: true })).toBeInTheDocument();

    await user.selectOptions(subjectSelect, "10");

    await waitFor(() => expect(getLessonReportByIdMock).toHaveBeenCalledWith(3));
    expect(await screen.findByDisplayValue("Already logged this one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update report/i })).toBeInTheDocument();
    // The picker is gone now that we're editing the matched report.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
