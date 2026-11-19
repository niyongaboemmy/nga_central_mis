# GitHub App setup: Git-driven project reporting

Git-driven reporting (branches, commits and pull requests linked to project tasks, automatic task moves and weekly report drafts) needs one GitHub App. Design: `GIT_AUTOMATED_REPORTING_ANALYSIS.md`. Code: `backend/src/services/sideProjects/git/`, migrations `139` (tenant) and `platform/005`.

There is no GitHub organisation. The app is owned by a personal account, and each repository owner installs it on their own account, for the repositories they choose.

Until the six environment variables below are set, the feature stays off. The GitHub tab then says so, and task keys and branch names still work.

## 1. Create the app

On the owner account, open GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.

| Field | Value |
|---|---|
| Name | `NGA Projects` (the slug, e.g. `nga-projects`, goes in `GITHUB_APP_SLUG`) |
| Homepage URL | `https://mis.amashuri.com` |
| Callback URL | `https://api.amashuri.com/integrations/github/oauth/callback` |
| Request user authorization (OAuth) during installation | Off |
| Setup URL | `https://api.amashuri.com/integrations/github/setup` |
| Redirect on update | On |
| Webhook | Active, URL `https://api.amashuri.com/integrations/github/webhook` |
| Webhook secret | A long random string (`openssl rand -hex 32`), stored in `GITHUB_WEBHOOK_SECRET` |
| Where can it be installed | **Any account** (public), so each repository owner can install it on their own account |

**Repository permissions** (read-only):

| Permission | Access | Why |
|---|---|---|
| Metadata | Read | Required by GitHub |
| Contents | Read | Commits on the default branch (nightly reconcile) |
| Pull requests | Read | Pull request state and reviews |
| Checks | Read and write | *Optional:* only if projects turn on "Check on pull requests" |

**Account permissions:** Email addresses (read), so commits made with a verified email match the person.

**Subscribe to events:** Create, Delete, Push, Pull request, Pull request review. Installation events are always sent.

After creating it:

1. Generate a **private key** (a `.pem` file).
2. Generate a **client secret**.
3. Note the **App ID** and **Client ID**.

## 2. Configure the backend (`backend/.env` on the server)

```env
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=nga-projects
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET=<the webhook secret>
GITHUB_CLIENT_ID=Iv23...
GITHUB_CLIENT_SECRET=<the client secret>
# optional: signs install/OAuth state and push-action links (defaults to JWT_SECRET)
GITHUB_STATE_SECRET=<random>
```

`\n` escapes in the private key are accepted. Restart the backend (`pm2 restart mis-backend`).

## 3. Migrations

1. **Tenant:** run `migrate.yml` with `migration_file=139_side_projects_git_reporting.sql`, which backs up first.
2. **Control plane:** apply `migrations/platform/005_github_installations.sql` to `PLATFORM_DB_NAME`. This table maps an installation to its school. Without a control plane, every installation belongs to the primary tenant.

## 4. Try it

1. As a project lead: open a project → **GitHub** tab → **Install on GitHub** → choose "Only select repositories" → pick the repository. You come back to the tab: pick the repository → **Connect repository**.
2. As each member: **Connect GitHub** (one click; identity only, no repository access).
3. Open a task → copy its branch name (`feat/FOP-27-…`) → push to it. The task moves to In progress, and a draft appears in Progress.

GitHub → the app → **Advanced** lists every delivery, with a "Redeliver" button. A nightly reconcile also fills gaps from the API.

## How it behaves

| Area | Behaviour |
|---|---|
| Linking | `KEY-<task id>` in a branch name, PR title or body, or commit message. Inside a connected repository, `#<task id>` also works. Closing words (`Closes FOP-27`) close tasks on merge. |
| Automations | Each per project, on by default, and running as the developer with their own board rights: branch → In progress, PR opened → In review, changes requested → In progress, merged into the default branch → Done, `#blocked <reason>` / `#review` / `#done` in a commit. |
| Drafts | One open draft per person and project, covering work since their last report. Hours come from TMCode editing time if present, plus `#time` hints and commit sessions (2-hour gap, 30 minutes per session, 10-hour daily cap, half hours). |
| Notifications | Friday 16:00 Kigali: "Your report is ready", with **Submit as is** and **Review** push buttons. |
| Auto-submit | Delivery Studio projects default to 2 days after the notice; student projects never. Changeable per project. |
| Not counted | Merges, bots, lockfile-, `dist/`- and `vendor/`-only commits, and rebased copies. |
| AI wording | On by default where the school AI policy allows. Only commit titles and task names are sent, and each person can turn it off. |
| TMCode | `POST /side-projects/git/editor-activity { repo, branch, date, minutes }` with the person's MIS token. Minutes are a running daily total per branch. |
| MCP | `mis_get_my_project_report_drafts` (read) and `mis_update_project_report_draft` (rewords, never submits). |
