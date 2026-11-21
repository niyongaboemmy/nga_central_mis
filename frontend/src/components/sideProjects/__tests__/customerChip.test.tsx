import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CustomerChip, customerShortName } from "../customers/CustomerParts";

describe("customer chip", () => {
  it("uses the acronym in brackets, else the name", () => {
    expect(customerShortName("Rwanda Information Society Authority (RISA)")).toBe("RISA");
    expect(customerShortName("New Generation Coding Academy")).toBe("New Generation Coding Academy");
    expect(customerShortName("Kigali Green Farms (Ltd shop)")).toBe("Kigali Green Farms (Ltd shop)");
  });
  it("stays on one line with the full name on hover", () => {
    render(<CustomerChip c={{ id: 1, name: "Rwanda Information Society Authority (RISA)", logoAssetId: null, kind: "GOVERNMENT" }} />);
    const chip = screen.getByTitle("For Rwanda Information Society Authority (RISA)");
    expect(chip.className).toContain("whitespace-nowrap");
    expect(chip).toHaveTextContent("RISA");
  });
});
