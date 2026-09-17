import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetadataProvider } from "../MetadataContext";
import { UserProvider } from "../UserContext";
import { AcademicPeriodProvider, useAcademicPeriod } from "../AcademicPeriodContext";

// `MetadataProvider` gates its year/program fetches on `useUser().isAuthenticated`,
// so it must be mounted under a real `UserProvider`. `getCurrentUser` is the call
// that flips `isAuthenticated` to true once it resolves. Defaults to resolving
// immediately; the dedicated race-condition test below overrides this to control
// timing and simulate the pre-login → post-login transition explicitly.
const getCurrentUserMock = vi.fn(() =>
  Promise.resolve({ user_id: 1, roles: [] }),
);

vi.mock("../../api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/users")>();
  return {
    ...actual,
    getCurrentUser: () => getCurrentUserMock(),
  };
});

vi.mock("../../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/auth")>();
  return {
    ...actual,
    logout: vi.fn(),
    checkSession: vi.fn(() => Promise.resolve(undefined)),
  };
});

const YEARS = [
  {
    academic_year_id: 1,
    name: "2024-2025",
    start_date: null,
    end_date: null,
    is_current: 0,
  },
  {
    academic_year_id: 2,
    name: "2025-2026",
    start_date: null,
    end_date: null,
    is_current: 1,
  },
];

const TERMS_BY_YEAR: Record<number, any[]> = {
  1: [
    {
      academic_term_id: 11,
      academic_year_id: 1,
      name: "Term 1",
      start_date: null,
      end_date: null,
      is_current: 0,
    },
    {
      academic_term_id: 12,
      academic_year_id: 1,
      name: "Term 2",
      start_date: null,
      end_date: null,
      is_current: 1,
    },
  ],
  2: [
    {
      academic_term_id: 21,
      academic_year_id: 2,
      name: "Term A",
      start_date: null,
      end_date: null,
      is_current: 1,
    },
  ],
  // Year 3 intentionally has zero terms — regression case for an infinite
  // fetch loop that used to happen when a selected year had no terms yet.
  3: [],
};

const academicTermsGetAllMock = vi.fn((yearId: number) =>
  Promise.resolve({ data: { data: TERMS_BY_YEAR[yearId] || [] } }),
);

vi.mock("../../api/academics", () => ({
  academicYearsApi: {
    getAll: vi.fn(() =>
      Promise.resolve({
        data: {
          data: [
            ...YEARS,
            {
              academic_year_id: 3,
              name: "2023-2024",
              start_date: null,
              end_date: null,
              is_current: 0,
            },
          ],
        },
      }),
    ),
  },
  academicTermsApi: {
    getAll: (yearId: number) => academicTermsGetAllMock(yearId),
  },
  programsApi: {
    getAll: vi.fn(() => Promise.resolve({ data: { data: [] } })),
  },
  gradesApi: {
    getAll: vi.fn(() => Promise.resolve({ data: { data: [] } })),
  },
}));

const Consumer: React.FC = () => {
  const {
    selectedYear,
    selectedTerm,
    selectedYearId,
    setSelectedYearId,
    setSelectedTermId,
    terms,
  } = useAcademicPeriod();

  return (
    <div>
      <span data-testid="year-name">{selectedYear?.name ?? ""}</span>
      <span data-testid="term-name">{selectedTerm?.name ?? ""}</span>
      <button onClick={() => setSelectedYearId(1)}>switch-to-2024</button>
      <button
        onClick={() => setSelectedTermId(terms[0]?.academic_term_id)}
        disabled={!selectedYearId || terms.length === 0}
      >
        pick-first-term
      </button>
    </div>
  );
};

const renderWithProviders = () =>
  render(
    <UserProvider>
      <MetadataProvider>
        <AcademicPeriodProvider>
          <Consumer />
        </AcademicPeriodProvider>
      </MetadataProvider>
    </UserProvider>,
  );

describe("AcademicPeriodContext", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    academicTermsGetAllMock.mockClear();
    getCurrentUserMock.mockClear();
    // A valid-shaped (unexpired, unverified-signature) JWT so `getToken()`
    // resolves truthy and `UserContext` takes the "has token" branch.
    const payload = btoa(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    localStorage.setItem("token", `header.${payload}.sig`);
  });

  it("defaults to the year and term flagged is_current", async () => {
    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByTestId("year-name").textContent).toBe("2025-2026"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("term-name").textContent).toBe("Term A"),
    );
  });

  it("switches to the new year's is_current term and persists the selection", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByTestId("year-name").textContent).toBe("2025-2026"),
    );

    await user.click(screen.getByText("switch-to-2024"));

    await waitFor(() =>
      expect(screen.getByTestId("year-name").textContent).toBe("2024-2025"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("term-name").textContent).toBe("Term 2"),
    );

    expect(localStorage.getItem("academic_period_year_id")).toBe("1");
    expect(localStorage.getItem("academic_period_term_id")).toBe("12");
  });

  it("restores a previously persisted year/term selection on next mount", async () => {
    localStorage.setItem("academic_period_year_id", "1");
    localStorage.setItem("academic_period_term_id", "11");

    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByTestId("year-name").textContent).toBe("2024-2025"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("term-name").textContent).toBe("Term 1"),
    );
  });

  it("does not loop indefinitely when the selected year has zero terms", async () => {
    // Drive the selection via localStorage + a fresh mount, rather than
    // adding dedicated UI for this one regression case.
    localStorage.setItem("academic_period_year_id", "3");
    renderWithProviders();

    await waitFor(() => expect(academicTermsGetAllMock).toHaveBeenCalledWith(3));
    const callsAfterFirstFetch = academicTermsGetAllMock.mock.calls.filter(
      (c) => c[0] === 3,
    ).length;

    // Give any runaway effect loop a real window to keep firing.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const callsAfterWait = academicTermsGetAllMock.mock.calls.filter(
      (c) => c[0] === 3,
    ).length;
    expect(callsAfterWait).toBe(callsAfterFirstFetch);
    expect(callsAfterWait).toBeLessThanOrEqual(1);
  });

  it("loads terms once auth resolves, even with a stale year already selected before login completes", async () => {
    // Regression test for: right after login (no page reload), the selector
    // showed "No term available" forever. Root cause: `selectedYearId` is
    // seeded from localStorage synchronously at mount, so the terms-fetch
    // effect fired immediately — before `MetadataProvider` had auth and
    // therefore before `years` had loaded — got back `[]`, and (since that
    // failure was never cached) never retried once auth actually resolved.
    localStorage.setItem("academic_period_year_id", "2");
    localStorage.setItem("academic_period_term_id", "21");

    let resolveAuth: (() => void) | null = null;
    getCurrentUserMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuth = () => resolve({ user_id: 1, roles: [] } as any);
        }),
    );

    renderWithProviders();

    // Auth hasn't resolved yet, so `years` is still empty and no terms fetch
    // should have gone out.
    expect(academicTermsGetAllMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("term-name").textContent).toBe("");

    resolveAuth!();

    await waitFor(() =>
      expect(screen.getByTestId("year-name").textContent).toBe("2025-2026"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("term-name").textContent).toBe("Term A"),
    );
  });
});
