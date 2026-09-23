import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider, useConfirm } from "../ConfirmContext";

/** A button that asks before "deleting" — the shape every call site uses. */
const Deleter: React.FC<{ onResult: (ok: boolean) => void; phrase?: string }> = ({
  onResult,
  phrase,
}) => {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () =>
        onResult(
          await confirm({
            title: "Delete this week?",
            message: "The week and its lesson plans go with it.",
            confirmText: "Delete week",
            confirmationPhrase: phrase,
          }),
        )
      }
    >
      Delete
    </button>
  );
};

const renderDeleter = (phrase?: string) => {
  const onResult = vi.fn();
  render(
    <ConfirmProvider>
      <Deleter onResult={onResult} phrase={phrase} />
    </ConfirmProvider>,
  );
  return onResult;
};

describe("ConfirmProvider / useConfirm", () => {
  it("shows nothing until something asks", () => {
    renderDeleter();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves true when the destructive action is confirmed", async () => {
    const onResult = renderDeleter();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Delete this week?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete week" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("resolves false when cancelled, so the caller just returns", async () => {
    const onResult = renderDeleter();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("cancels on Escape", async () => {
    const onResult = renderDeleter();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("keeps the confirm button disabled until the phrase is typed", async () => {
    const onResult = renderDeleter("delete");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const confirmBtn = await screen.findByRole("button", { name: "Delete week" });
    expect(confirmBtn).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText("delete"), "delete");
    expect(confirmBtn).toBeEnabled();

    await userEvent.click(confirmBtn);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("does not confirm on Enter when a phrase is required", async () => {
    const onResult = renderDeleter("delete");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");

    await userEvent.keyboard("{Enter}");
    expect(onResult).not.toHaveBeenCalled();
  });
});
