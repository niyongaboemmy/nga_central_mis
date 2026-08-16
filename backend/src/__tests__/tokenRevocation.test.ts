import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import { db } from "../db";
import { User } from "../db/schema";
import { eq } from "drizzle-orm";
import { createUser, signToken } from "../test/fixtures";

describe("Logout-triggered token revocation", () => {
  it("accepts a token with no tokenVersion claim while the user's version is still 0", async () => {
    const userId = await createUser();
    const token = signToken(userId); // fixtures.signToken omits tokenVersion entirely

    const res = await request(app)
      .get("/auth/verify")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("rejects a still-unexpired token once /auth/logout bumps the user's token_version", async () => {
    const userId = await createUser();
    const token = jwt.sign(
      { userId, tokenVersion: 0 },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );

    // Sanity check: valid before logout.
    const before = await request(app)
      .get("/auth/verify")
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Same token, same signature, still inside its 1h expiry -- but the
    // version it was signed with no longer matches.
    const after = await request(app)
      .get("/auth/verify")
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it("accepts a freshly issued token carrying the post-logout version", async () => {
    const userId = await createUser();

    await db
      .update(User)
      .set({ token_version: 3 })
      .where(eq(User.user_id, userId));

    const staleToken = jwt.sign(
      { userId, tokenVersion: 2 },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    const freshToken = jwt.sign(
      { userId, tokenVersion: 3 },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );

    const staleRes = await request(app)
      .get("/auth/verify")
      .set("Authorization", `Bearer ${staleToken}`);
    expect(staleRes.status).toBe(401);

    const freshRes = await request(app)
      .get("/auth/verify")
      .set("Authorization", `Bearer ${freshToken}`);
    expect(freshRes.status).toBe(200);
  });
});
