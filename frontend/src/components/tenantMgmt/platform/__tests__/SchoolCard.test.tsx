import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("../../../../hooks/useTenantBranding", () => ({ loadBranding: vi.fn(async () => ({ logo_url: null })) }));
import { SchoolCard } from "../SchoolsPage";
import { formatMb } from "../../kit";

const pkg = (limits: Record<string, number | null>) =>
  ({
    code: "max",
    name: "Max",
    accent: "emerald",
    entitlements: Object.entries(limits).map(([key, value]) => ({ key, kind: "LIMIT", value })),
  }) as any;

const school = (over: object = {}) =>
  ({
    tid: 2,
    slug: "new-generation",
    name: "New Generation Academy",
    status: "ACTIVE",
    isPrimary: false,
    pkg: "max",
    students: 30,
    staff: 17,
    storageMb: 49,
    activeUsers7d: 12,
    periodEnd: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
    graceUntil: null,
    lastActivityAt: null,
    createdAt: new Date().toISOString(),
    ...over,
  }) as any;

const renderCard = (t: any, p: any) =>
  render(
    <MemoryRouter>
      <SchoolCard t={t} pkg={p} />
    </MemoryRouter>,
  );

describe("platform school card", () => {
  it("labels usage, draws no bar for unlimited limits, and formats storage", () => {
    renderCard(school(), pkg({ "limit.students": null, "limit.staff": null, "limit.storage_gb": 250 }));
    expect(screen.getByRole("meter", { name: "Students" })).toHaveAttribute("aria-valuetext", "30 · Unlimited");
    expect(screen.getByRole("meter", { name: "Students" }).childElementCount).toBe(0); // no "full" bar
    expect(screen.getByRole("meter", { name: "Storage" })).toHaveAttribute("aria-valuetext", "49 MB of 250 GB");
    expect(screen.getByText("Students")).toBeInTheDocument();
  });

  it("says when it renews, how many people were active, and when it was last used", () => {
    renderCard(school({ lastActivityAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }), pkg({}));
    expect(screen.getByText(/Renews in 1(19|20)d/)).toBeInTheDocument();
    expect(screen.getByText("12 active this week")).toBeInTheDocument();
    expect(screen.getByText("Active 3h ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New Generation Academy, active, Max package/ })).toHaveAttribute("href", "/platform/schools/2");
  });

  it("marks the primary school and shows no renewal for it", () => {
    renderCard(school({ isPrimary: true, name: "NGA", slug: "nga" }), pkg({}));
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.queryByText(/Renews in/)).toBeNull();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("formats megabytes", () => {
    expect(formatMb(49)).toBe("49 MB");
    expect(formatMb(1536)).toBe("1.5 GB");
    expect(formatMb(256000)).toBe("250 GB");
  });
});
