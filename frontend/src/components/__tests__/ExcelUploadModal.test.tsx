import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";

/** Bulk upload: when the server doesn't answer in time, say what that means (it may have worked) instead of "Upload failed". */

const api = vi.hoisted(() => ({ getRoles: vi.fn(), bulkCreateUsers: vi.fn() }));
vi.mock("../../api/users", async (orig) => {
  const m: any = await orig();
  return { ...m, getRoles: api.getRoles, bulkCreateUsers: api.bulkCreateUsers };
});
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));

import ExcelUploadModal from "../ExcelUploadModal";

const file = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { username: "ada", email: "ada@example.test" },
      { username: "bob", email: "bob@example.test" },
    ]),
    "Users",
  );
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], "people.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

async function uploadWith(rejection: unknown) {
  const onSuccess = vi.fn();
  api.bulkCreateUsers.mockRejectedValue(rejection);
  const { container } = render(<ExcelUploadModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
  const user = userEvent.setup();
  // a role must be chosen before uploading (otherwise the dialog warns instead)
  await user.click(await screen.findByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: /TEACHER/ }));
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file()] } });
  const upload = await screen.findByRole("button", { name: /Upload 2 Valid/ }, { timeout: 4000 });
  await user.click(upload);
  await waitFor(() => expect(api.bulkCreateUsers).toHaveBeenCalled());
  return onSuccess;
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getRoles.mockResolvedValue([{ role_id: 4, name: "TEACHER", description: "", status: "ACTIVE" }]);
});

describe("bulk upload errors", () => {
  it("a timeout says users may already exist and refreshes the list", async () => {
    const onSuccess = await uploadWith({ code: "ECONNABORTED", message: "timeout of 300000ms exceeded" });
    expect(await screen.findByText(/taking longer than expected/)).toBeInTheDocument();
    expect(screen.queryByText(/^Upload failed$/)).toBeNull();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows the server's own message", async () => {
    await uploadWith({ response: { status: 403, data: { message: "This school's package allows 30 staff" } } });
    expect(await screen.findByText("This school's package allows 30 staff")).toBeInTheDocument();
  });

  it("explains a file the server refused as too large", async () => {
    await uploadWith({ response: { status: 413, data: "<html>413</html>" } });
    await waitFor(() => expect(screen.getByText(/too large for the server/)).toBeInTheDocument());
  });
});

describe("students without an e-mail", () => {
  const sheet = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { username: "kid_one", email: "" },
        { username: "kid_two", email: "kid2@example.test" },
      ]),
      "Users",
    );
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new File([buf], "kids.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };

  const open = async (role: RegExp) => {
    api.getRoles.mockResolvedValue([
      { role_id: 4, name: "TEACHER", description: "", status: "ACTIVE" },
      { role_id: 5, name: "STUDENT", description: "", status: "ACTIVE" },
    ]);
    const { container } = render(<ExcelUploadModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: role }));
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [sheet()] } });
    return user;
  };

  it("are valid under the Student role, marked as unable to sign in", async () => {
    api.bulkCreateUsers.mockResolvedValue({ success: 2, failed: 0, without_email: 1, errors: [] });
    const user = await open(/STUDENT/);
    const upload = await screen.findByRole("button", { name: /Upload 2 Valid/ }, { timeout: 4000 });
    expect(screen.getByText("No email · can't sign in")).toBeInTheDocument();
    expect(screen.getByText(/1 student has no\s+email/)).toBeInTheDocument();

    await user.click(upload);
    expect(await screen.findByText(/1 without an email: they can't\s+sign in/)).toBeInTheDocument();
    expect(api.bulkCreateUsers).toHaveBeenCalledWith(expect.any(File), 5);
  });

  it("are errors under any other role", async () => {
    await open(/TEACHER/);
    expect(await screen.findByRole("button", { name: /Upload 1 Valid/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Only students may be uploaded without an email/)).toBeInTheDocument();
  });
});
