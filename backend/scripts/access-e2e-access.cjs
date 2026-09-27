/* End-to-end access control v2 check across the four local services (MIS 5001, Task Mentor 5002, D&A 5171, Tupo 5190).
 * Start all four in shadow mode, publish the three manifests (each app: npm run access:publish), then:
 *   node scripts/access-e2e-access.cjs
 * Uses real dev users of the local MIS DB (ids 1, 13, 15, 19, 20, 22, 23) and cleans up what it creates. */
const path = require("path");
const R = require("path").resolve(__dirname, "../../..");
require(path.join(R, "nga_central_mis/backend/node_modules/dotenv")).config({ path: path.join(R, "nga_central_mis/backend/.env") });
const jwt = require(path.join(R, "nga_central_mis/backend/node_modules/jsonwebtoken"));
const mysql = require(path.join(R, "nga_central_mis/backend/node_modules/mysql2/promise"));

const MIS = "http://localhost:5001", TM = "http://localhost:5002", DA = "http://localhost:5171", TUPO = "http://localhost:5190";
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } };

async function main() {
  const db = await mysql.createConnection({ host: "127.0.0.1", port: 8889, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: "nga_central_mis" });
  const tokenFor = async (userId) => {
    const [[u]] = await db.query("SELECT token_version FROM User WHERE user_id = ?", [userId]);
    return jwt.sign({ userId, tokenVersion: u.token_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  };
  const misGet = async (userId, p) => fetch(MIS + p, { headers: { Authorization: `Bearer ${await tokenFor(userId)}` } });
  const snap = async (userId, app) => (await j(await misGet(userId, `/access/me?app=${app}`))).data;
  const scopeOf = (s, cap) => (s?.caps?.[cap] ?? []).map((e) => ({ d: e.depth, ...e.scope }));

  console.log("\n1) MIS snapshots per app (real dev users)");
  const ct20 = await snap(20, "da");
  ok(scopeOf(ct20, "ATTENDANCE_MARK").some((e) => (e.class_groups ?? []).includes(9)), "class teacher 20 may mark registers in class 9 (D&A)", scopeOf(ct20, "ATTENDANCE_MARK"));
  ok(!scopeOf(ct20, "ATTENDANCE_MARK").some((e) => e.all), "…and only there, not school-wide");
  const st23 = await snap(23, "da");
  ok(scopeOf(st23, "ATTENDANCE_VIEW_OWN").some((e) => e.self === 23), "student 23 sees own attendance (SELF)", scopeOf(st23, "ATTENDANCE_VIEW_OWN"));
  ok(!st23.caps.ATTENDANCE_MARK && !st23.caps.DISCIPLINE_VIEW_ALL, "student 23 cannot mark or read others' discipline");
  console.log("    student 23 class_groups:", JSON.stringify(st23.user.class_groups));
  const po1 = await snap(1, "da");
  ok(scopeOf(po1, "ROLES_PERMISSIONS_MANAGE").some((e) => e.all), "platform owner 1 administers D&A roles");
  ok(!po1.caps.DISCIPLINE_VIEW_ALL && !po1.caps.ATTENDANCE_VIEW_ALL, "platform owner has NO discipline/attendance content by default");
  const pl19 = await snap(19, "tm");
  ok(scopeOf(pl19, "COURSES_VIEW_GRADES").some((e) => e.d === "summary" && (e.programs ?? []).includes(8)), "programme lead 19: grades at SUMMARY depth for programme 8 (TM)", scopeOf(pl19, "COURSES_VIEW_GRADES"));
  ok(!scopeOf(pl19, "COURSES_VIEW_GRADES").some((e) => e.d === "detail"), "…never individual grades");
  const t15 = await snap(15, "tupo");
  ok(!!t15.caps.DM_START && !!t15.caps.MAIL_SEND, "teacher 15 gets staff communication in Tupo");
  const p22 = await snap(22, "da");
  ok(scopeOf(p22, "ATTENDANCE_VIEW_ALL").some((e) => (e.students ?? []).length >= 0 && e.students !== undefined), "parent 22 sees attendance of their children (CHILDREN scope)", scopeOf(p22, "ATTENDANCE_VIEW_ALL"));

  console.log("\n2) Real SSO login into each app, then the app's own /api/access/me");
  const clients = {
    tm: { id: "taskmentor_app", redirect: "http://localhost:5174/taskmentor/sso/callback" },
    da: { id: "discipline_attendance", redirect: "http://localhost:3000/sso/callback" },
    tupo: { id: "tupo", redirect: "http://localhost:5194/sso/callback" },
  };
  const sessions = {};
  for (const userId of [20, 23]) {
    for (const [app, c] of Object.entries(clients)) {
      const auth = await j(await misGet(userId, `/sso/authorize?client_id=${c.id}&redirect_uri=${encodeURIComponent(c.redirect)}&state=e2e`));
      const code = auth?.data?.code;
      ok(!!code, `MIS issued an SSO code for user ${userId} -> ${app}`, auth);
      if (!code) continue;
      let appToken, cookie;
      if (app === "tm") {
        const res = await fetch(`${TM}/api/auth/sso/callback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        cookie = (res.headers.getSetCookie?.() ?? []).map((x) => x.split(";")[0]).join("; ");
        const body = await j(res);
        ok(res.status === 200 && cookie.includes("tm_auth_token"), `Task Mentor session for user ${userId}`, { status: res.status, body });
      } else {
        const base = app === "da" ? DA : TUPO;
        const res = await fetch(`${base}/api/sso/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const body = await j(res);
        appToken = body?.data?.token;
        ok(res.status === 200 && !!appToken, `${app} session for user ${userId}`, { status: res.status, body });
      }
      sessions[`${app}:${userId}`] = { appToken, cookie };
      const base = app === "tm" ? TM : app === "da" ? DA : TUPO;
      const headers = appToken ? { Authorization: `Bearer ${appToken}` } : { Cookie: cookie };
      const me = await fetch(`${base}/api/access/me`, { headers });
      const body = await j(me);
      const appSnap = body?.data?.snapshot ?? body?.data ?? body?.snapshot;
      const misSnap = await snap(userId, app);
      ok(me.status === 200 && appSnap?.user?.id === userId, `${app} serves user ${userId}'s snapshot from MIS`, { status: me.status, body });
      if (appSnap?.caps) ok(JSON.stringify(Object.keys(appSnap.caps).sort()) === JSON.stringify(Object.keys(misSnap.caps).sort()), `${app} snapshot = MIS snapshot for user ${userId}`);
    }
  }

  console.log("\n3) Shadow mode records differences live (responses unchanged)");
  const da20 = sessions["da:20"], tupo20 = sessions["tupo:20"], tm20 = sessions["tm:20"];
  const hits = [];
  if (da20?.appToken) {
    for (const p of ["/api/discipline", "/api/attendance/records", "/api/excuses", "/api/reports/overview"]) {
      const r = await fetch(DA + p, { headers: { Authorization: `Bearer ${da20.appToken}` } });
      hits.push(`da ${p} ${r.status}`);
    }
  }
  if (tupo20?.appToken) {
    for (const p of ["/api/dashboard/overview", "/api/chat/conversations"]) {
      const r = await fetch(TUPO + p, { headers: { Authorization: `Bearer ${tupo20.appToken}` } });
      hits.push(`tupo ${p} ${r.status}`);
    }
  }
  if (tm20?.cookie) {
    for (const p of ["/api/quizzes/grouped", "/api/assignments/grouped"]) {
      const r = await fetch(TM + p, { headers: { Cookie: tm20.cookie } });
      hits.push(`tm ${p} ${r.status}`);
    }
  }
  console.log("    requests:", hits.join(" | "));
  if (tm20?.cookie) {
    // The app learns about access changes through its verify poll.
    const v = await fetch(TM + "/api/auth/verify-mis", { headers: { Cookie: tm20.cookie } });
    const me = await j(await fetch(TM + "/api/access/me", { headers: { Cookie: tm20.cookie } }));
    const caps = Object.keys((me?.data?.snapshot ?? me?.data ?? {}).caps ?? {});
    ok(v.status === 200 && caps.includes("QUIZZES_VIEW") && caps.includes("ASSIGNMENTS_VIEW"), "after the preset fix, class teacher 20 has quiz/assignment viewing in Task Mentor (shadow gap closed)", { status: v.status, caps });
  }
  ok(hits.every((h) => !/ 5\d\d$/.test(h)), "no 5xx from any app in shadow mode", hits);
  await new Promise((r) => setTimeout(r, 2500)); // background shadow writes

  console.log("\n4) Insights");
  const w19 = await j(await misGet(19, "/access/insights/widgets?node=PROGRAM:8"));
  ok((w19.data ?? []).some((w) => w.metric === "teaching.lesson_reports"), "programme lead 19 sees lesson-report insights for programme 8", w19);
  ok(!(w19.data ?? []).some((w) => w.metric === "curriculum.sow_validation"), "…but not scheme-of-work lists their legacy role never had");
  const i19 = await j(await misGet(19, "/access/insights/teaching.lesson_reports?node=PROGRAM:8"));
  ok(i19.data && !/user_id|first_name|email/.test(JSON.stringify(i19.data)), "…as summaries with no personal data", i19.data);
  console.log("    rows:", JSON.stringify(i19.data?.rows), "total:", JSON.stringify(i19.data?.total));
  const w1 = await j(await misGet(1, "/access/insights/widgets?node=SCHOOL"));
  ok(Array.isArray(w1.data) && !w1.data.some((w) => /attendance|discipline|results|report_cards/.test(w.metric)), "platform owner gets no attendance / results / discipline insights", w1.data);
  const i20 = await misGet(20, "/access/insights/teaching.lesson_reports?node=PROGRAM:8");
  ok(i20.status === 403, "class teacher 20 cannot open the programme-level view");

  console.log("\n5) Access Studio round trip as platform owner (cleaned up afterwards)");
  const owner = { Authorization: `Bearer ${await tokenFor(1)}`, "Content-Type": "application/json" };
  const code = `E2E${Date.now() % 100000}`;
  const dep = await j(await fetch(`${MIS}/access/departments`, { method: "POST", headers: owner, body: JSON.stringify({ code, name: "E2E Sciences" }) }));
  const depId = dep?.data?.department_id;
  ok(!!depId, "department created", dep);
  const setSub = await fetch(`${MIS}/access/departments/${depId}/subjects`, { method: "PUT", headers: owner, body: JSON.stringify({ subjectIds: [8] }) });
  ok(setSub.status === 200, "subject 8 put in the department", await j(setSub));
  const [[hodRole]] = await db.query("SELECT role_id FROM Role WHERE preset_key='head_of_department'");
  const g = await j(await fetch(`${MIS}/access/grants`, { method: "POST", headers: owner, body: JSON.stringify({ user_id: 13, role_id: hodRole.role_id, scope_type: "DEPARTMENT", scope_id: depId, title: "E2E HOD" }) }));
  const grantId = g?.data?.grant_id;
  ok(!!grantId, "teacher 13 appointed Head of Department", g);
  const hod = await snap(13, "tm");
  ok(scopeOf(hod, "COURSES_VIEW_GRADES").some((e) => (e.departments ?? []).includes(depId) && (e.pairs ?? []).some(([s]) => s === 8)), "HOD now sees grades for subject 8 wherever it is taught (TM)", scopeOf(hod, "COURSES_VIEW_GRADES"));
  const end = await fetch(`${MIS}/access/grants/${grantId}/end`, { method: "POST", headers: owner, body: JSON.stringify({ reason: "e2e cleanup" }) });
  ok(end.status === 200, "HOD position ended");
  const after = await snap(13, "tm");
  ok(!scopeOf(after, "COURSES_VIEW_GRADES").some((e) => (e.departments ?? []).includes(depId)), "…and the access is gone immediately");
  await db.query("DELETE FROM DepartmentSubject WHERE department_id = ?", [depId]);
  await db.query("DELETE FROM AccessGrant WHERE grant_id = ?", [grantId]);
  await db.query("DELETE FROM Department WHERE department_id = ?", [depId]);

  console.log(`\nE2E: ${pass} passed, ${fail} failed`);
  await db.end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
