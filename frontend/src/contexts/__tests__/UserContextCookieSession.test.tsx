import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * amashuri.com went blank for signed-in people (2026-11-25): with no saved token
 * (another origin than mis.amashuri.com) the user is restored from the shared
 * session cookie via /auth/session, whose answer has the /users/me shape
 * ({ user, profile, ... }). UserContext kept only `.user`, so `user.user` was
 * undefined and ThemeContext threw on `user.user.preferred_theme`.
 */
const session = {
  user: { user_id: 15, username: "jane", email: "jane@example.com", preferred_theme: "dark" },
  profile: { first_name: "Jane", last_name: "Doe" },
  permissions: [],
  roles: [],
  tenant: { tid: 1, slug: "nga", name: "NGA", status: "ACTIVE", isPrimary: true },
};
const checkSession = vi.fn();
vi.mock("../../api/auth", async (orig) => ({ ...(await orig<any>()), checkSession: () => checkSession(), logout: vi.fn() }));
vi.mock("../../api/users", async (orig) => ({ ...(await orig<any>()), getCurrentUser: vi.fn(), updateUserTheme: vi.fn() }));

import { UserProvider, useUser } from "../UserContext";
import { ThemeProvider } from "../ThemeContext";

const Probe = () => {
  const { user } = useUser();
  return <p data-testid="who">{user?.user?.username ?? "nobody"}:{user?.profile?.first_name ?? "-"}</p>;
};

beforeEach(() => {
  localStorage.clear();
  checkSession.mockReset();
});

describe("UserContext: restore from the session cookie", () => {
  it("keeps the whole session (user + profile), and the theme provider renders", async () => {
    checkSession.mockResolvedValue(session);
    render(
      <UserProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </UserProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("jane:Jane"));
  });

  it("ignores a session answer without a user", async () => {
    checkSession.mockResolvedValue({ user: null });
    render(
      <UserProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </UserProvider>,
    );
    await waitFor(() => expect(checkSession).toHaveBeenCalled());
    expect(screen.getByTestId("who")).toHaveTextContent("nobody:-");
  });
});
