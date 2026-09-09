import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassGroupsTab from "../ClassGroupsTab";

const dependenciesMock = vi.fn();

vi.mock("../../../api/academics", () => ({
  classGroupsApi: { dependencies: (id: number) => dependenciesMock(id) },
}));

vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

// The tab renders PromoteStudentsModal, which needs a ToastProvider it has
// no reason to pull into a delete-flow test.
vi.mock("../PromoteStudentsModal", () => ({ default: () => null }));

const CLASS_GROUP = { class_group_id: 9, grade_id: 1, name: "L3. Class B" };

const report = (overrides: any = {}) => ({
  data: {
    data: {
      class_group_id: 9,
      name: "L3. Class B",
      can_delete: true,
      requires_confirmation: false,
      blocking: [],
      detachable: [],
      ...overrides,
    },
  },
});

const renderTab = (onDelete = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <ClassGroupsTab
      data={[CLASS_GROUP]}
      academicYears={[
        {
          academic_year_id: 1,
          name: "2026",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_current: 1,
        } as any,
      ]}
      grades={[{ grade_id: 1, program_id: 1, name: "Year 1" } as any]}
      loading={false}
      onRefresh={vi.fn()}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={onDelete}
      onPromote={vi.fn()}
    />,
  );
  return onDelete;
};

const openDeleteModal = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
};

/** The row's Delete action opens the modal; the modal's Delete confirms it. */
const confirmButton = () => {
  const buttons = screen.getAllByRole("button", { name: "Delete" });
  return buttons[buttons.length - 1];
};

describe("ClassGroupsTab delete flow", () => {
  beforeEach(() => {
    dependenciesMock.mockReset();
  });

  it("deletes without a force flag when nothing references the class group", async () => {
    dependenciesMock.mockResolvedValue(report());
    const onDelete = renderTab();

    await openDeleteModal();
    await waitFor(() => expect(dependenciesMock).toHaveBeenCalledWith(9));

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9, false));
  });

  it("lists what a delete would clear and forces the delete once confirmed", async () => {
    dependenciesMock.mockResolvedValue(
      report({
        requires_confirmation: true,
        detachable: [
          {
            key: "students",
            label: "student assignment(s)",
            count: 12,
            blocking: false,
          },
        ],
      }),
    );
    const onDelete = renderTab();

    await openDeleteModal();
    expect(
      await screen.findByText("12 student assignment(s)"),
    ).toBeInTheDocument();

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9, true));
  });

  it("blocks the delete and names the records in the way", async () => {
    dependenciesMock.mockResolvedValue(
      report({
        can_delete: false,
        blocking: [
          {
            key: "schemes_of_work",
            label: "scheme(s) of work",
            count: 3,
            blocking: true,
          },
        ],
      }),
    );
    const onDelete = renderTab();

    await openDeleteModal();
    expect(await screen.findByText("3 scheme(s) of work")).toBeInTheDocument();

    expect(confirmButton()).toBeDisabled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("surfaces the server's reason when the delete fails", async () => {
    dependenciesMock.mockResolvedValue(report());
    const onDelete = vi.fn().mockRejectedValue({
      response: { data: { message: "Still has 2 lesson report(s)." } },
    });
    renderTab(onDelete);

    await openDeleteModal();
    await waitFor(() => expect(dependenciesMock).toHaveBeenCalled());

    await userEvent.click(confirmButton());

    expect(
      await screen.findByText("Still has 2 lesson report(s)."),
    ).toBeInTheDocument();
  });
});
