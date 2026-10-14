import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

import app from "../app";
import { db } from "../db";
import { DocumentPermission, DocumentVersion } from "../db/schema";
import { eq } from "drizzle-orm";
import { createUser, signToken, createAcademicPeriod } from "../test/fixtures";
import storageService from "../utils/fileServer";

// Files live on the file server in production; here, in memory. Spied on the shared
// instance (not vi.mock): the suite runs with isolate: false, so the controller may
// already hold the real module when this file loads.
const files = new Map<string, Buffer>();
const stubStorage = () => {
  vi.spyOn(storageService, "uploadFile").mockImplementation(async (buffer: any, remotePath: string) => void files.set(remotePath, Buffer.from(buffer)));
  vi.spyOn(storageService, "fileExists").mockImplementation(async (remotePath: string) => files.has(remotePath));
  vi.spyOn(storageService, "deleteFile").mockImplementation(async (remotePath: string) => void files.delete(remotePath));
  vi.spyOn(storageService, "streamTo").mockImplementation(async (res: any, remotePath: string, opts: { contentType?: string } = {}) => {
    res.type(opts.contentType || "application/octet-stream").send(files.get(remotePath));
  });
};

// "Save to Documents" from the Code Playground: find the copy saved last time
// (same name, same place) and update it, keeping what it held as a version.
describe("Documents — saving code (find by name, replace content)", () => {
  let owner: number;
  let ownerToken: string;
  let otherToken: string;
  let viewerToken: string;
  let editorToken: string;
  let viewer: number;
  let editor: number;
  let yearId: number;
  let otherYearId: number;
  let folderId: number;
  let rootDocId: number;
  let folderDocId: number;

  const upload = (token: string, name: string, content: string, fields: Record<string, string>) => {
    let r = request(app).post("/documents/upload").set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach("file", Buffer.from(content), { filename: name, contentType: "text/x-python" });
  };
  const download = (token: string, id: number) =>
    request(app)
      .get(`/documents/${id}/download`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
      });

  afterAll(() => vi.restoreAllMocks());

  beforeAll(async () => {
    stubStorage();
    ({ academicYearId: yearId } = await createAcademicPeriod());
    ({ academicYearId: otherYearId } = await createAcademicPeriod());
    owner = await createUser({ userType: "STUDENT" });
    ownerToken = signToken(owner);
    otherToken = signToken(await createUser({ userType: "STUDENT" }));
    viewer = await createUser({ userType: "STUDENT" });
    viewerToken = signToken(viewer);
    editor = await createUser({ userType: "TEACHER" });
    editorToken = signToken(editor);

    const folder = await request(app).post("/documents/folders").set("Authorization", `Bearer ${ownerToken}`).send({ name: "Code", academicYearId: yearId });
    expect(folder.status).toBe(200);
    folderId = folder.body.data.folder_id;

    const a = await upload(ownerToken, "main.py", 'print("v1")\n', { academicYearId: String(yearId) });
    expect(a.status).toBe(200);
    rootDocId = a.body.data.document_id;
    const b = await upload(ownerToken, "main.py", 'print("in folder")\n', { folderId: String(folderId) });
    expect(b.status).toBe(200);
    folderDocId = b.body.data.document_id;

    await db.insert(DocumentPermission).values([
      { document_id: rootDocId, user_id: viewer, permission_type: "VIEW", shared_by: owner },
      { document_id: rootDocId, user_id: editor, permission_type: "EDIT", shared_by: owner },
    ] as any);
  });

  describe("GET /documents/find", () => {
    const find = (token: string, q: Record<string, string | number>) => request(app).get("/documents/find").query(q).set("Authorization", `Bearer ${token}`);

    it("finds the caller's document by exact name at the root of an academic year", async () => {
      const r = await find(ownerToken, { name: "main.py", academicYearId: yearId });
      expect(r.status).toBe(200);
      expect(r.body.data.document_id).toBe(rootDocId);
    });
    it("finds it in a folder, and tells root and folder apart", async () => {
      const r = await find(ownerToken, { name: "main.py", folderId });
      expect(r.body.data.document_id).toBe(folderDocId);
    });
    it("returns null for another year, another name or another person", async () => {
      expect((await find(ownerToken, { name: "main.py", academicYearId: otherYearId })).body.data).toBeNull();
      expect((await find(ownerToken, { name: "Main.java", academicYearId: yearId })).body.data).toBeNull();
      expect((await find(otherToken, { name: "main.py", academicYearId: yearId })).body.data).toBeNull();
    });
    it("refuses a missing name or bad ids", async () => {
      expect((await find(ownerToken, {})).status).toBe(400);
      expect((await find(ownerToken, { name: "x", folderId: "abc" })).status).toBe(400);
      expect((await find(ownerToken, { name: "x".repeat(256) })).status).toBe(400);
    });
    it("needs a signed-in user", async () => {
      expect((await request(app).get("/documents/find").query({ name: "main.py" })).status).toBe(401);
    });
  });

  describe("PUT /documents/:id/content", () => {
    const replace = (token: string, id: number | string, content?: string) => {
      const r = request(app).put(`/documents/${id}/content`).set("Authorization", `Bearer ${token}`).field("changeDescription", "Saved from the Code Playground");
      return content === undefined ? r : r.attach("file", Buffer.from(content), { filename: "main.py", contentType: "text/x-python" });
    };

    it("replaces what the document holds and keeps the old content as a version", async () => {
      const before = await download(ownerToken, rootDocId);
      expect(before.body).toBe('print("v1")\n');

      const r = await replace(ownerToken, rootDocId, 'print("v2")\n');
      expect(r.status).toBe(200);
      expect(r.body.data.previous_version).toBe(1);
      expect(r.body.data.original_name).toBe("main.py");
      expect(r.body.data.file_size).toBe(Buffer.byteLength('print("v2")\n'));

      expect((await download(ownerToken, rootDocId)).body).toBe('print("v2")\n');

      const versions = await request(app).get(`/documents/${rootDocId}/versions`).set("Authorization", `Bearer ${ownerToken}`);
      expect(versions.status).toBe(200);
      const list = versions.body.data as { version_number: number; file_path: string; change_description: string }[];
      expect(list.map((v) => v.version_number)).toContain(1);
      const v1 = list.find((v) => v.version_number === 1)!;
      expect(files.get(v1.file_path)?.toString()).toBe('print("v1")\n');
      expect(v1.change_description).toBe("Saved from the Code Playground");
    });

    it("numbers the next save as the next version", async () => {
      const r = await replace(ownerToken, rootDocId, 'print("v3")\n');
      expect(r.body.data.previous_version).toBe(2);
      expect((await download(ownerToken, rootDocId)).body).toBe('print("v3")\n');
    });

    it("lets someone it is shared with for editing save, but not a viewer or a stranger", async () => {
      expect((await replace(editorToken, rootDocId, 'print("by editor")\n')).status).toBe(200);
      expect((await download(ownerToken, rootDocId)).body).toBe('print("by editor")\n');
      expect((await replace(viewerToken, rootDocId, "x")).status).toBe(403);
      expect((await replace(otherToken, rootDocId, "x")).status).toBe(404);
      expect((await download(ownerToken, rootDocId)).body).toBe('print("by editor")\n');
    });

    it("deleting a document removes its earlier versions and their files", async () => {
      const a = await upload(ownerToken, "gone.py", "v1", { academicYearId: String(yearId) });
      const id = a.body.data.document_id;
      await replace(ownerToken, id, "v2");
      const [v] = await db.select().from(DocumentVersion).where(eq(DocumentVersion.document_id, id));
      expect(files.has(v.file_path)).toBe(true);
      const del = await request(app).delete(`/documents/${id}`).set("Authorization", `Bearer ${ownerToken}`);
      expect(del.status).toBe(200);
      expect(await db.select().from(DocumentVersion).where(eq(DocumentVersion.document_id, id))).toHaveLength(0);
      expect(files.has(v.file_path)).toBe(false);
    });

    it("deleting a folder removes its documents' versions and their files", async () => {
      const f = await request(app).post("/documents/folders").set("Authorization", `Bearer ${ownerToken}`).send({ name: "Temp", academicYearId: yearId });
      const fid = f.body.data.folder_id;
      const a = await upload(ownerToken, "in-folder.py", "v1", { folderId: String(fid) });
      const id = a.body.data.document_id;
      await replace(ownerToken, id, "v2");
      const [v] = await db.select().from(DocumentVersion).where(eq(DocumentVersion.document_id, id));
      const del = await request(app).delete(`/documents/folders/${fid}`).set("Authorization", `Bearer ${ownerToken}`);
      expect(del.status).toBe(200);
      expect(await db.select().from(DocumentVersion).where(eq(DocumentVersion.document_id, id))).toHaveLength(0);
      expect(files.has(v.file_path)).toBe(false);
    });

    it("refuses no file, a bad id or an unknown document", async () => {
      expect((await replace(ownerToken, rootDocId)).status).toBe(400);
      expect((await replace(ownerToken, "abc", "x")).status).toBe(400);
      expect((await replace(ownerToken, 999999999, "x")).status).toBe(404);
    });
  });
});
