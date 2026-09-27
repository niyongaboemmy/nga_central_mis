# @nga/access — integrating an app with access control v2

Central MIS decides **who** holds **which role**, **where** in the school, and
**until when**. Each app decides **what** its capabilities are and checks them.
This package is the shared decision core both sides use, so a decision is
identical wherever it is made.

Plan: `nga_central_mis/ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`.

## 1. Vendor the core

```bash
node nga_central_mis/packages/access/sync.mjs <your-app>/server/src/vendor/nga-access
```

This writes `index.ts` (with a `sha256:` provenance header) and
`decision-table.json`. **Never edit the copy**; re-run the sync script.
Add a test that runs `decision-table.json` against your copy. The MIS test
`backend/src/__tests__/accessCore.test.ts` shows how in about 20 lines.

## 2. Declare your capabilities (the only access code that needs a deploy)

```ts
// server/src/access/manifest.ts
import { defineManifest } from "../vendor/nga-access";
export default defineManifest({
  app: "da",                        // mis | tm | da | tupo
  name: "Discipline & Attendance",
  version: "2026.10.01",
  capabilities: {
    ATTENDANCE_MARK: { label: "Mark registers", domain: "ATTENDANCE", kind: "WRITE" },
    ATTENDANCE_VIEW: { label: "View attendance", domain: "ATTENDANCE", kind: "READ", depths: ["summary", "detail"] },
    DISCIPLINE_VIEW: { label: "View discipline", domain: "DISCIPLINE", kind: "READ",
                       depths: ["summary", "detail", "sensitive"], restricted: ["sensitive"] },
  },
  insights: { "attendance.rate": { label: "Attendance rate", capability: "ATTENDANCE_VIEW", minDepth: "summary", levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP"] } },
  aliases: { ATTENDANCE_VIEW_ALL: "ATTENDANCE_VIEW" },   // legacy key -> capability
});
```

- **Keys:** use `UPPER_SNAKE`. Keep your existing permission keys where you can.
- **Kinds:**
  - `READ` capabilities declare the depths they distinguish.
    - `summary`: aggregates at class level or above only, never names.
    - `detail`: individual records.
    - `sensitive`: restricted fields.
  - `WRITE` capabilities have no depths.
- **Validation:** `validateManifest(manifest)` must return `[]`. Put that in a test.

## 3. Publish it on deploy

```bash
curl -fsS -X PUT "$MIS_API/access/manifests/da" \
  -u "$MIS_CLIENT_ID:$MIS_CLIENT_SECRET" \
  -H 'Content-Type: application/json' --data @manifest.json
```

- **Credentials:** the app's own SSO client credentials. A client may only publish its own app key; the mapping is in `backend/src/access/apps.ts` and can be overridden with `ACCESS_APP_CLIENTS`.
- **Idempotent:** an unchanged manifest returns `unchanged: true`.
- **Removed capabilities:** they are marked deprecated, never deleted.

## 4. Get the user's snapshot

```
GET $MIS_API/access/me?app=da          Authorization: Bearer <the user's MIS token>
```

Returns an `AccessSnapshot`:

```jsonc
{
  "v": 17,                                  // User.access_version
  "app": "da",
  "user": { "id": 42, "persona": "TEACHER", "school_id": 1 },
  "year": 5,
  "caps": {
    "DISCIPLINE_VIEW": [
      { "depth": "summary", "scope": { "all": true }, "via": [311] },
      { "depth": "detail",  "scope": { "class_groups": [7] }, "via": [402] }
    ]
  },
  "grants": { "311": { "role": "Academic Insights Viewer", ... } },
  "home": "insights:SCHOOL",
  "systems": ["da", "mis"]
}
```

- **Keys:** `caps` is keyed by **your** capability keys.
- **Scopes:** they are pre-expanded to ids. You never need the school hierarchy.
- **Grants are never pooled:** one entry per grant.

Cache the snapshot per user, keyed by `v`.

## 5. Keep it fresh

- **Polling:** your app already polls `GET $MIS_API/auth/verify` every 3 minutes. The response now carries `data.access_version`. When it differs from the cached snapshot's `v`, re-fetch `/access/me`.
- **On failure:** if MIS is unreachable, keep the last snapshot for up to 24 h, then fail closed.

## 6. Decide

```ts
import { decide, can, depthAt, scopeFor } from "../vendor/nga-access";

can(snap, "DISCIPLINE_LOG", { classGroupId: 7, subjectId: 31 });        // point check
depthAt(snap, "DISCIPLINE_VIEW", { classGroupId: 12 });                 // "summary" | "detail" | ...
scopeFor(snap, "DISCIPLINE_VIEW", "detail");                            // list filter:
// { all: true } | { class_groups:[..], pairs:[[subject,class],..], students:[..], self: id } | null
```

A target takes the most specific field you know:

| Field | Refers to |
|---|---|
| `studentId` | a student |
| `ownerId` | the record's creator (SELF scope) |
| `(subjectId, classGroupId)` | a subject in a class |
| `classGroupId` | a class |
| `subjectId` | a subject |
| `gradeId` | a grade |
| `departmentId` | a department |
| `programId` | a programme |

For a student, pass their class group too, so class-teacher and DOS scopes apply.

Rules to follow:

- **Unknown capability:** denied (fail closed).
- **Summary endpoints:** use `groupByAllowed(depth, groupBy)` and `suppressSmallCohorts(rows, 5)`.

## 7. Roll out safely

Give the app one setting, `ACCESS_V2_MODE`:

| Mode | Behaviour |
|---|---|
| `off` | Only your existing checks run. |
| `shadow` | Existing checks decide. v2 decides too; log every disagreement. This is the default while migrating. |
| `enforce` | v2 decides. |

Switch to `enforce` only after leadership has reviewed the shadow differences.

## 8. Other MIS endpoints

| Endpoint | Auth | Use |
|---|---|---|
| `GET /access/holders?app=da&cap=DISCIPLINE_REVIEW&classGroupId=7&minDepth=detail` | client credentials (`access:read`) | Who can act on a target: approval pools, notification recipients |
| `POST /access/audit` `{action, actor_id, subject_user_id, target, reason}` | client credentials | Report reads of `sensitive` data so they appear in the one audit log |
| `GET /access/explain?cap=&app=&...target` | user token | "Why can / can't I?" |

## 9. Maintaining this package

- **Changing the core:** edit `src/index.ts`, add cases to `test/decision-table.json`, then re-sync every consumer, MIS included (`backend/src/vendor/nga-access`).
- **Drift check:** the MIS test fails if its copy drifts.
- **Versioning:** bump `ACCESS_CORE_VERSION` on any behaviour change. Snapshots carry it in `core`.
