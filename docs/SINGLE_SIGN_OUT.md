# Single sign-out across NGA apps

Signing out of NGA MIS signs the same person out of every connected app
(Task Mentor, Tendo, Tupo). That covers the "switch account" case: after a
sign-out, no other app is left open as the previous person.

## How it works

The standard is [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html).

1. `POST /auth/logout` in MIS bumps `token_version`, which ends every MIS
   session of the user. It then calls `notifyLogout(userId)` in the
   background (`backend/src/services/sso/backchannelLogout.ts`).
2. For every `ACTIVE` System that has a `client_id` and a
   `backchannel_logout_uri`, MIS POSTs
   `application/x-www-form-urlencoded` `logout_token=<JWT>`:
   - The token is signed RS256 with `kid`.
   - Claims: `iss` (MIS API origin), `aud` (the app's client_id), `iat`,
     `exp` (+120 s), `jti`, `sub` (MIS user id), and
     `events: {"http://schemas.openid.net/event/backchannel-logout": {}}`.
   - A 5xx or network error is retried after 1 s and again after 4 s. A 4xx
     is not retried.
3. The app verifies the token (`utils/ssoLogout.ts`, the same file in every
   app), then records `session_revocations(user_id, revoked_at)` for its
   local users with that `mis_user_id`.
4. The app's auth middleware returns `401 {code: "SESSION_ENDED"}` for any
   token with `iat*1000 <= revoked_at`. A later sign-in works normally.
5. Tupo also publishes `tupo:logout` on Redis, and the realtime gateway
   disconnects that person's chat and Meet sockets.
6. As a backstop, every app client re-checks the MIS session through its
   own `/verify-mis` on load, on focus, and every 60 s.

We don't use front-channel logout (hidden iframes). Since Chrome 115,
third-party iframes get partitioned storage, so the iframe can't reach the
app's tokens and the logout silently does nothing.

## Keys and discovery

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/jwks.json` | Public signing key(s). Apps cache it for 1 h and refetch it when they see an unknown `kid`. |
| `GET /.well-known/openid-configuration` | Issuer, JWKS URI, `backchannel_logout_supported: true`. |

- **Production:** set `SSO_SIGNING_PRIVATE_KEY` (an RSA PEM; `\n` escapes
  are allowed) in the backend env. Without it, MIS logs a warning and sends
  no logout tokens. Sign-out still works in MIS, and the apps' 60 s check
  still applies.
- **Issuer:** `SSO_ISSUER`, falling back to `REMINDERS_API_URL`. It must
  equal each app's `NGA_MIS_BASE_URL` (production:
  `https://api.amashuri.com`).
- **Development:** a key is created at `backend/.sso-signing-key.pem`
  (gitignored).
- **Rotation:** replace the key and restart. Apps pick up the new `kid`
  automatically.

Generate a key on the server without printing it:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/sso.pem
printf 'SSO_SIGNING_PRIVATE_KEY="%s"\n' "$(awk '{printf "%s\\n",$0}' /tmp/sso.pem)" >> backend/.env.production
shred -u /tmp/sso.pem
```

## Registering an app

Migration `094_sso_backchannel_logout.sql` adds
`System.backchannel_logout_uri` and fills it in for the three NGA apps.
Admins can edit it under **Systems → Back-channel logout URL**. The URL must
be `https://`; plain `http://` is accepted only for localhost.

| App | client_id | Endpoint |
|---|---|---|
| Task Mentor | `taskmentor_app` | `https://taskmentor-api.amashuri.com/api/auth/backchannel-logout` |
| Tendo | `discipline_attendance` | `https://tendo.amashuri.com/api/sso/backchannel-logout` |
| Tupo | `tupo` | `https://tupo.amashuri.com/api/sso/backchannel-logout` |

An app's endpoint must:

- verify the signature, `iss`, `aud`, `exp`, the events claim, the absence
  of a `nonce`, and a single-use `jti`;
- reply `200` with `Cache-Control: no-store`, or `400` for an invalid token.

## Tests

- MIS: `backend/src/__tests__/ssoBackchannelLogout.test.ts`
- Task Mentor: `server/src/tests/ssoLogout.spec.ts`
- Tendo: `server/src/__tests__/singleSignOut.test.ts`
- Tupo: `apps/api/src/__tests__/singleSignOut.test.ts`
