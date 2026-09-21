# NGA Central MIS

> **Setting this up on your machine?** Start with **[LOCAL_SETUP.md](LOCAL_SETUP.md)** — it covers the whole local stack, including the Central MIS sign-in every module depends on.

The core school MIS — users, academics, calendar, reporting, documents — and the
**single sign-on provider** for the other NGA apps (TaskMentor, Tendo, Tupo). Those
apps have no login of their own; they redirect here and exchange an SSO code with
this API.

```
backend/    Express + TypeScript + Drizzle (MySQL)   → http://localhost:5001
frontend/   React + Vite                              → http://localhost:5173
```

## Local development setup

### 1. Prerequisites

- **Node.js 20+** and npm
- **MySQL 8** running locally, and its root password
  (Windows: [MySQL Installer](https://dev.mysql.com/downloads/installer/) — pick
  "Server only"; macOS: `brew install mysql && brew services start mysql`)

### 2. Install

```bash
git clone https://github.com/niyongaboemmy/nga_central_mis.git
cd nga_central_mis
npm run install-all          # root + backend + frontend
```

### 3. Configure

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

Open `backend/.env` and set `DB_PASSWORD` to your MySQL root password. Everything
else works as-is for local development.

### 4. Create the database

```bash
cd backend
npm run db:setup
```

This creates `ngarw_mis` (the `DB_NAME` in `.env`) from the committed snapshot (`ngarw_mis.sql`),
applies the migrations newer than the snapshot, and sets the super-admin password.
It refuses to overwrite a database that already has tables; `npm run db:setup -- --force`
drops and rebuilds it.

### 5. Run

```bash
cd ..            # back to the repo root
npm run dev      # backend on :5001 and frontend on :5173, together
```

Open **http://localhost:5173** and log in:

| | |
|---|---|
| Username | `superadmin` |
| Password | `Admin@1234` (or whatever you passed as `--admin-password`) |
| OTP | Login is two-step. In development no email is sent — the code is **shown on the login page**. |

The snapshot contains other user accounts, but their passwords are unknown. To use
one, log in as `superadmin` and reset it from the Users admin.

## Everyday commands

| Where | Command | What |
|---|---|---|
| root | `npm run dev` | backend + frontend with reload |
| backend | `npm run dev` | backend only |
| backend | `npm test` | backend tests (needs MySQL; uses a throwaway `<DB_NAME>_test` schema) |
| backend | `npm run migrate <file.sql>` | apply one migration file to your DB |
| backend | `npm run db:setup -- --force` | rebuild your local DB from the snapshot |
| frontend | `npm run dev` / `npm test` / `npm run lint` | frontend only |

## Database migrations

Schema changes are hand-written SQL files in `backend/migrations/`, numbered
`NNN_description.sql`. To add one: create the next number, apply it locally with
`npm run migrate NNN_description.sql`, and commit it. Migrations are applied to
production separately (see `.github/workflows/migrate.yml`).

`ngarw_mis.sql` is a snapshot of the schema through migration **039**; `db:setup`
replays everything after it. If you refresh the snapshot, update
`DUMP_MIGRATION_LEVEL` in `backend/scripts/setup-local-db.ts`.

## Branching and deployment

**Every push to `main` deploys to production** (`.github/workflows/deploy.yml`).
Never commit directly on `main`:

```bash
git checkout -b feature/short-description
# ...work, verify locally...
git push -u origin feature/short-description   # then open a Pull Request
```

`main` changes only by merging a reviewed PR.

## More

- `SSO_CLIENT_INTEGRATION.md` — how another app integrates with this SSO
- `API_DOCS.md` — API reference
- `DEPLOYMENT_GUIDE.md` — production hosting notes
