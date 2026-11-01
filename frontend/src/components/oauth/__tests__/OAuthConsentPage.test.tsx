import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OAuthConsentPage from "../OAuthConsentPage";
import ConnectedAiApps from "../../myAi/ConnectedAiApps";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";

const consent = vi.hoisted(() => ({ get: vi.fn(), decide: vi.fn() }));
const connections = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }));
const leaveTo = vi.hoisted(() => vi.fn());

vi.mock("../../../api/mcpConnector", async (orig) => ({
  ...(await orig<typeof import("../../../api/mcpConnector")>()),
  consentApi: consent,
  connectionsApi: connections,
  leaveTo,
}));
vi.mock("../../Login", () => ({ default: () => <div>Sign-in form</div> }));

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const fail = (status: number, body: unknown = {}) => Promise.reject({ response: { status, data: body } });

const details = (over: Record<string, unknown> = {}) => ({
  client: { name: "Claude", clientUri: null, redirectHost: "claude.ai", registeredBySchool: false },
  scopes: [
    { scope: "nga.read", text: "Read your own teaching data." },
    { scope: "nga.drafts", text: "Create drafts only." },
  ],
  pupilNamesOption: true,
  ...over,
});

beforeEach(() => {
  [consent.get, consent.decide, connections.list, connections.revoke, leaveTo].forEach((f) => f.mockReset());
  window.history.replaceState(null, "", "/oauth/authorize?request=signed.req.blob");
});

describe("NGA connector consent page", () => {
  it("shows the app, what it may do, and an unticked pupil-names box; Allow sends the choice back", async () => {
    consent.get.mockReturnValue(ok(details()));
    consent.decide.mockReturnValue(ok({ redirectTo: "https://claude.ai/api/mcp/auth_callback?code=abc&state=s" }));
    render(<OAuthConsentPage />);

    expect(await screen.findByRole("heading", { name: /Connect Claude to NGA/ })).toBeInTheDocument();
    expect(consent.get).toHaveBeenCalledWith("signed.req.blob");
    expect(screen.getByText("claude.ai")).toBeInTheDocument();
    expect(screen.getByText("Read your own teaching data.")).toBeInTheDocument();
    expect(screen.getByText("Create drafts only.")).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: /Allow pupil names/ });
    expect(box).not.toBeChecked();

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /Allow/ }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=abc&state=s"));
    expect(consent.decide).toHaveBeenCalledWith("signed.req.blob", "allow", true);
  });

  it("hides the pupil-names box when the school says never, and Deny goes back", async () => {
    consent.get.mockReturnValue(ok(details({ pupilNamesOption: false })));
    consent.decide.mockReturnValue(ok({ redirectTo: "https://claude.ai/cb?error=access_denied" }));
    render(<OAuthConsentPage />);
    await screen.findByRole("heading", { name: /Connect Claude/ });
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Deny/ }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("https://claude.ai/cb?error=access_denied"));
    expect(consent.decide).toHaveBeenCalledWith("signed.req.blob", "deny", false);
  });

  it("asks a signed-out person to sign in on the same page", async () => {
    consent.get.mockReturnValue(fail(401));
    render(<OAuthConsentPage />);
    expect(await screen.findByText("Sign-in form")).toBeInTheDocument();
  });

  it("explains a refusal (connector off) and offers the way back", async () => {
    consent.get.mockReturnValue(fail(403, { code: "CONNECTOR_OFF", message: "Your school has not turned on the NGA connector." }));
    render(<OAuthConsentPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your school has not turned on the NGA connector.");
    expect(screen.getByText(/Settings → AI/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Allow/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Back to the AI app/ })).toBeInTheDocument();
  });

  it("without a request, says to start from the AI app", () => {
    window.history.replaceState(null, "", "/oauth/authorize");
    render(<OAuthConsentPage />);
    expect(screen.getByText(/Open this page from Claude or ChatGPT/)).toBeInTheDocument();
    expect(consent.get).not.toHaveBeenCalled();
  });
});

describe("My AI: Connected AI apps", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    available: true,
    blocked: null,
    connectorUrl: "https://api.amashuri.com/mcp",
    connections: [{ clientId: "nga_1", name: "Claude", clientUri: null, scopes: ["nga.read", "nga.drafts"], connectedAt: "2026-11-01T08:00:00Z", lastUsedAt: null }],
    ...over,
  });

  it("lists connected apps with the address to add, and revokes after confirming", async () => {
    connections.list.mockReturnValueOnce(ok(view())).mockReturnValueOnce(ok(view({ connections: [] })));
    connections.revoke.mockReturnValue(ok({ revoked: 2 }));
    render(
      <ConfirmProvider>
        <ConnectedAiApps />
      </ConfirmProvider>,
    );
    expect(await screen.findByText("https://api.amashuri.com/mcp")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText(/Read · Create drafts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revoke/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(connections.revoke).toHaveBeenCalledWith("nga_1"));
    await waitFor(() => expect(screen.queryByText("Claude")).toBeNull());
  });

  it("renders nothing when the connector isn't available and nothing is connected", async () => {
    connections.list.mockReturnValue(ok(view({ available: false, blocked: { code: "CONNECTOR_OFF", message: "Off." }, connections: [] })));
    const { container } = render(
      <ConfirmProvider>
        <ConnectedAiApps />
      </ConfirmProvider>,
    );
    await waitFor(() => expect(connections.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
