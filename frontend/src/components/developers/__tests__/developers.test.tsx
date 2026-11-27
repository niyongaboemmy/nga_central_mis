import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import DevelopersPage from "../DevelopersPage";
import { ALL_SECTIONS, GROUPS } from "../content";
import { DEFAULT_VALUES, fillSample } from "../parts";
import type { Endpoint, Sample } from "../types";

// The theme switch needs the signed-in user context; the guide itself does not.
vi.mock("../../ui/ThemeToggle", () => ({ default: () => null }));

const endpoints: Endpoint[] = ALL_SECTIONS.flatMap((s) => s.blocks.flatMap((b) => (b.kind === "endpoint" ? [b.endpoint] : [])));
const samples: Sample[] = ALL_SECTIONS.flatMap((s) =>
  s.blocks.flatMap((b) => (b.kind === "endpoint" ? b.endpoint.samples : b.kind === "code" ? b.samples : [])),
);
const texts: string[] = ALL_SECTIONS.flatMap((s) =>
  s.blocks.flatMap((b) => {
    if (b.kind === "p" || b.kind === "note") return [b.text];
    if (b.kind === "list") return b.items;
    if (b.kind === "table") return b.rows.flat();
    if (b.kind === "steps") return b.steps.map((x) => x.text);
    return [];
  }),
);

describe("developers guide content", () => {
  it("gives every section and endpoint a unique anchor", () => {
    const ids = [...ALL_SECTIONS.map((s) => s.id), ...endpoints.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("only links to anchors that exist", () => {
    const ids = new Set([...ALL_SECTIONS.map((s) => s.id), ...endpoints.map((e) => e.id)]);
    const links = texts.flatMap((t) => [...t.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]));
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) expect(ids.has(l), `#${l}`).toBe(true);
  });

  it("gives every endpoint a cURL request on a root path (no /api prefix)", () => {
    expect(endpoints.length).toBeGreaterThanOrEqual(12);
    for (const e of endpoints) {
      expect(e.path.startsWith("/"), e.path).toBe(true);
      expect(e.path.startsWith("/api"), e.path).toBe(false);
      expect(e.samples.some((s) => s.lang === "curl"), e.path).toBe(true);
    }
  });

  it("keeps response examples valid JSON", () => {
    for (const e of endpoints) if (e.response) expect(() => JSON.parse(e.response!.body), e.path).not.toThrow();
    for (const s of samples) if (s.lang === "json") expect(() => JSON.parse(fillSample(s.code, DEFAULT_VALUES))).not.toThrow();
  });

  it("uses only known placeholders, and fills them all", () => {
    for (const s of samples) {
      const filled = fillSample(s.code, { env: "local", clientId: "my_app", redirectUri: "http://localhost:4000/cb", tenant: "2" });
      expect(filled).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
    expect(fillSample("{{BASE}}/x {{CLIENT_ID}} {{TENANT}}", DEFAULT_VALUES)).toBe("https://api.amashuri.com/x your_client_id 1");
    expect(fillSample("{{LOGIN}}", { ...DEFAULT_VALUES, env: "local" })).toBe("http://localhost:5173/login");
  });

  it("never points a sample at the web app host or a retired host", () => {
    for (const s of samples) {
      expect(s.code).not.toMatch(/isengesho|nga\.ac\.rw/);
      expect(s.code).not.toMatch(/mis\.amashuri\.com\/(sso|users|integrations|auth)/);
    }
  });
});

describe("developers page", () => {
  const mount = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <DevelopersPage />
        </ToastProvider>
      </MemoryRouter>,
    );

  it("renders every section and the navigation", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    for (const s of ALL_SECTIONS) expect(document.getElementById(s.id), s.id).toBeTruthy();
    for (const e of endpoints) expect(document.getElementById(e.id), e.id).toBeTruthy();
    expect(screen.getAllByText(GROUPS[1].title).length).toBeGreaterThan(0);
  });

  it("fills the reader's client ID into the samples and remembers it", () => {
    mount();
    fireEvent.change(screen.getByPlaceholderText("your_client_id"), { target: { value: "ganzaa_app" } });
    expect(document.body.textContent).toContain("ganzaa_app");
    expect(window.localStorage.getItem("amashuri.developers.values")).toContain("ganzaa_app");
  });

  it("switches every sample to the chosen language", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Python" }));
    expect(document.body.textContent).toContain("requests.post(");
    expect(document.body.textContent).not.toContain("curl -X POST https://api.amashuri.com/sso/token");
  });

  it("finds an endpoint from the search box", () => {
    mount();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "people" } });
    expect(screen.getByRole("listbox").textContent).toContain("/integrations/sync/people");
  });
});
