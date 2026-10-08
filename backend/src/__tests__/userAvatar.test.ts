import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";

import { installFakeFileServer } from "../test/fakeFileServer";

// The file-server isn't running under test -- an in-memory fake (test/fakeFileServer.ts).
const { store } = installFakeFileServer();

import app from "../app";
import storage from "../utils/fileServer";
import { createUser, signToken, createRoleWithPermissions, assignRole } from "../test/fixtures";
import { renderAvatar, parseAvatarCrop, AVATAR_SIZES } from "../services/avatar/image";
import { avatarSignature, avatarUrls, verifyAvatarSignature } from "../services/avatar/urls";

/** Solid-colour test picture; `split` paints the right half blue. */
async function picture(
  width: number,
  height: number,
  opts: { format?: "png" | "jpeg"; split?: boolean; orientation?: number } = {},
): Promise<Buffer> {
  const red = { r: 220, g: 30, b: 30 };
  let img = sharp({ create: { width, height, channels: 3, background: red } });
  if (opts.split) {
    const blue = await sharp({
      create: { width: Math.floor(width / 2), height, channels: 3, background: { r: 30, g: 30, b: 220 } },
    })
      .png()
      .toBuffer();
    img = img.composite([{ input: blue, left: width - Math.floor(width / 2), top: 0 }]);
  }
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  return opts.format === "jpeg" ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer();
}

async function dominant(buf: Buffer) {
  const { dominant } = await sharp(buf).stats();
  return dominant.b > dominant.r ? "blue" : "red";
}

const tick = () => new Promise((r) => setTimeout(r, 20));
/** Absolute avatar URL -> the path supertest can request. */
const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");

describe("avatar image pipeline", () => {
  it("renders three square WebP renditions at 64, 256 and 512 px", async () => {
    const out = await renderAvatar(await picture(1600, 900));
    for (const [name, px] of Object.entries(AVATAR_SIZES)) {
      const meta = await sharp(out[name as keyof typeof out]).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(px);
      expect(meta.height).toBe(px);
    }
    // Compressed: a 512 px rendition is a few KB, not hundreds.
    expect(out.lg.length).toBeLessThan(60 * 1024);
    expect(out.sm.length).toBeLessThan(out.lg.length);
  });

  it("applies the requested crop square", async () => {
    const src = await picture(400, 200, { split: true });
    const right = await renderAvatar(src, { x: 0.5, y: 0, width: 0.5, height: 1 });
    const left = await renderAvatar(src, { x: 0, y: 0, width: 0.5, height: 1 });
    expect(await dominant(right.md)).toBe("blue");
    expect(await dominant(left.md)).toBe("red");
  });

  it("crops in upright coordinates (EXIF orientation applied) and strips metadata", async () => {
    // Stored 400x200 (left red, right blue) with orientation 6 = shown rotated 90 degrees
    // clockwise: upright it is 200x400 with red on top, blue below.
    const src = await picture(400, 200, { format: "jpeg", split: true, orientation: 6 });
    const top = await renderAvatar(src, { x: 0, y: 0, width: 1, height: 0.5 });
    const bottom = await renderAvatar(src, { x: 0, y: 0.5, width: 1, height: 0.5 });
    expect(await dominant(top.md)).toBe("red");
    expect(await dominant(bottom.md)).toBe("blue");
    const meta = await sharp(top.lg).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("rejects files that are not pictures, and pictures that are too small", async () => {
    await expect(renderAvatar(Buffer.from("definitely not an image"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(renderAvatar(await picture(20, 20))).rejects.toMatchObject({ statusCode: 400 });
    await expect(renderAvatar(Buffer.alloc(0))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("validates the crop field", () => {
    expect(parseAvatarCrop(undefined)).toBeUndefined();
    expect(parseAvatarCrop("")).toBeUndefined();
    expect(parseAvatarCrop('{"x":0.1,"y":0.2,"width":0.5,"height":0.5}')).toEqual({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 });
    expect(() => parseAvatarCrop("{nope")).toThrow(/JSON/);
    expect(() => parseAvatarCrop('{"x":0.6,"y":0,"width":0.6,"height":0.5}')).toThrow(/inside/);
    expect(() => parseAvatarCrop('{"x":0,"y":0,"width":0,"height":0.5}')).toThrow(/inside/);
    expect(() => parseAvatarCrop('{"x":"a","y":0,"width":1,"height":1}')).toThrow(/numeric/);
  });
});

describe("avatar URL signing", () => {
  it("builds absolute, versioned, signed URLs for all sizes", () => {
    const urls = avatarUrls(42, 1790000000)!;
    expect(urls.version).toBe(1790000000);
    const sig = avatarSignature(42, 1790000000);
    expect(urls.sm).toMatch(new RegExp(`^https?://[^/]+/avatars/42/1790000000/sm\\.webp\\?s=${sig}$`));
    expect(urls.md).toContain("/md.webp?s=");
    expect(urls.lg).toContain("/lg.webp?s=");
    expect(avatarUrls(42, null)).toBeNull();
  });

  it("accepts only the signature for that user and version", () => {
    const sig = avatarSignature(42, 1790000000);
    expect(verifyAvatarSignature(42, 1790000000, sig)).toBe(true);
    expect(verifyAvatarSignature(43, 1790000000, sig)).toBe(false);
    expect(verifyAvatarSignature(42, 1790000001, sig)).toBe(false);
    expect(verifyAvatarSignature(42, 1790000000, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyAvatarSignature(42, 1790000000, undefined)).toBe(false);
    expect(verifyAvatarSignature(42, 1790000000, ["x"])).toBe(false);
  });
});

describe("profile picture API", () => {
  let userId: number;
  let token: string;
  let otherId: number;
  let otherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userId = await createUser({ userType: "STUDENT" });
    token = signToken(userId);
    otherId = await createUser({ userType: "TEACHER" });
    otherToken = signToken(otherId);
    const adminId = await createUser({ userType: "ADMIN" });
    adminToken = signToken(adminId);
    await assignRole(adminId, await createRoleWithPermissions("avatar_admin", ["MANAGE_USERS"]));
  });

  const uploadAs = (tkn: string, file: Buffer, crop?: object, url = "/users/me/avatar") => {
    const req = request(app).put(url).set("Authorization", `Bearer ${tkn}`);
    if (crop) req.field("crop", JSON.stringify(crop));
    return req.attach("avatar", file, { filename: "me.png", contentType: "image/png" });
  };

  it("starts with no picture", async () => {
    const res = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.avatar).toBeNull();
    expect(res.body.data.user.avatar_url).toBeNull();
  });

  it("uploads, resizes and serves a picture through signed URLs", async () => {
    const res = await uploadAs(token, await picture(800, 600, { split: true }), { x: 0.5, y: 0, width: 0.375, height: 0.5 });
    expect(res.status).toBe(200);
    const { avatar } = res.body.data;
    expect(avatar.version).toBeGreaterThan(0);
    for (const size of ["sm", "md", "lg"]) {
      expect(store.has(`avatars/${userId}/${avatar.version}-${size}.webp`)).toBe(true);
    }

    const img = await request(app).get(pathOf(avatar.sm)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect(img.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    // Versioned URL, so the real file-server stream is told to cache it for a year.
    expect(vi.mocked(storage.streamTo).mock.lastCall?.[2]).toMatchObject({ contentType: "image/webp", cacheSeconds: 31536000 });
    const meta = await sharp(img.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);
    expect(await dominant(img.body as Buffer)).toBe("blue");
  });

  it("refuses avatar URLs with a missing or forged signature, or a bad size", async () => {
    const { body } = await request(app).get("/users/me/avatar").set("Authorization", `Bearer ${token}`);
    const md: string = body.data.avatar.md;
    expect((await request(app).get(pathOf(md).replace(/\?s=.*/, ""))).status).toBe(404);
    expect((await request(app).get(pathOf(md).replace(/s=.*/, "s=AAAAAAAAAAAAAAAAAAAAAA"))).status).toBe(404);
    expect((await request(app).get(pathOf(md).replace("/md.webp", "/xl.webp"))).status).toBe(404);
    // Someone else's id with this user's signature.
    expect((await request(app).get(pathOf(md).replace(`/avatars/${userId}/`, `/avatars/${otherId}/`))).status).toBe(404);
  });

  it("shows the picture in every user payload the apps read", async () => {
    const me = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    const { avatar } = me.body.data;
    expect(avatar).toMatchObject({ version: expect.any(Number) });
    expect(me.body.data.user.avatar_url).toBe(avatar.md);

    const session = await request(app).get("/auth/session").set("Authorization", `Bearer ${token}`);
    expect(session.body.data.avatar).toEqual(avatar);
    expect(session.body.data.user.avatar_url).toBe(avatar.md);

    // Spoke apps poll this every minute or so.
    const verify = await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`);
    expect(verify.body.data.avatar).toEqual(avatar);

    const byId = await request(app).get(`/users/${userId}`).set("Authorization", `Bearer ${otherToken}`);
    expect(byId.body.data.avatar).toEqual(avatar);
  });

  it("replacing the picture gives a new version and retires the old files", async () => {
    const before = (await request(app).get("/users/me/avatar").set("Authorization", `Bearer ${token}`)).body.data.avatar;
    const res = await uploadAs(token, await picture(300, 300));
    expect(res.status).toBe(200);
    const after = res.body.data.avatar;
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.md).not.toBe(before.md);
    await tick();
    expect(store.has(`avatars/${userId}/${before.version}-md.webp`)).toBe(false);
    expect((await request(app).get(pathOf(before.md))).status).toBe(404);
    expect((await request(app).get(pathOf(after.md))).status).toBe(200);
  });

  it("rejects non-images, oversized files and a missing file", async () => {
    const notImage = await request(app)
      .put("/users/me/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.from("hello"), { filename: "x.png", contentType: "image/png" });
    expect(notImage.status).toBe(400);
    expect(notImage.body.message).toMatch(/picture/i);

    const pdf = await request(app)
      .put("/users/me/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(pdf.status).toBe(400);

    const huge = await request(app)
      .put("/users/me/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.alloc(10 * 1024 * 1024 + 1), { filename: "big.png", contentType: "image/png" });
    expect(huge.status).toBe(413);
    expect(huge.body.message).toMatch(/10 MB/);

    const none = await request(app).put("/users/me/avatar").set("Authorization", `Bearer ${token}`).field("crop", "");
    expect(none.status).toBe(400);

    const badCrop = await uploadAs(token, await picture(300, 300), { x: 0.9, y: 0, width: 0.5, height: 0.5 });
    expect(badCrop.status).toBe(400);
  });

  it("requires sign-in to upload", async () => {
    const res = await request(app).put("/users/me/avatar").attach("avatar", await picture(100, 100), "a.png");
    expect(res.status).toBe(401);
  });

  it("removes the picture", async () => {
    const { version } = (await request(app).get("/users/me/avatar").set("Authorization", `Bearer ${token}`)).body.data.avatar;
    const res = await request(app).delete("/users/me/avatar").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.avatar).toBeNull();
    await tick();
    expect(store.has(`avatars/${userId}/${version}-sm.webp`)).toBe(false);
    const me = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.data.avatar).toBeNull();
    expect(me.body.data.user.avatar_url).toBeNull();
    // Removing again is harmless.
    expect((await request(app).delete("/users/me/avatar").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });

  it("lets MANAGE_USERS set and remove someone else's picture, and nobody else", async () => {
    const denied = await uploadAs(otherToken, await picture(100, 100), undefined, `/users/${userId}/avatar`);
    expect(denied.status).toBe(403);

    const ok = await uploadAs(adminToken, await picture(100, 100), undefined, `/users/${userId}/avatar`);
    expect(ok.status).toBe(200);
    const me = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.data.avatar.version).toBe(ok.body.data.avatar.version);

    expect((await uploadAs(adminToken, await picture(100, 100), undefined, "/users/999999999/avatar")).status).toBe(404);
    expect((await uploadAs(adminToken, await picture(100, 100), undefined, "/users/abc/avatar")).status).toBe(400);

    const removed = await request(app).delete(`/users/${userId}/avatar`).set("Authorization", `Bearer ${adminToken}`);
    expect(removed.status).toBe(200);
    expect((await request(app).get("/users/me/avatar").set("Authorization", `Bearer ${token}`)).body.data.avatar).toBeNull();
  });
});
