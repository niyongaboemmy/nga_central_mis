# NGA tenancy contract v1 (frozen for the feat/multi-tenancy implementation)

Plan: `MULTI_TENANCY_GAP_FIX_PLAN.md` (workspace root). Core code: `packages/tenancy/src/index.ts`, vendored by every Node service with `node nga_central_mis/packages/tenancy/sync.mjs <app>/<server>/src/vendor/nga-tenancy`.

## 1. Identity of a tenant
- `tid`: positive integer, `Tenant.tenant_id` in the MIS control plane. **Tenant 1 = NGA = the primary tenant**, whose existing databases are used in place.
- `TenantCtx = { tid, slug, name, status, isPrimary, timezone, pkg }`. `status` is one of PENDING | ACTIVE | GRACE | SUSPENDED | ARCHIVED. Only ACTIVE and GRACE are usable (`isTenantUsable`).

## 2. Tokens minted by MIS (claims added; nothing removed in v1)
| Token | New claims / fields |
|---|---|
| MIS session JWT (`nga_auth_token`) | `tid`, `tslug`, `tstatus`, `pkg` |
| SSO token (`POST /sso/token` → `token`) | `tid`, `tslug`, `tstatus`, `pkg`; the response body also gains `tenant: TenantCtx` |
| `GET /auth/verify` | the response gains `tenant: TenantCtx` |
| `GET /users/me` | the response gains `tenant: TenantCtx` |
| `GET /access/me?app=` snapshot | `user.school_id = tid` (real value) and a top-level `tenant: TenantCtx` |
| Back-channel `logout_token` | `tid` claim; spokes revoke on `(tid, sub)` |

**Legacy tokens** (no `tid`): treat as tenant 1 while `TENANCY_LEGACY_DEFAULT_TID` (default `1`) is set; when it is set to `none`, reject them with 401 `{code:"TENANT_REQUIRED"}`. Use `tidFromClaims(claims, legacyDefault)`.

## 3. Service-to-service calls
- Every call from a spoke to MIS that has no end user (Basic `client_id:secret`, IntegrationToken, or MIS_INTEGRATION_TOKEN) sends the header **`X-NGA-Tenant: <tid>`**. A spoke making the call inside a request or job uses `currentTid()`.
- MIS: a missing header means tenant 1 **only for a System explicitly assigned to tenant 1**; any other System gets 400 `{code:"TENANT_REQUIRED"}` (always 400 when `TENANCY_REQUIRE_TENANT_HEADER=true`). MIS then checks that the System is assigned to that tenant (`TenantSystem`, active). No tenant is implicitly assigned every System -- the primary included: the platform bootstrap writes tenant 1's rows once for the Systems that existed before multi-tenancy, and a System created on the primary console is assigned to tenant 1 unless `assign_primary: false`. SSO authorize, the public systems list and back-channel logout use the same rows. It runs the handler under `runWithTenant`.
- User-token calls (a spoke forwarding the user's misToken) need no header. MIS takes the tenant from the token. If a header is also sent and it differs → 403 `{code:"TENANT_MISMATCH"}`.
- MIS → spoke calls (home-summary federation and so on) send `X-NGA-Tenant` too.

## 4. Tenant registry for spokes
- `GET {NGA_MIS_BASE_URL}/platform/tenants/active` uses the same service auth as `/integrations/sync/*` (Basic SSO client credentials, or the integration token with scope `tenants:read`). It returns `{ tenants: TenantCtx[] }`, **every** status (consumers filter).
- Spokes build `new TenantRegistry({ load, ttlMs: 30000, fallback: [primaryTenantCtx()] })` so a single-tenant install keeps working if MIS is unreachable or still old.
- Optional push invalidation: MIS `POST <spoke>/api/integration/tenants/changed` with `{tid}` → `registry.invalidate()`. Auth is the provisioning secret.

## 5. Provisioning a tenant in a spoke
- `POST <spoke>/api/integration/tenants/:tid/provision` with header `Authorization: Bearer ${TENANCY_PROVISION_SECRET}` (shared env on MIS and spoke; constant-time compare; 503 if the env var is unset). Body: `TenantCtx`.
- It is **idempotent**: it creates or migrates the tenant's storage and seeds roles, permissions and defaults. It returns `{ ok: true, tid, created: boolean }`. Tenant 1 is never re-seeded destructively.

## 6. Request handling in every service
1. Auth middleware resolves `tid` from the session (spoke-issued JWTs **must now carry `tid`**, copied from the MIS SSO token at sign-in), loads the tenant from the registry, and then:
   - unknown tenant → 401 `{code:"TENANT_UNKNOWN"}`
   - `PENDING` → 403 `{code:"TENANT_PENDING"}`
   - `SUSPENDED` / `ARCHIVED` → 403 `{code:"TENANT_SUSPENDED"}`
   - otherwise `runWithTenant(tenant, next)`
2. If the MIS token's `tid` differs from the spoke session's `tid` → 401 `{code:"TENANT_MISMATCH"}`.
3. Data access resolves storage from `currentTenant()` and **throws** `TenantContextMissing` when there is none (fail closed). Code that is genuinely global (catalogs, health checks) is explicitly marked.
4. Schedulers wrap their bodies in `forEachActiveTenant(registry, fn)`. Queue jobs carry `tid` and re-enter the context.

## 7. Storage layout per app
| App | Tenant 1 (primary, in place) | Tenant N |
|---|---|---|
| MIS (MySQL) | env `DB_NAME` (prod `ngarw_mis`) | `Tenant.mis_db_name` (default `${DB_NAME}_t<N>`); control plane `PLATFORM_DB_NAME` (default `amashuri_platform`) |
| Task Mentor (MySQL) | env `DB_NAME` | `${TENANT_DB_PREFIX:-<DB_NAME>_t}<N>` |
| Tendo (SQLite) | env `DATABASE_PATH` (unchanged) | `${TENDO_DATA_DIR:-dirname(DATABASE_PATH)}/t<N>/attendance.db` |
| Tupo (Postgres) | rows with `tenant_id = 1` | rows with `tenant_id = N`; RLS on `current_setting('app.tenant_id')` |

## 8. Shared namespaces
- **File server:** *new* writes go to `<app>/t/<tid>/…` (`tenantPath`). Existing stored paths stay readable as they are; there is no bulk move.
- **Caches, Redis keys and locks:** `tenantKey(...)` → `t<tid>:…`.
- **Socket.IO rooms:** `tenantRoom(name)` → `t<tid>:<name>`. Redis pub/sub payloads carry `tid`.
- **Browser storage keys** include the tid, e.g. `tendo.outbox.v2.<tid>.<uid>`.

## 9. Out of scope for v1
RS256 session tokens (ADR-9), vanity hosts, packages, billing and self-registration (management plan). Fields such as `pkg` are carried but not enforced yet.
