import React, { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, Save } from "lucide-react";
import SelectField from "../ui/SelectField";
import { useToast } from "../../contexts/ToastContext";
import { primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import { errorMessage, modelDescription, myAiApi, TASK_LABELS, TASK_ORDER, type AiPersonalApp, type AiPersonalRoute, type AiTask, type MyAiCredential, type MyAiModel } from "../../api/myAi";
import { Switch } from "./ui";
import { useModels } from "./useModels";
import {
  appLabel,
  cellKey,
  cellValue,
  gridFromRoutes,
  inheritedCell,
  keyName,
  parseCellValue,
  routesFromGrid,
  taskLabel,
  type Cell,
  type CellApp,
  type CellTask,
  type Grid,
} from "./routesModel";

/**
 * "What answers what" (§9.1 item 3). Most people set the one "Use for everything" row; the
 * full grid (tasks × apps) sits behind "Advanced". Empty cells inherit, as the server does.
 */

const triggerCls =
  "w-full min-w-[10rem] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-100";

interface Props {
  credentials: MyAiCredential[];
  routes: AiPersonalRoute[];
  apps: AiPersonalApp[];
  /** The school lets a failed personal call fall back to School AI. */
  schoolFallback: boolean;
  onSaved: (routes: AiPersonalRoute[]) => void;
}

const CellPicker: React.FC<{
  id: string;
  app: CellApp;
  task: CellTask;
  grid: Grid;
  credentials: MyAiCredential[];
  models: Record<number, MyAiModel[] | undefined>;
  onChange: (c: Cell | null) => void;
  label: string;
}> = ({ id, app, task, grid, credentials, models, onChange, label }) => {
  const current = grid.cells[cellKey(app, task)];
  const inherited = inheritedCell(grid, app, task);
  const credOf = (cid: number) => credentials.find((c) => c.id === cid);
  const emptyLabel =
    app === "*" && task === "*"
      ? "School AI (default)"
      : inherited
        ? `Default: ${keyName(credOf(inherited.credentialId))} · ${inherited.model}`
        : "School AI (default)";
  // Keys usable in this column: active, and allowed in that app.
  const usable = credentials.filter((c) => c.status === "active" && (app === "*" || c.allowedApps.includes(app)));
  const currentListed = current && usable.some((c) => c.id === current.credentialId && (models[c.id] ?? []).some((m) => m.id === current.model));
  return (
    <SelectField
      id={id}
      aria-label={label}
      className={triggerCls}
      value={cellValue(current)}
      onChange={(e) => onChange(parseCellValue(e.target.value))}
      searchable="auto"
    >
      <option value="">{emptyLabel}</option>
      {current && !currentListed && (
        <option value={cellValue(current)} data-description={credOf(current.credentialId)?.status === "active" ? "Current choice" : "Current choice (key needs attention)"}>
          {`${keyName(credOf(current.credentialId))} · ${current.model}`}
        </option>
      )}
      {usable.map((c) => (
        <optgroup key={c.id} label={keyName(c)}>
          {models[c.id] === undefined ? (
            <option disabled value={`loading-${c.id}`}>
              Loading models…
            </option>
          ) : models[c.id]!.length === 0 ? (
            <option disabled value={`none-${c.id}`}>
              No models fit this
            </option>
          ) : (
            models[c.id]!.map((m) => (
              <option key={m.id} value={`${c.id}:${m.id}`} data-description={modelDescription(m) || undefined}>
                {`${keyName(c)} · ${m.name || m.id}`}
              </option>
            ))
          )}
        </optgroup>
      ))}
    </SelectField>
  );
};

/** Loads the models of every usable key for one task, then renders its row. */
const MatrixRow: React.FC<{
  task: CellTask;
  columns: CellApp[];
  grid: Grid;
  credentials: MyAiCredential[];
  schoolFallback: boolean;
  setCell: (app: CellApp, task: CellTask, c: Cell | null) => void;
  setFallback: (task: CellTask, v: "school" | "none") => void;
}> = ({ task, columns, grid, credentials, schoolFallback, setCell, setFallback }) => {
  const ids = useMemo(() => credentials.filter((c) => c.status === "active").map((c) => c.id), [credentials]);
  const models = useModels(ids, task as AiTask | "*");
  const uid = useId();
  const rowHasMine = columns.some((a) => grid.cells[cellKey(a, task)]);
  return (
    <tr className="align-top">
      <th scope="row" className="min-w-[10rem] py-2 pr-3 text-left">
        <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{taskLabel(task)}</span>
        <span className="block text-xs font-normal text-slate-600 dark:text-gray-300">{task === "*" ? "Anything not set in a row above" : TASK_LABELS[task].hint}</span>
        {schoolFallback && rowHasMine && (
          <span className="mt-1 flex items-center gap-2 text-xs font-normal text-slate-700 dark:text-gray-200">
            <Switch
              on={(grid.fallback[task] ?? "school") === "school"}
              onChange={(v) => setFallback(task, v ? "school" : "none")}
              label={`${taskLabel(task)}: if my key fails, use School AI`}
            />
            If my key fails, use School AI
          </span>
        )}
      </th>
      {columns.map((app) => (
        <td key={app} className="px-1 py-2">
          <CellPicker
            id={`${uid}-${app}`}
            app={app}
            task={task}
            grid={grid}
            credentials={credentials}
            models={models}
            onChange={(c) => setCell(app, task, c)}
            label={`${taskLabel(task)} in ${appLabel(app)}`}
          />
        </td>
      ))}
    </tr>
  );
};

const RoutesEditor: React.FC<Props> = ({ credentials, routes, apps, schoolFallback, onSaved }) => {
  const [grid, setGrid] = useState<Grid>(() => gridFromRoutes(routes));
  const [advanced, setAdvanced] = useState(() => routes.some((r) => !(r.app === "*" && r.task === "*")));
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const uid = useId();

  useEffect(() => setGrid(gridFromRoutes(routes)), [routes]);
  const dirty = useMemo(() => JSON.stringify(routesFromGrid(grid)) !== JSON.stringify(routesFromGrid(gridFromRoutes(routes))), [grid, routes]);

  const activeIds = useMemo(() => credentials.filter((c) => c.status === "active").map((c) => c.id), [credentials]);
  const everythingModels = useModels(activeIds, "*");

  const setCell = (app: CellApp, task: CellTask, c: Cell | null) =>
    setGrid((g) => {
      const cells = { ...g.cells };
      if (c) cells[cellKey(app, task)] = c;
      else delete cells[cellKey(app, task)];
      return { ...g, cells };
    });
  const setFallback = (task: CellTask, v: "school" | "none") => setGrid((g) => ({ ...g, fallback: { ...g.fallback, [task]: v } }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await myAiApi.saveRoutes(routesFromGrid(grid));
      onSaved(r.data.data);
      showToast("Saved. Your AI choices apply now in the MIS and within a few minutes in the other apps.", "success");
    } catch (e) {
      showToast(errorMessage(e, "Couldn't save your choices."), "error");
    } finally {
      setBusy(false);
    }
  };

  const columns: CellApp[] = ["*", ...apps];
  const rows: CellTask[] = [...TASK_ORDER, "*"];
  const allHasMine = !!grid.cells[cellKey("*", "*")];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
        <label htmlFor={`${uid}-all`} className="block text-sm font-semibold text-slate-900 dark:text-white">
          Use for everything
        </label>
        <p className="mb-2 text-xs text-slate-600 dark:text-gray-300">One choice for all AI in every app. Rows under Advanced override it.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <CellPicker
              id={`${uid}-all`}
              app="*"
              task="*"
              grid={grid}
              credentials={credentials}
              models={everythingModels}
              onChange={(c) => setCell("*", "*", c)}
              label="Use for everything"
            />
          </div>
          {schoolFallback && allHasMine && (
            <span className="flex items-center gap-2 text-xs text-slate-700 dark:text-gray-200">
              <Switch
                on={(grid.fallback["*"] ?? "school") === "school"}
                onChange={(v) => setFallback("*", v ? "school" : "none")}
                label="Everything: if my key fails, use School AI"
              />
              If my key fails, use School AI
            </span>
          )}
        </div>
        {!schoolFallback && <p className="mt-2 text-xs text-slate-600 dark:text-gray-300">The school has turned off falling back: if your key fails, you'll see why instead of a School AI answer.</p>}
      </div>

      <div>
        <button
          type="button"
          aria-expanded={advanced}
          aria-controls={`${uid}-adv`}
          onClick={() => setAdvanced((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
        >
          <ChevronDown className={`h-4 w-4 transition ${advanced ? "rotate-180" : ""}`} aria-hidden /> Advanced: choose per task and app
        </button>
        {advanced && (
          <div id={`${uid}-adv`} className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 p-2 dark:border-gray-700/40">
            <table className="w-full min-w-[46rem] border-collapse">
              <caption className="sr-only">Which AI answers each task in each app</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">
                    Task
                  </th>
                  {columns.map((a) => (
                    <th key={a} scope="col" className="px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">
                      {appLabel(a)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-gray-700/40">
                {rows.map((t) => (
                  <MatrixRow
                    key={t}
                    task={t}
                    columns={columns}
                    grid={grid}
                    credentials={credentials}
                    schoolFallback={schoolFallback}
                    setCell={setCell}
                    setFallback={setFallback}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {dirty && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setGrid(gridFromRoutes(routes))}>
            Discard
          </button>
        )}
        <button type="button" className={primaryBtn} disabled={!dirty || busy} onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save choices"}
        </button>
      </div>
    </div>
  );
};

export default RoutesEditor;
