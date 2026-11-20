import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { School } from "../db/schema";
import storageService from "../utils/fileServer";
import { installFakeFileServer } from "../test/fakeFileServer";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { isServableLogo, readSchoolBody, sniffImage } from "../controllers/schoolController";

/**
 * School records (Tenants & Schools): validation, duplicate checks, the
 * last-active guard, and logos -- uploaded only through POST /:id/logo (a Save
 * must never overwrite a logo path; that is how NGA's logo became "uploaded"),
 * byte-checked, removable, and never a 500 when the file is gone.
 */
installFakeFileServer();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const stamp = Date.now() % 1_000_000;
let admin: number, teacher: number;
const created: number[] = [];
let originals: any[] = [];

const auth = (u: number) => ({ Authorization: `Bearer ${signToken(u)}` });

beforeAll(async () => {
  admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, await createRoleWithPermissions(`schools_mgmt_${stamp}`, ["MANAGE_SCHOOLS"]));
  teacher = await createUser({ userType: "TEACHER" });
  originals = await db.select().from(School);
  if (!originals.some((s: any) => s.status === "ACTIVE")) {
    const [r]: any = await db.insert(School).values({ name: `Base School ${stamp}`, status: "ACTIVE" } as any);
    created.push(Number(r.insertId));
    originals = await db.select().from(School);
  }
});

afterAll(async () => {
  if (created.length) await db.delete(School).where(inArray(School.school_id, created));
  for (const o of originals) {
    await db.update(School).set({ status: o.status, logo: o.logo, name: o.name } as any).where(eq(School.school_id, o.school_id));
  }
});

describe("readSchoolBody / sniffImage / isServableLogo", () => {
  it("validates and trims, and ignores logo fields", () => {
    const { values, errors } = readSchoolBody(
      { name: "  Green  Valley ", contact_email: "bad", contact_phone: "12", school_code: "a b", logo: "uploaded", status: "NOPE" },
      true,
    );
    expect(values.name).toBe("Green Valley");
    expect(values).not.toHaveProperty("logo");
    expect(Object.keys(errors).sort()).toEqual(["contact_email", "contact_phone", "school_code", "status"]);
    expect(readSchoolBody({}, true).errors.name).toBe("is required");
    expect(readSchoolBody({ contact_phone: "+250 788 545 664" }, false).errors).toEqual({});
  });

  it("knows real images from renamed files and unsafe SVGs", () => {
    expect(sniffImage(PNG)).toMatchObject({ ext: ".png" });
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toMatchObject({ ext: ".jpg" });
    expect(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))).toMatchObject({ ext: ".svg" });
    expect(sniffImage(Buffer.from('<svg onload="alert(1)"></svg>'))).toHaveProperty("error");
    expect(sniffImage(Buffer.from("<svg><script>alert(1)</script></svg>"))).toHaveProperty("error");
    expect(sniffImage(Buffer.from("MZ not an image"))).toHaveProperty("error");
  });

  it("only treats real paths and URLs as logos", () => {
    expect(isServableLogo("schools/1/logo-primary-1794404100464.png")).toBe(true);
    expect(isServableLogo("https://cdn.example.org/logo.png")).toBe(true);
    expect(isServableLogo("uploaded")).toBe(false);
    expect(isServableLogo("../etc/passwd.png")).toBe(false);
    expect(isServableLogo(null)).toBe(false);
  });
});

describe("school records", () => {
  let id: number;

  it("needs MANAGE_SCHOOLS and validates input", async () => {
    expect((await request(app).post("/schools").set(auth(teacher)).send({ name: "X school" })).status).toBe(403);
    const bad = await request(app).post("/schools").set(auth(admin)).send({ name: "", contact_email: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveProperty("name");
    const ok = await request(app)
      .post("/schools")
      .set(auth(admin))
      .send({ name: `Campus ${stamp}`, school_code: `C${stamp}`, contact_phone: "+250 788 000 000", logo: "uploaded" });
    expect(ok.status).toBe(201);
    id = ok.body.data.school_id;
    created.push(id);
    expect(ok.body.data.logo).toBeNull();
  });

  it("refuses duplicate names and codes without regard to case", async () => {
    const dupName = await request(app).post("/schools").set(auth(admin)).send({ name: `campus ${stamp}` });
    expect(dupName.status).toBe(409);
    expect(dupName.body.field).toBe("name");
    const dupCode = await request(app).post("/schools").set(auth(admin)).send({ name: `Other ${stamp}`, school_code: `c${stamp}` });
    expect(dupCode.status).toBe(409);
    expect(dupCode.body.field).toBe("school_code");
    // Saving a school with its own name is not a clash.
    expect((await request(app).put(`/schools/${id}`).set(auth(admin)).send({ name: `Campus ${stamp}` })).status).toBe(200);
  });

  it("keeps the logo when the form is saved, and serves it with a version", async () => {
    const up = await request(app).post(`/schools/${id}/logo`).set(auth(admin)).field("slot", "primary").attach("file", PNG, "logo.png");
    expect(up.status).toBe(200);
    const path = up.body.path;
    expect(path).toMatch(/^schools\/\d+\/logo-primary-\d+\.png$/);
    expect(up.body.data.logo_version).toEqual(expect.any(Number));

    // The old form sent its placeholder back; the server now ignores logo fields.
    const save = await request(app).put(`/schools/${id}`).set(auth(admin)).send({ name: `Campus ${stamp}`, logo: "uploaded" });
    expect(save.status).toBe(200);
    const [row] = await db.select().from(School).where(eq(School.school_id, id));
    expect(row.logo).toBe(path);

    const img = await request(app).get(`/schools/${id}/logo/primary?v=1`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("refuses files that aren't images, and unsafe SVGs", async () => {
    const fake = await request(app).post(`/schools/${id}/logo`).set(auth(admin)).field("slot", "primary").attach("file", Buffer.from("not really"), "x.png");
    expect(fake.status).toBe(400);
    const svg = await request(app)
      .post(`/schools/${id}/logo`)
      .set(auth(admin))
      .field("slot", "partner")
      .attach("file", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "x.svg");
    expect(svg.status).toBe(400);
    const wrongType = await request(app).post(`/schools/${id}/logo`).set(auth(admin)).field("slot", "primary").attach("file", PNG, "x.exe");
    expect(wrongType.status).toBe(400);
    const badSlot = await request(app).post(`/schools/${id}/logo`).set(auth(admin)).field("slot", "banner").attach("file", PNG, "x.png");
    expect(badSlot.status).toBe(400);
  });

  it("answers 404, not 500, for a broken or missing logo, and can remove one", async () => {
    await db.update(School).set({ partner_logo: "uploaded" } as any).where(eq(School.school_id, id));
    expect((await request(app).get(`/schools/${id}/logo/partner`)).status).toBe(404);
    const list = await request(app).get("/schools").set(auth(admin));
    expect(list.body.find((s: any) => s.school_id === id).partner_logo).toBeNull();

    const spy = vi.spyOn(storageService, "downloadToBuffer").mockRejectedValueOnce(new Error("Failed to download file: 404"));
    expect((await request(app).get(`/schools/${id}/logo/primary`)).status).toBe(404);
    spy.mockRestore();

    const removed = await request(app).delete(`/schools/${id}/logo/primary`).set(auth(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.data.logo).toBeNull();
    expect((await request(app).delete(`/schools/${id}/logo/primary`).set(auth(teacher))).status).toBe(403);
  });

  it("never deactivates the last active school record", async () => {
    const all = await db.select().from(School);
    const others = all.filter((s: any) => s.school_id !== id && s.status === "ACTIVE");
    // Leave only our new record active.
    for (const o of others) await db.update(School).set({ status: "INACTIVE" } as any).where(eq(School.school_id, o.school_id));
    try {
      const del = await request(app).delete(`/schools/${id}`).set(auth(admin));
      expect(del.status).toBe(409);
      const put = await request(app).put(`/schools/${id}`).set(auth(admin)).send({ status: "SUSPENDED" });
      expect(put.status).toBe(409);
      // With another active record it may go.
      if (others[0]) {
        await db.update(School).set({ status: "ACTIVE" } as any).where(eq(School.school_id, others[0].school_id));
        expect((await request(app).delete(`/schools/${id}`).set(auth(admin))).status).toBe(200);
        expect((await request(app).put(`/schools/${id}`).set(auth(admin)).send({ status: "ACTIVE" })).status).toBe(200);
      }
    } finally {
      for (const o of others) await db.update(School).set({ status: "ACTIVE" } as any).where(eq(School.school_id, o.school_id));
    }
  });
});
