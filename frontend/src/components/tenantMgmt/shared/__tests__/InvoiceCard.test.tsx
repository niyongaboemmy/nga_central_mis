import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InvoiceCard from "../InvoiceCard";
import { INSTRUCTIONS, iso, makeInvoice } from "./fixtures";

describe("InvoiceCard", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("copies payment details with one tap and shows the Copied tick", async () => {
    render(<InvoiceCard invoice={makeInvoice()} instructions={INSTRUCTIONS} pdfUrl="/x.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: /copy momo details/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("*182*8*1*123456#"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("counts down to the due date", () => {
    render(<InvoiceCard invoice={makeInvoice({ dueAt: iso(5) })} instructions={INSTRUCTIONS} pdfUrl="/x.pdf" />);
    const ring = screen.getByRole("img", { name: /due in 5 days/i });
    expect(ring).not.toHaveAttribute("data-overdue");
  });

  it("turns red once overdue", () => {
    render(<InvoiceCard invoice={makeInvoice({ dueAt: iso(-3) })} instructions={INSTRUCTIONS} pdfUrl="/x.pdf" />);
    expect(screen.getByRole("img", { name: /overdue/i })).toHaveAttribute("data-overdue", "true");
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("opens the PDF in a new tab and offers Pay only while payable", () => {
    const onPay = vi.fn();
    const { rerender } = render(<InvoiceCard invoice={makeInvoice()} instructions={INSTRUCTIONS} pdfUrl="/x.pdf" onPay={onPay} />);
    const pdf = screen.getByRole("link", { name: /pdf/i });
    expect(pdf).toHaveAttribute("href", "/x.pdf");
    expect(pdf).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));
    expect(onPay).toHaveBeenCalled();
    rerender(<InvoiceCard invoice={makeInvoice({ status: "PAID" })} instructions={INSTRUCTIONS} pdfUrl="/x.pdf" onPay={onPay} />);
    expect(screen.queryByRole("button", { name: /^pay$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /how to pay/i })).not.toBeInTheDocument();
  });
});
