import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentProofForm from "../PaymentProofForm";
import { makeInvoice } from "./fixtures";

describe("PaymentProofForm", () => {
  it("refuses to submit without a method and reference", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PaymentProofForm invoice={makeInvoice()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /send proof/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("radiogroup", { name: /payment method/i })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Reference")).toHaveAttribute("aria-invalid", "true");
  });

  it("offers only the given methods, prefills the amount and flags a mismatch", () => {
    render(<PaymentProofForm invoice={makeInvoice()} methods={["MOMO", "CASH"]} onSubmit={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    const amount = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amount.value).toBe("250000");
    expect(screen.queryByTestId("amount-mismatch")).not.toBeInTheDocument();
    fireEvent.change(amount, { target: { value: "200000" } });
    expect(screen.getByTestId("amount-mismatch")).toBeInTheDocument();
  });

  it("submits the payload with the receipt and shows the success tick", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PaymentProofForm invoice={makeInvoice()} methods={["MOMO", "BANK_TRANSFER"]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: /bank/i }));
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "  TX-991 " } });
    const file = new File(["%PDF"], "receipt.pdf", { type: "application/pdf" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /send proof/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [body, proof] = onSubmit.mock.calls[0];
    expect(body).toMatchObject({ method: "BANK_TRANSFER", reference: "TX-991", amount: 250000 });
    expect(body.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(proof).toBe(file);
    expect(await screen.findByText("Proof sent")).toBeInTheDocument();
  });

  it("shows the server message when the submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue({ response: { data: { message: "Duplicate reference" } } });
    render(<PaymentProofForm invoice={makeInvoice()} methods={["CASH"]} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "R1" } });
    fireEvent.click(screen.getByRole("button", { name: /send proof/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Duplicate reference");
  });
});
