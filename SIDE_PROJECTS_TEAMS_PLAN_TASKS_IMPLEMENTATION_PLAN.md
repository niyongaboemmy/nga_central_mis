# Side projects: teams, implementation plan and tasks: implementation plan

Status: drafted 2026-11-18. Extends `STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md` (§1–14). Migration 133.

## 1. Research summary (what good tools do, and what we take)

| Finding | Source pattern | Decision |
|---|---|---|
| Workflow states group into five categories: *backlog, unstarted, started, completed, cancelled*. Review/QA sit under "started". | Plane, Jira state categories, Azure Boards | Task states: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE`, `CANCELLED`, each mapped to a category. |
| Keep a separate *Blocked/Waiting* state so idle time doesn't inflate active time; flag items blocked too long. | Atlassian, Orangescrum | `BLOCKED` needs a reason. Its time is reported apart, and blocked tasks are listed on the dashboards. |
| Measure **lead time** (created → done), **cycle time** (first started → done) and **time in each status**. Agree the definitions. | Screenful, Atlassian | Every status change goes in `SideProjectTaskEvent`; these definitions are fixed in §6. |
| Don't over-engineer the workflow; few states. | Eficode | Six task states, seven plan-item states, nothing configurable. |
| One accountable owner per task (RACI "A"). | RACI guides | A task has exactly one assignee. Plan items have one accountable owner. Roles and responsibilities are recorded per teammate. |
| Student teams need "who did what": workload view, effort estimates, individual progress. | Teacher/education tool guides | A per-teammate report (tasks, hours, on-time rate, cycle time, reports) and a workload view. |
| Progress should **roll up automatically** from work items (initiative ← projects ← issues). | Linear | Plan items roll up from their tasks (AUTO mode), phases from their features, and project progress from the plan. |
| Burndown / throughput charts show whether the plan will land. | Agile reporting | Burndown (30 days, with scope) and weekly throughput per project, plus delivery KPIs per school. |

**Added beyond the brief** (from the research):
- plan templates per category, generated and dated from the stage plan (the *automation*);
- AUTO/MANUAL status per plan item;
- task priority, estimate and due date;
- work logs per task (hours);
- a "My tasks" view across projects;
- notifications when a task is assigned, needs review, is blocked or is overdue;
- teammate manager rights ("can assign tasks");
- personal/team mode;
- time in each status;
- an at-risk signal (overdue and blocked counts).

## 2. Concepts

- **Project mode.** `PERSONAL` (owner only) or `TEAM` (owner + teammates). Switching to Personal is refused while teammates remain.
- **Teammate.**
  - `role_key`: `LEAD`, `DEVELOPER`, `DESIGNER`, `TESTER`, `RESEARCHER`, `ANALYST`, `DOCUMENTER` or `OTHER`;
  - `role_title`: free label;
  - `responsibilities`: text;
  - `is_manager`: may plan and assign.
  - The owner is always the lead and a manager.
- **Plan item.** `PHASE` (groups features, usually one per stage) or `FEATURE` (a deliverable). It has an owner, a priority, a start and due date, an estimate and a status mode.
- **Task.** The unit of work, always inside a plan item. It has an assignee, a priority, a due date, an estimate, hours spent (from work logs) and a state.

### Plan-item statuses (in order)
`BACKLOG` → `PLANNED` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`, plus `BLOCKED` and `CANCELLED`.
- **AUTO mode** (default), from the item's tasks, ignoring cancelled ones:
  - no tasks: keep `BACKLOG`/`PLANNED`;
  - all done: `DONE`;
  - any in progress: `IN_PROGRESS`;
  - otherwise any blocked: `BLOCKED`;
  - otherwise any in review: `IN_REVIEW`;
  - some done but others still to do: `IN_PROGRESS`;
  - all still to do: `PLANNED`.
- **MANUAL mode:** a manager sets the status.
- **Phases** always roll up from their features (and from their own tasks).

### Task states (in order)
`TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`, plus `BLOCKED` (needs a reason) and `CANCELLED`.
- Who may move a task:
  - the assignee moves their own task;
  - managers move any task;
  - a teammate may pick up an unassigned task, which assigns it to them.
- Done tasks can be reopened (to `TODO` or `IN_PROGRESS`).

## 3. Permissions

| Action | Who |
|---|---|
| Switch personal/team, invite, set roles, responsibilities and manager rights | Owner, projects lead (`SIDE_PROJECTS_MANAGE_ANY`) |
| Create, edit, reorder and delete plan items, generate from a template | Owner, managers, lead |
| Create tasks | Any teammate (the assignee defaults to themself); managers assign anyone |
| Assign or reassign tasks | Owner, managers, lead |
| Move a task / log work | Assignee (own tasks), managers, lead |
| View plan, tasks and insights | Everyone who can open the project (team, supervisor, staff in scope) |

No new system permission is needed: project managers are a per-project right granted by the owner. The school-wide view reuses `SIDE_PROJECTS_VIEW`.

## 4. Data model (migration 133)

- `SideProject.team_mode ENUM('PERSONAL','TEAM') DEFAULT 'PERSONAL'`. Projects that already have members are backfilled to `TEAM`.
- `SideProjectMember` gains `role_key`, `role_title`, `responsibilities` and `is_manager`.
- `SideProjectPlanItem`:
  - `item_id`, `project_id`, `parent_id`, `kind`, `title`, `description`;
  - `status`, `status_mode`, `priority`, `stage`;
  - `owner_user_id`, `start_date`, `due_date`, `estimate_hours`, `sort`;
  - `done_at`, `status_changed_at`, `created_by`, created/updated.
- `SideProjectTask`:
  - `task_id`, `project_id`, `plan_item_id`, `title`, `description`;
  - `status`, `priority`, `assignee_user_id`, `due_date`, `estimate_hours`, `blocked_reason`, `sort`;
  - `started_at`, `completed_at`, `status_changed_at`, `created_by`, created/updated, `overdue_nudged_on`.
- `SideProjectTaskEvent`: `event_id`, `task_id`, `from_status`, `to_status`, `actor_id`, `note`, `created_at`.
- `SideProjectTaskLog`: `log_id`, `task_id`, `user_id`, `work_date`, `hours`, `note`, `created_at`.

## 5. API (under `/side-projects/:id`)

| Method | Path | |
|---|---|---|
| PATCH | `/team` | `{ mode }` |
| PATCH | `/members/:userId` | `{ roleKey, roleTitle, responsibilities, isManager }` |
| GET | `/plan` | items (tree) + tasks + rollups |
| POST | `/plan/items` | create a phase/feature |
| PATCH/DELETE | `/plan/items/:itemId` | edit, status, mode / delete (tasks move to its parent, or are refused) |
| PATCH | `/plan/order` | `{ ids, parentId }` |
| GET | `/plan/templates` | template catalogue with preview |
| POST | `/plan/generate` | `{ template }`: phases and features dated from the stage plan |
| POST | `/tasks` | create |
| PATCH/DELETE | `/tasks/:taskId` | edit, assign / delete |
| POST | `/tasks/:taskId/status` | `{ to, note }` |
| POST/DELETE | `/tasks/:taskId/logs[/:logId]` | log work |
| GET | `/tasks/:taskId` | detail, history and logs |
| GET | `/delivery` | project insights (§6) |
| GET | `/side-projects/my-tasks` | the caller's tasks across projects |

The monitor summary gains a `delivery` block.

## 6. Insights (definitions)

- **Lead time:** created → `DONE`, in days.
- **Cycle time:** first `IN_PROGRESS` → `DONE`, in days.
- **Time in status:** the sum of stays per status, from the task events (a task's current stay runs until now).
- **Burndown:** for each of the last 30 days, the open tasks (created on or before the day and not done or cancelled by then) and the scope (all tasks created by then).
- **Throughput:** tasks done per ISO week, last 8 weeks.
- **On-time rate:** done tasks with a due date that finished by it.
- **Per teammate:**
  - tasks assigned, in progress, blocked, in review, done and overdue;
  - hours logged;
  - average cycle time and on-time rate;
  - reports written;
  - last activity;
  - workload (open estimate hours).
- **School (monitor):** tasks by status, overdue, blocked, average cycle time, team projects, plan completion, and the projects most at risk.

## 7. UI

- **Drawer → "Plan" tab:**
  - a segmented control: **Plan** (phases → features, status menus, progress, generate from template), **Tasks** (a board by state with filters for mine, assignee, plan item and priority, and a list view), **Insights** (KPIs, burndown, throughput, time in status, teammates).
  - Task modal: create/edit. Task detail: history, work log, status actions.
- **Team tab:**
  - a personal/team switch;
  - teammate cards with role, responsibilities and a manager toggle;
  - an expandable report per teammate.
- **My projects:** a **My tasks** view (tasks assigned to me across projects, quick status changes).
- **Monitor dashboard:** a **Delivery** panel (school KPIs, at-risk projects).
- **Assigned projects:** plan progress on cards.
- Rules throughout: blue-only, no shadows, no accent strips, skeletons on load, toasts on every result.

## 8. Phases

1. **Data and permissions:** migration 133, core constants, access helpers (`isManager`, `canManageTasks`).
2. **Team:** mode switch, roles, responsibilities, manager rights; member data in the project detail.
3. **Implementation plan:** items CRUD, ordering, AUTO rollup, templates and generator, plan-driven project progress.
4. **Tasks:** CRUD, state machine, assignment rules, work logs, history, notifications, overdue sweep.
5. **Insights:** project delivery endpoint, per-teammate reports, monitor delivery block, My tasks endpoint.
6. **Frontend:** Plan tab (Plan, Tasks, Insights), task modal and detail, Team tab, My tasks, monitor Delivery panel, Assigned card progress.
7. **Customers (added on request):** `SideProjectCustomer` is shared by every project. See §9.
8. **Testing (after all phases):**
   - backend integration tests (rules, rollup, generator, insights maths, permissions);
   - frontend unit tests;
   - full suites and build;
   - local demo screenshots and axe in light and dark.

## 9. Customers (Phase 7, added on request)

- **Who a project is for:** `SideProject.customer_mode` is `OWN` (own initiative) or `CUSTOMER`, with `customer_id` pointing at one shared `SideProjectCustomer`. The record is registered once and reused by any number of projects.
- **Customer profile:**
  - name (unique, case- and space-insensitive);
  - kind: person, company, school, NGO, government or other;
  - contact person, email, phone, website, address, about;
  - logo: PNG/JPG/WebP stored as a FileAsset with a thumbnail. SVG is refused, so no script runs from an image URL.
- **Rights:**
  - anyone who runs projects may register customers and pick them;
  - the registrar or the projects lead edits;
  - a customer some project uses is archived (hidden from pickers) instead of deleted, and can be restored.
- **API:**

  | Method | Path |
  |---|---|
  | GET, POST | `/side-projects/customers` |
  | GET, PATCH, DELETE | `/side-projects/customers/:cid` |
  | POST | `/side-projects/customers/:cid/restore` |
  | GET | `/side-projects/customers/:cid/logo` |

  Projects take `customerMode` / `customerId` on create and on `PATCH /:id`.
- **UI:**
  - a "Who is it for?" choice in the create wizard and in the Overview edit form: a search picker with logos, plus registering a new customer in place;
  - a customer tile on Overview and a chip in the drawer header;
  - a **Customers** page under Projects (`/project-customers`);
  - a customer filter and an export column in the monitor.
