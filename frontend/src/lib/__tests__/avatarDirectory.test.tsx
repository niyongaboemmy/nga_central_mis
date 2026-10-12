import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const postMock = vi.fn();
vi.mock("../../services/api", () => ({ default: { post: (...a: any[]) => postMock(...a) } }));

import { requestAvatar, primeAvatars, getCachedAvatar, _resetAvatarDirectoryForTests } from "../avatarDirectory";
import UserAvatar from "../../components/ui/UserAvatar";

const A = (id: number) => ({
  version: 1,
  sm: `https://api.example/avatars/${id}/1/sm.webp?s=x`,
  md: `https://api.example/avatars/${id}/1/md.webp?s=x`,
  lg: `https://api.example/avatars/${id}/1/lg.webp?s=x`,
});
const answer = (ids: number[], withPhoto: number[]) => ({
  data: { data: { avatars: Object.fromEntries(ids.filter((i) => withPhoto.includes(i)).map((i) => [i, A(i)])) } },
});
const settle = () => act(() => new Promise((r) => setTimeout(r, 40)));

beforeEach(() => {
  _resetAvatarDirectoryForTests();
  postMock.mockReset();
});

describe("avatar directory", () => {
  it("collects every id asked for during a render into one request, without duplicates", async () => {
    postMock.mockImplementation(async (_url: string, body: any) => answer(body.user_ids, [1]));
    requestAvatar(1);
    requestAvatar(2);
    requestAvatar(1);
    requestAvatar(3);
    await settle();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith("/users/avatars/lookup", { user_ids: [1, 2, 3] });
    expect(getCachedAvatar(1)).toEqual(A(1));
    // No photo is remembered too, so they are not asked about again.
    expect(getCachedAvatar(2)).toBeNull();
    requestAvatar(2);
    await settle();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("ignores ids that are not user ids", async () => {
    requestAvatar(null);
    requestAvatar(undefined);
    requestAvatar(0);
    requestAvatar(-4);
    requestAvatar(1.5);
    await settle();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("splits large pages into requests of 500", async () => {
    postMock.mockImplementation(async (_url: string, body: any) => answer(body.user_ids, []));
    for (let i = 1; i <= 1001; i++) requestAvatar(i);
    await settle();
    expect(postMock.mock.calls.map((c) => c[1].user_ids.length)).toEqual([500, 500, 1]);
  });

  it("falls back to initials (no retry storm) when the lookup fails", async () => {
    postMock.mockRejectedValue(new Error("offline"));
    requestAvatar(9);
    await settle();
    expect(getCachedAvatar(9)).toBeNull();
    requestAvatar(9);
    await settle();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("primed photos are used without asking", async () => {
    primeAvatars([{ user_id: 5, avatar: A(5) }]);
    requestAvatar(5);
    await settle();
    expect(postMock).not.toHaveBeenCalled();
    expect(getCachedAvatar(5)).toEqual(A(5));
  });
});

describe("UserAvatar with a userId", () => {
  it("shows initials first, then the person's photo once looked up", async () => {
    postMock.mockImplementation(async (_url: string, body: any) => answer(body.user_ids, [7]));
    render(
      <>
        <UserAvatar userId={7} name="Jane Doe" size={32} />
        <UserAvatar userId={8} name="Eric Mugisha" size={32} />
      </>,
    );
    expect(screen.getByRole("img", { name: "Jane Doe" }).textContent).toBe("JD");
    await waitFor(() => expect(screen.getByRole("img", { name: "Jane Doe" }).tagName).toBe("IMG"));
    expect(screen.getByRole("img", { name: "Jane Doe" }).getAttribute("src")).toBe(A(7).sm);
    expect(screen.getByRole("img", { name: "Eric Mugisha" }).textContent).toBe("EM");
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't look anything up when the photo is already given", async () => {
    render(<UserAvatar userId={7} name="Jane Doe" avatar={A(7)} />);
    await settle();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("keeps the square look when asked", () => {
    render(<UserAvatar name="Jane Doe" shape="rounded" />);
    expect(screen.getByRole("img", { name: "Jane Doe" }).className).toContain("rounded-xl");
  });
});
