# NGA Central MIS: SSO Integration Guide

This guide explains how to integrate your application with the NGA Central MIS Single Sign-On (SSO) system using the standard OAuth2 Authorization Code Flow. This allows users to sign in to your application using their NGA Central MIS credentials.

## Overview

The integration follows a standard 3-legged OAuth2 flow:

1.  **Redirect**: Your app redirects the user to the MIS Login Page.
2.  **Authorize**: User logs in and approves your app (implicit in NGA MIS).
3.  **Exchange**: MIS redirects back to your callback URL with a `code`. Your server exchanges this `code` for an access `token`.

---

## 📋 Prerequisites

Before you begin, ensure you have the following:

1.  **Registered Application**: Your app must be registered in the NGA MIS Admin Dashboard (System Modules).
2.  **Credentials**: Obtain your `Client ID` and `Client Secret`.
3.  **Redirect URI**: Whitelist your callback URL (e.g., `http://localhost:3000/sso/callback`).
    - **Note**: Use a different port than the MIS (5173) to avoid conflicts during local development.

---

## ⚡ Quick Start

### 1. Configure Environment Variables

Add these variables to your project's `.env` files.

**Frontend (`client/.env`):**

```ini
# The URL for the user login interface
VITE_MIS_LOGIN_URL=https://nga.ac.rw/mis/login
# Your unique application identifier
VITE_SSO_CLIENT_ID=your_client_id
```

**Backend (`server/.env`):**

```ini
# The API base URL for token exchange.
# NOTE: this is api.amashuri.com — NOT the domain serving the MIS web app, and
# NOT ngamis.isengesho.com, which this file used to say and which does not
# resolve at all. The web app domains (nga.ac.rw, mis.amashuri.com) answer 200
# with the SPA's HTML for *every* path, so pointing a client at one of those
# fails as a confusing JSON parse error rather than a clean 404.
NGA_MIS_BASE_URL=https://api.amashuri.com
# Your credentials (NEVER expose these to the client)
SSO_CLIENT_ID=your_client_id
SSO_CLIENT_SECRET=your_client_secret
```

---

## 🛠 Integration Steps

### Step 1: Redirect User to Login

When the user clicks "Sign in with NGA MIS", redirect them to the configured login URL.

**React Example:**

```tsx
const handleLogin = () => {
  const clientId = import.meta.env.VITE_SSO_CLIENT_ID
  const loginUrl = import.meta.env.VITE_MIS_LOGIN_URL
  const redirectUri = window.location.origin + '/your/callback/path'

  // Construct the full URL
  const target = `${loginUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}`

  // Redirect
  window.location.href = target
}
```

### Step 2: Handle the Callback

Create a route in your frontend (e.g., `/sso/callback`) to capture the authorization `code` from the URL query parameters.

**React Example:**

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')

  if (code) {
    // Send this code to YOUR backend immediately
    sendCodeToBackend(code)
  }
}, [])
```

### Step 3: Exchange Code for Token (Server-Side)

Your backend must exchange the authorization code for an access token. **This must happen on the server** to keep your `Client Secret` secure.

**Endpoint**: `POST /sso/token` (on `NGA_MIS_BASE_URL`)

**Node.js / Express Example:**

```typescript
import axios from 'axios'

async function exchangeToken(authCode) {
  try {
    const response = await axios.post(
      `${process.env.NGA_MIS_BASE_URL}/sso/token`,
      {
        code: authCode,
        client_id: process.env.SSO_CLIENT_ID,
        client_secret: process.env.SSO_CLIENT_SECRET,
      },
    )

    const { token, user, permissions } = response.data.data

    // 1. Create a session for the user in your app
    // 2. return the token/session to your frontend
    return token
  } catch (error) {
    console.error('Token exchange failed', error)
    throw error
  }
}
```

### Step 4: Fetch the Full Profile

`POST /sso/token` intentionally returns a minimal payload (`token`, `user`, `permissions` only) — no `profile`, `roles`, `assignedPrograms`, `assignedGrades`, academic-year/term data, or `systems`. Immediately after the exchange, call `GET /users/me` with the new token to hydrate everything your app needs (profile, roles+permissions, assigned programs/grades, current academic year/terms, and the active `systems` list):

```typescript
const profileResponse = await axios.get(`${process.env.NGA_MIS_BASE_URL}/users/me`, {
  headers: { Authorization: `Bearer ${token}` },
})
const { profile, roles, assignedPrograms, assignedGrades, currentAcademicYear, currentAcademicTerms, systems } =
  profileResponse.data.data
```

If this call fails (MIS temporarily slow/unreachable), fall back gracefully to the minimal `user`/`permissions` from Step 3 rather than failing the whole login.

### Step 5: Verify & Access Data

Once authenticated, use the returned `token` to access protected NGA MIS APIs on behalf of the user. The token also contains the user's `preferred_theme` (light/dark), allowing your app to automatically match the user's appearance settings.

**Authorization Header:**

```http
Authorization: Bearer <your_jwt_token>
```

---

## 🐞 Troubleshooting

| Error                                | Possible Cause         | Solution                                                                                                               |
| :----------------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **404 Not Found** on Redirect        | Wrong Login URL        | Ensure you use `https://nga.ac.rw/mis/login`, NOT the API URL.                                                         |
| **Invalid Authorization Code**       | Code reused or expired | Codes are one-time use and expire after **5 minutes**. Ensure your frontend sends it only once (use `useRef` in React strict mode). |
| **JsonWebTokenError**                | Stale local token      | Clear `localStorage` of old tokens. Ensure your app uses the fresh cookie/token from the SSO exchange.                 |
| **401 Unauthorized** during exchange | Bad Secret             | Check `SSO_CLIENT_SECRET` matches the one in MIS Admin.                                                                |

---

## 📚 API Reference

**Auth Base URL**: `https://api.amashuri.com`

> Routes mount at the **root** — `/sso/token`, `/users/me`, `/academics/…`.
> There is no `/api` or `/api/v1` prefix.

**Redirect URIs are matched EXACTLY** (trailing slash stripped) against the
comma-separated `allowed_redirect_uris` on the client's `System` row. A registered
origin like `http://localhost:3000` will therefore NOT authorise a callback at
`http://localhost:3000/sso/ngamis/callback` — register the full callback path.

### `POST /sso/token`

Exchanges Authorization Code for Access Token.

**Payload:**

```json
{
  "code": "string (required)",
  "client_id": "string (required)",
  "client_secret": "string (required)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "token": "jwt_string...",
    "user": { ... },
    "permissions": [ ... ]
  }
}
```

---

## 🔄 Bulk Sync API (server-to-server)

SSO tells you about **one** user, at the moment they log in. A partner that needs
the school's whole roster — every user, the courses, the class groups, who
teaches what — cannot get there from `/users/me`, and stitching it out of
`/users` + `/users/:id/roles` + `/users/:id/grades` + `/users/:id/programs` costs
`1 + 4N` requests and re-fetches everything on every run.

`/integrations/*` exists for that case. It is **read-only** and authenticated by
an **IntegrationToken**, not a user JWT.

### Authentication

```http
Authorization: Bearer ngamis_<64-hex>
```

Mint one on the MIS server (the raw value is shown once and never stored):

```bash
npx ts-node scripts/create-integration-token.ts --name="Ganzaa production"
npx ts-node scripts/create-integration-token.ts --list
npx ts-node scripts/create-integration-token.ts --revoke=<id>
```

A service token is deliberately not a user JWT: it outlives any individual's
employment, carries a fixed `sync:read` scope instead of a person's permissions,
and can be revoked on its own without disabling anybody's login.

### `GET /integrations/ping`

Identity + row counts. Use it for a "Test connection" button — a wrong base URL
or a token from the wrong environment shows up here instead of at 2am.

### `GET /integrations/sync/reference`

The academic skeleton in one call: `academicYears`, `academicTerms`, `programs`,
`grades`, `subjects`, `gradeSubjects`, `classGroups`, `roles`.

Always returns everything (`delta.supported: false`) because these tables carry
no `updated_at` to filter on. It is a few thousand small rows.

### `GET /integrations/sync/people?since=&cursor=&limit=`

Users with `profile`, `roles`, `classGroups`, `subjectEnrollments`,
`teachingAssignments` and `gradeAssignments` already attached.

- `cursor` is **the last `id` you received**, not a page number. Paging is
  keyset, so the hundredth page costs what the first did.
- `limit` defaults to 500, capped at 2000.
- `since` is an ISO-8601 timestamp filtering `User.updated_at`. **It only sees
  changes to the user row** — moving a student between class groups does not
  touch it — so run a full pass (omit `since`) periodically.

Loop until `pagination.hasMore` is false:

```typescript
let cursor = 0
for (;;) {
  const { data } = await axios.get(`${BASE}/integrations/sync/people`, {
    params: { cursor, limit: 500 },
    headers: { Authorization: `Bearer ${process.env.MIS_SYNC_TOKEN}` },
  })
  await upsert(data.data.users)
  if (!data.data.pagination.hasMore) break
  cursor = data.data.pagination.nextCursor
}
```

### ⚠️ Scoping: these endpoints are NOT school-scoped

Every response carries `scope.schoolFilter: "instance"`. In this schema only
`School`, `SchoolSystemAssignment` and `RoleSystemFragment` have a `school_id`;
`User`, `Program`, `Grade`, `Subject`, `ClassGroup` and `AcademicYear` do not.
So there is no honest way to filter by school, and a `school_id` parameter would
silently return everything.

**A partner therefore receives the entire MIS instance and must scope on its own
side.** If this MIS ever serves a second school, add `school_id` upstream and
change `scope.schoolFilter` — a client can then detect the change rather than
quietly importing another school's students.
