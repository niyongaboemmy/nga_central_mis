import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Check, ExternalLink, Figma, Flag, Quote, Tag, Trophy, FileText, Github, Globe, Link2, Pencil, Plus, Store, Trash2, UserCheck, Video, X } from "lucide-react";
import { failure, sideProjectsApi, type Category, type LinkKind, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import { CategoryPicker, PersonPicker, TagInput, checkGithub, checkHttps } from "../fields";
import { Field, FormSection, IconInput, TextArea } from "../form";
import { CATEGORY_ICON, FieldError, iconBtn, inputCls, inputErrCls, primaryBtn, secondaryBtn, Spinner, cardCls } from "../ui";

const LINK_ICON: Record<LinkKind, React.ElementType> = { VIDEO: Video, DESIGN: Figma, DOCS: FileText, STORE: Store, OTHER: Link2 };
const LINK_KINDS: LinkKind[] = ["VIDEO", "DESIGN", "DOCS", "STORE", "OTHER"];

const fmtDate = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

export const ExtLink: React.FC<{ href: string; icon: React.ElementType; label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100">
    <Icon className="h-4 w-4" aria-hidden />
    <span className="max-w-[12rem] truncate">{label}</span>
    <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
  </a>
);

const OverviewPanel: React.FC<{ p: ProjectDetail; categories: Category[]; onSaved: () => void; staff?: boolean }> = ({ p, categories, onSaved, staff }) => {
  const { showToast } = useToast();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(() => init(p));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!edit) setF(init(p));
  }, [p, edit]);

  const save = async () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = "At least 3 characters";
    if (f.problemStatement.trim().length < 30) e.problemStatement = "At least 30 characters";
    const g = checkGithub(f.githubUrl);
    if (g) e.githubUrl = g;
    const a = checkHttps(f.accessUrl);
    if (a) e.accessUrl = a;
    if (f.startDate && f.targetDate && f.targetDate < f.startDate) e.targetDate = "Before the start date";
    f.links.forEach((l, i) => {
      const m = checkHttps(l.url) ?? (l.url.trim() ? null : "Add the link");
      if (m) e[`links.${i}.url`] = m;
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await sideProjectsApi.update(p.id, {
        title: f.title,
        problemStatement: f.problemStatement,
        description: f.description,
        categoryId: f.categoryId,
        techTags: f.techTags,
        githubUrl: f.githubUrl,
        accessUrl: f.accessUrl,
        startDate: f.startDate || null,
        targetDate: f.targetDate || null,
        supervisorId: f.supervisor?.id ?? null,
        links: f.links.filter((l) => l.url.trim()),
      });
      setEdit(false);
      showToast("Saved", "success");
      onSaved();
    } catch (err) {
      const x = failure(err);
      if (x.field) setErrors({ [x.field]: x.message });
      else showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!edit) {
    const CatIcon = CATEGORY_ICON[p.category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
    const catColor = p.category?.color ?? "#64748b";
    const canEdit = p.rights.edit && !staff;
    const links = [
      ...(p.githubUrl ? [{ key: "gh", href: p.githubUrl, icon: Github, label: "GitHub", sub: p.githubUrl.replace("https://github.com/", "") }] : []),
      ...(p.accessUrl ? [{ key: "live", href: p.accessUrl, icon: Globe, label: "Live app", sub: hostOf(p.accessUrl) }] : []),
      ...p.links.map((l) => ({ key: `l${l.id}`, href: l.url, icon: LINK_ICON[l.kind], label: l.label, sub: hostOf(l.url) })),
    ];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">About this project</h3>
          {canEdit && (
            <button type="button" className={`${secondaryBtn} !min-h-[36px] !px-4 !py-1.5`} onClick={() => setEdit(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        {/* Problem (and outcome) */}
        <section className={`${cardCls} relative overflow-hidden p-5 pl-6`}>
          <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-600 to-blue-400" aria-hidden />
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <Quote className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">The problem</p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-800 dark:text-gray-100">{p.problemStatement}</p>
              {p.description && <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600 dark:border-gray-700/40 dark:text-gray-300">{p.description}</p>}
            </div>
          </div>
          {p.outcomeSummary && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Outcome</p>
                <p className="mt-0.5 text-sm text-emerald-900 dark:text-emerald-100">{p.outcomeSummary}</p>
              </div>
            </div>
          )}
        </section>

        {/* Facts */}
        <div className="grid gap-3 sm:grid-cols-3">
          <FactTile label="Category" icon={Tag}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${catColor}1a`, color: catColor }}>
                <CatIcon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.category?.name ?? "Not set"}</span>
            </div>
            {p.techTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {p.techTags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-gray-700/60 dark:text-gray-300">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </FactTile>
          <TimelineTile start={p.startDate ?? p.startedAt?.slice(0, 10) ?? p.createdAt.slice(0, 10)} target={p.targetDate} done={p.status === "COMPLETED"} />
          <FactTile label="Supervisor" icon={UserCheck}>
            {p.supervisor ? (
              <div className="flex items-center gap-2.5">
                <UserAvatar name={p.supervisor.name} userId={p.supervisor.id} size={36} decorative />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.supervisor.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">Guides this project</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-gray-600">
                  <UserCheck className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-600 dark:text-gray-300">Not assigned</p>
                  {canEdit && (
                    <button type="button" onClick={() => setEdit(true)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-300">
                      Add one
                    </button>
                  )}
                </div>
              </div>
            )}
          </FactTile>
        </div>

        {/* Links */}
        {links.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {links.map((l) => (
              <a
                key={l.key}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cardCls} group flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white transition group-hover:bg-blue-600 dark:bg-gray-700">
                  <l.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{l.label}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-gray-400">{l.sub}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
              </a>
            ))}
          </div>
        ) : (
          canEdit && (
            <button type="button" onClick={() => setEdit(true)} className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 dark:border-gray-700/60 dark:text-gray-400 dark:hover:bg-blue-500/10">
              <Link2 className="h-4 w-4" aria-hidden /> Add a GitHub, live or demo link
            </button>
          )
        )}
      </div>
    );
  }

  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  const linkAt = (i: number, patch: Partial<(typeof f.links)[number]>) => set("links", f.links.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="space-y-7 p-5 sm:p-6">
        <FormSection title="About" icon={FileText}>
          <Field label="Title" htmlFor="ov-title" counter={{ value: f.title, min: 3, max: 150 }} error={errors.title}>
            <input id="ov-title" value={f.title} onChange={(e) => set("title", e.target.value)} className={`${inputCls} font-semibold ${errors.title ? inputErrCls : ""}`} />
          </Field>
          <Field label="Problem it solves" htmlFor="ov-problem" counter={{ value: f.problemStatement, min: 30, max: 3000 }} error={errors.problemStatement}>
            <TextArea id="ov-problem" rows={3} value={f.problemStatement} onChange={(e) => set("problemStatement", e.target.value)} invalid={!!errors.problemStatement} />
          </Field>
          <Field label="Description" htmlFor="ov-desc" optional>
            <TextArea id="ov-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="How it works, what makes it special…" />
          </Field>
          <Field label="Category" optional>
            <CategoryPicker categories={categories} value={f.categoryId} onChange={(v) => set("categoryId", v)} />
          </Field>
          <Field label="Technologies" optional>
            <TagInput value={f.techTags} onChange={(v) => set("techTags", v)} />
          </Field>
        </FormSection>

        <FormSection title="Links" icon={Link2}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GitHub repository" htmlFor="ov-gh" error={errors.githubUrl}>
              <IconInput id="ov-gh" icon={Github} value={f.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} invalid={!!errors.githubUrl} placeholder="github.com/you/project" />
            </Field>
            <Field label="Live link" htmlFor="ov-live" error={errors.accessUrl}>
              <IconInput id="ov-live" icon={Globe} value={f.accessUrl} onChange={(e) => set("accessUrl", e.target.value)} invalid={!!errors.accessUrl} placeholder="https://…" />
            </Field>
          </div>
          <div className="space-y-3">
            {f.links.map((l, i) => {
              const Icon = LINK_ICON[l.kind];
              return (
                <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-gray-700/40 dark:bg-gray-800/30">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-full border border-slate-200 bg-white p-1 dark:border-gray-700/60 dark:bg-gray-800/40" role="radiogroup" aria-label="Link type">
                      {LINK_KINDS.map((k) => {
                        const KI = LINK_ICON[k];
                        return (
                          <button key={k} type="button" role="radio" aria-checked={l.kind === k} aria-label={k.toLowerCase()} title={k.charAt(0) + k.slice(1).toLowerCase()} onClick={() => linkAt(i, { kind: k })} className={`flex h-7 w-7 items-center justify-center rounded-full transition ${l.kind === k ? "bg-blue-600 text-white " : "text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700/50"}`}>
                            <KI className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>
                    <input aria-label="Label" value={l.label} onChange={(e) => linkAt(i, { label: e.target.value })} className={`${inputCls} !min-h-[38px] w-32 !py-1.5`} placeholder="Label" />
                    <button type="button" aria-label="Remove link" onClick={() => set("links", f.links.filter((_, j) => j !== i))} className={`${iconBtn} ml-auto hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/10`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <IconInput aria-label="Link" icon={Icon} value={l.url} onChange={(e) => linkAt(i, { url: e.target.value })} invalid={!!errors[`links.${i}.url`]} placeholder="https://…" />
                    <FieldError message={errors[`links.${i}.url`]} />
                  </div>
                </motion.div>
              );
            })}
            {f.links.length < 10 && (
              <button type="button" onClick={() => set("links", [...f.links, { kind: "OTHER", label: "", url: "" }])} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-solid hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-700/60 dark:text-gray-300 dark:hover:bg-blue-500/10">
                <Plus className="h-3.5 w-3.5" /> Add a link (video, design, docs…)
              </button>
            )}
          </div>
        </FormSection>

        <FormSection title="Plan" icon={Calendar}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="ov-start">
              <IconInput id="ov-start" icon={Calendar} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </Field>
            <Field label="Target date" htmlFor="ov-target" error={errors.targetDate}>
              <IconInput id="ov-target" icon={Flag} type="date" value={f.targetDate} onChange={(e) => set("targetDate", e.target.value)} invalid={!!errors.targetDate} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </Field>
          </div>
          <Field label="Supervisor" icon={UserCheck}>
            <PersonPicker value={f.supervisor} onChange={(v) => set("supervisor", v)} search={sideProjectsApi.supervisors} placeholder="Search a teacher" error={errors.supervisorId} />
          </Field>
        </FormSection>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/80 px-5 py-4 sm:px-6 dark:border-gray-700/40 dark:bg-gray-800/40">
        <button type="button" className={secondaryBtn} onClick={() => (setEdit(false), setErrors({}))}>
          <X className="h-4 w-4" /> Cancel
        </button>
        <button type="button" className={primaryBtn} disabled={busy} onClick={save}>
          {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save changes
        </button>
      </div>
    </div>
  );
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

const FactTile: React.FC<{ label: string; icon: React.ElementType; children: React.ReactNode }> = ({ label, icon: Icon, children }) => (
  <div className={`${cardCls} flex flex-col p-4`}>
    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </p>
    {children}
  </div>
);

const DAY = 86_400_000;
/** Start → target with how much of the time has gone, and days left (or overdue). */
const TimelineTile: React.FC<{ start: string; target: string | null; done: boolean }> = ({ start, target, done }) => {
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const t = target ? new Date(`${target}T00:00:00Z`).getTime() : null;
  const now = Date.now();
  const pct = t && t > s ? Math.max(0, Math.min(100, ((now - s) / (t - s)) * 100)) : 0;
  const left = t ? Math.ceil((t - now) / DAY) : null;
  const chip =
    done ? { text: "Finished", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" }
    : left === null ? { text: "No target", cls: "bg-slate-100 text-slate-600 dark:bg-gray-700/60 dark:text-gray-300" }
    : left < 0 ? { text: `${-left}d overdue`, cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" }
    : left === 0 ? { text: "Due today", cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" }
    : { text: `${left}d left`, cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" };
  return (
    <FactTile label="Timeline" icon={Calendar}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Start</span>
          <span className="font-bold text-slate-900 dark:text-white">{fmtDate(start) ?? "—"}</span>
        </span>
        <span className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Target</span>
          <span className="font-bold text-slate-900 dark:text-white">{fmtDate(target) ?? "—"}</span>
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700/60" role="img" aria-label={t ? `${Math.round(pct)}% of the time used` : "No target date"}>
        <motion.div className={`h-full rounded-full ${left !== null && left < 0 && !done ? "bg-red-500" : "bg-gradient-to-r from-blue-600 to-blue-400"}`} initial={{ width: 0 }} animate={{ width: `${done ? 100 : pct}%` }} transition={{ duration: 0.8 }} />
      </div>
      <span className={`mt-2.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.text}</span>
    </FactTile>
  );
};

function init(p: ProjectDetail) {
  return {
    title: p.title,
    problemStatement: p.problemStatement,
    description: p.description ?? "",
    categoryId: p.category?.id ?? null,
    techTags: p.techTags,
    githubUrl: p.githubUrl ?? "",
    accessUrl: p.accessUrl ?? "",
    startDate: p.startDate ?? "",
    targetDate: p.targetDate ?? "",
    supervisor: p.supervisor as { id: number; name: string } | null,
    links: p.links.map((l) => ({ kind: l.kind, label: l.label, url: l.url })),
  };
}

export default OverviewPanel;
