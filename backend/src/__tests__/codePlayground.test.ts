import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import app from "../app";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";
import { clearRunnerLanguageCache, mainFileFor } from "../services/codePlayground/relay";
import { resetPlaygroundRunLimit } from "../routes/codePlayground";

/**
 * Code Playground: lesson code runs on Task Mentor's code runner, relayed with
 * the user's own MIS token (a fake Task Mentor here).
 */

describe("mainFileFor", () => {
  it("names a Java file after its public class and others by language", () => {
    expect(mainFileFor("java", "public class Garage {\n public static void main(String[] a) {}\n}")).toBe("Garage.java");
    expect(mainFileFor("java", "class Hidden {}")).toBe("Main.java");
    expect(mainFileFor("python", "print(1)")).toBe("main.py");
    expect(mainFileFor("csharp", "")).toBe("Program.cs");
    // An Arduino sketch must be a .ino (the runner builds a sketch folder named after it).
    expect(mainFileFor("arduino", "void setup(){}")).toBe("sketch.ino");
  });
});

describe("/code-playground", () => {
  let stub: Server;
  let seenAuth: string | undefined;
  let seenBody: any;
  let mode: "ok" | "compile" | "401" | "429" | "down" = "ok";
  const sessionStarts: any[] = [];
  const sessionInputs: any[] = [];
  const sessionStops: string[] = [];
  let waitingForInput: ((name: string) => void) | null = null;
  let userId: number;
  const prev = process.env.HOME_APP_TASKMENTOR_URL;

  beforeAll(async () => {
    const fake = express();
    fake.use(express.json());
    fake.get("/api/integration/code/languages", (req, res) => {
      seenAuth = req.headers.authorization;
      res.json({ success: true, data: { interactive: true, languages: [{ key: "python", label: "Python", engine: "tmjudge" }, { key: "cpp", label: "C++", engine: "tmjudge" }] } });
    });
    // Live runs: a program that asks for a name, greets, exits.
    fake.post("/api/integration/code/sessions", (req, res) => {
      sessionStarts.push(req.body);
      res.status(201).json({ success: true, data: { id: "abc123def4567890" } });
    });
    fake.get("/api/integration/code/sessions/:id/events", (req, res) => {
      if (req.params.id !== "abc123def4567890") return res.status(404).json({ success: false, code: "SESSION_NOT_FOUND" });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('event: stage\ndata: {"name":"run"}\n\n');
      res.write('event: stdout\ndata: {"data":"Name? "}\n\n');
      waitingForInput = (name: string) => {
        res.write(`event: stdout\ndata: ${JSON.stringify({ data: `Hi ${name}` })}\n\n`);
        res.write('event: exit\ndata: {"code":0,"signal":null,"verdict":"ok","time_ms":5,"memory_kb":800}\n\n');
        res.end();
      };
    });
    fake.post("/api/integration/code/sessions/:id/input", (req, res) => {
      sessionInputs.push(req.body);
      if (typeof req.body.data === "string") waitingForInput?.(req.body.data.trim());
      res.status(204).end();
    });
    fake.delete("/api/integration/code/sessions/:id", (req, res) => {
      sessionStops.push(req.params.id);
      res.status(204).end();
    });
    fake.post("/api/integration/code/run", (req, res) => {
      seenAuth = req.headers.authorization;
      seenBody = req.body;
      if (mode === "401") return res.status(401).json({ success: false, code: "MIS_TOKEN_INVALID" });
      if (mode === "429") return res.status(429).json({ success: false, code: "RATE_LIMITED", message: "Too many code runs — wait a minute and try again." });
      if (mode === "down") return res.status(503).json({ success: false, code: "JUDGE_UNAVAILABLE", message: "The code runner is busy or offline." });
      if (mode === "compile") {
        return res.json({ success: true, data: { engine: "tmjudge", language: "cpp", compile: { ok: false, output: "main.cpp:1: error: expected ';'" }, tests: [] } });
      }
      res.json({
        success: true,
        data: {
          engine: "tmjudge",
          language: "python",
          compile: null,
          tests: [{ id: "run", verdict: "ok", passed: true, stdout: "Hello, Aline\n", stderr: null, exit_code: 0, time_ms: 12, memory_kb: 9000 }],
        },
      });
    });
    await new Promise<void>((resolve) => {
      stub = fake.listen(0, () => resolve());
    });
    process.env.HOME_APP_TASKMENTOR_URL = `http://127.0.0.1:${(stub.address() as any).port}`;
    userId = await createUser({ userType: "STUDENT" });
    await assignRole(userId, await createRoleWithPermissions("PLAYGROUND", ["CODE_PLAYGROUND_USE"]));
  });

  afterAll(async () => {
    process.env.HOME_APP_TASKMENTOR_URL = prev;
    await new Promise((r) => stub.close(r));
  });

  beforeEach(() => {
    mode = "ok";
    resetPlaygroundRunLimit();
    clearRunnerLanguageCache();
  });

  const token = () => signToken(userId);
  const run = (body: any) => request(app).post("/code-playground/run").set("Authorization", `Bearer ${token()}`).send(body);

  it("requires a session", async () => {
    expect((await request(app).post("/code-playground/run").send({})).status).toBe(401);
    expect((await request(app).get("/code-playground/languages")).status).toBe(401);
  });

  it("requires CODE_PLAYGROUND_USE", async () => {
    const without = await createUser({ userType: "STUDENT" });
    const auth = `Bearer ${signToken(without)}`;
    expect((await request(app).get("/code-playground/languages").set("Authorization", auth)).status).toBe(403);
    expect((await request(app).post("/code-playground/run").set("Authorization", auth).send({ language: "python", code: "print(1)" })).status).toBe(403);
  });

  it("lists the runner's languages with the user's own token", async () => {
    const sent = token();
    const res = await request(app).get("/code-playground/languages").set("Authorization", `Bearer ${sent}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: true, interactive: true, languages: [{ key: "python", label: "Python" }, { key: "cpp", label: "C++" }] });
    expect(seenAuth).toBe(`Bearer ${sent}`);
  });

  it("relays a run as one file plus the input and reshapes the answer", async () => {
    const res = await run({ language: "Python", code: "name = input()\nprint(f'Hello, {name}')", stdin: "Aline" });
    expect(res.status).toBe(200);
    expect(seenBody).toEqual({
      language: "python",
      entry: "main.py",
      files: [{ path: "main.py", content: "name = input()\nprint(f'Hello, {name}')" }],
      tests: [{ id: "run", input: "Aline" }],
    });
    expect(res.body.data).toMatchObject({ verdict: "ok", stdout: "Hello, Aline\n", stderr: "", exit_code: 0, time_ms: 12, engine: "tmjudge" });
  });

  it("relays a project: the main file under its own name and the other files", async () => {
    const res = await run({
      language: "php",
      code: "<?php require 'lib/maths.php'; echo twice(21);",
      entry: "index.php",
      files: [
        { path: "lib/maths.php", content: "<?php function twice($x) { return $x * 2; }" },
        { path: "style.css", content: "h1{}" },
      ],
    });
    expect(res.status).toBe(200);
    expect(seenBody.entry).toBe("index.php");
    expect(seenBody.files.map((f: any) => f.path)).toEqual(["index.php", "lib/maths.php", "style.css"]);
  });

  it("refuses bad project file names and duplicates", async () => {
    expect((await run({ language: "python", code: "x", entry: "../main.py" })).status).toBe(400);
    expect((await run({ language: "python", code: "x", entry: "main.py", files: [{ path: "main.py", content: "y" }] })).body.message).toMatch(/Two files/);
    expect((await run({ language: "python", code: "x", files: [{ path: "a/./b.py", content: "y" }] })).status).toBe(400);
    expect((await run({ language: "python", code: "x", files: Array.from({ length: 25 }, (_, i) => ({ path: `m${i}.py`, content: "" })) })).status).toBe(400);
  });

  it("reports a compile error with the compiler's output", async () => {
    mode = "compile";
    const res = await run({ language: "cpp", code: "int main() { return 0 }" });
    expect(res.body.data).toMatchObject({ verdict: "compile-error", compile_output: expect.stringContaining("expected ';'") });
  });

  it("checks the request before calling the runner", async () => {
    expect((await run({ language: "", code: "x" })).status).toBe(400);
    expect((await run({ language: "python", code: "   " })).status).toBe(400);
    expect((await run({ language: "python", code: "x".repeat(70 * 1024) })).status).toBe(413);
    expect((await run({ language: "python", code: "x", files: [{ path: "../etc/passwd", content: "x" }] })).status).toBe(400);
  });

  it("passes the runner's refusals on with a clear code", async () => {
    mode = "429";
    expect((await run({ language: "python", code: "print(1)" })).body).toMatchObject({ success: false, code: "RATE_LIMITED" });
    mode = "down";
    const down = await run({ language: "python", code: "print(1)" });
    expect(down.status).toBe(503);
    expect(down.body.code).toBe("JUDGE_UNAVAILABLE");
    mode = "401";
    expect((await run({ language: "python", code: "print(1)" })).body.code).toBe("SESSION_EXPIRED");
  });

  it("says when Task Mentor isn't connected instead of failing the page", async () => {
    const url = process.env.HOME_APP_TASKMENTOR_URL;
    delete process.env.HOME_APP_TASKMENTOR_URL;
    try {
      const langs = await request(app).get("/code-playground/languages").set("Authorization", `Bearer ${token()}`);
      expect(langs.body.data).toMatchObject({ available: false, languages: [], code: "RUNNER_NOT_CONNECTED" });
      expect((await run({ language: "python", code: "print(1)" })).status).toBe(503);
    } finally {
      process.env.HOME_APP_TASKMENTOR_URL = url;
    }
  });

  it("runs a program live: output streams, typed input reaches it", async () => {
    const auth = `Bearer ${token()}`;
    const start = await request(app).post("/code-playground/sessions").set("Authorization", auth).send({ language: "python", code: "n = input('Name? ')\nprint('Hi', n)", entry: "main.py", files: [{ path: "util.py", content: "" }] });
    expect(start.status).toBe(201);
    expect(start.body.data.id).toBe("abc123def4567890");
    expect(sessionStarts.at(-1)).toEqual({ language: "python", entry: "main.py", files: [{ path: "main.py", content: "n = input('Name? ')\nprint('Hi', n)" }, { path: "util.py", content: "" }] });
    const streamed = request(app)
      .get("/code-playground/sessions/abc123def4567890/events")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, cb) => {
        let text = "";
        res.on("data", (c: Buffer) => (text += c.toString()));
        res.on("end", () => cb(null, text));
      })
      .then((r) => r);
    await new Promise((r) => setTimeout(r, 200));
    expect((await request(app).post("/code-playground/sessions/abc123def4567890/input").set("Authorization", auth).send({ data: "Ada\n" })).status).toBe(204);
    const res = await streamed;
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["x-accel-buffering"]).toBe("no");
    expect(res.body).toContain('{"data":"Name? "}');
    expect(res.body).toContain("Hi Ada");
    expect(res.body).toContain("event: exit");
    expect(sessionInputs.at(-1)).toEqual({ data: "Ada\n" });
  });

  it("sends end of input and Ctrl+C, stops runs, and refuses bad session ids", async () => {
    const auth = `Bearer ${token()}`;
    expect((await request(app).post("/code-playground/sessions/abc123def4567890/input").set("Authorization", auth).send({ eof: true, signal: "SIGINT" })).status).toBe(204);
    expect(sessionInputs.at(-1)).toEqual({ eof: true, signal: "SIGINT" });
    expect((await request(app).post("/code-playground/sessions/abc123def4567890/input").set("Authorization", auth).send({})).status).toBe(400);
    expect((await request(app).post("/code-playground/sessions/..%2F..%2Fx/input").set("Authorization", auth).send({ data: "x" })).status).toBe(404);
    expect((await request(app).get("/code-playground/sessions/0000000000000000/events").set("Authorization", auth)).status).toBe(404);
    expect((await request(app).delete("/code-playground/sessions/abc123def4567890").set("Authorization", auth)).status).toBe(204);
    expect(sessionStops).toContain("abc123def4567890");
  });

  it("limits runs per user", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await run({ language: "python", code: "print(1)" })).status;
    expect(last).toBe(429);
  });
});

describe("CODE_PLAYGROUND_USE", () => {
  it("is a registered MIS capability every persona baseline carries", () => {
    expect(MIS_MANIFEST.capabilities.CODE_PLAYGROUND_USE).toMatchObject({ kind: "WRITE", domain: "CURRICULUM" });
    for (const key of ["teaching_staff", "support_staff", "student", "parent"]) {
      const preset = PRESETS.find((p) => p.key === key)!;
      expect(preset.caps.map((c) => (Array.isArray(c) ? c[0] : c))).toContain("CODE_PLAYGROUND_USE");
    }
  });

  it("migration 120 grants it to every role, once", async () => {
    const roleId = await createRoleWithPermissions("ANY_ROLE", []);
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    });
    try {
      const migration = fs.readFileSync(path.join(__dirname, "../../migrations/120_code_playground_use.sql"), "utf8");
      const count = async () => {
        const [[row]]: any = await conn.query(
          `SELECT (SELECT COUNT(*) FROM Role) AS roles,
                  (SELECT COUNT(*) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id WHERE p.name = 'CODE_PLAYGROUND_USE') AS grants,
                  (SELECT COUNT(*) FROM Permission WHERE name = 'CODE_PLAYGROUND_USE') AS perms`,
        );
        return row;
      };
      await conn.query(migration);
      const first = await count();
      expect(Number(first.perms)).toBe(1);
      expect(Number(first.grants)).toBe(Number(first.roles));
      const [[mine]]: any = await conn.query(
        "SELECT COUNT(*) AS n FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id WHERE p.name = 'CODE_PLAYGROUND_USE' AND rp.role_id = ?",
        [roleId],
      );
      expect(Number(mine.n)).toBe(1);
      await conn.query(migration);
      expect(await count()).toEqual(first);
    } finally {
      await conn.end();
    }
  });
});
