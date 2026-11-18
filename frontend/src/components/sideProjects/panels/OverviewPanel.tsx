import React, { useEffect, useState } from "react";
import { Calendar, Check, ExternalLink, Figma, FileText, Github, Globe, Link2, Pencil, Plus, Store, Trash2, UserCheck, Video, X } from "lucide-react";
import { failure, sideProjectsApi, type Category, type LinkKind, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import { CategoryPicker, CharMeter, PersonPicker, TagInput, checkGithub, checkHttps } from "../fields";
import { CATEGORY_ICON, FieldError, inputCls, inputErrCls, labelCls, primaryBtn, secondaryBtn, Spinner, cardCls } from "../ui";

const LINK_ICON: Record<LinkKind, React.ElementType> = { VIDEO: Video, DESIGN: Figma, DOCS: FileText, STORE: Store, OTHER: Link2 };
const LINK_KINDS: LinkKind[] = ["VIDEO", "DESIGN", "DOCS", "STORE", "OTHER"];

const fmtDate = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

export const ExtLink: React.FC<{ href: string; icon: React.ElementType; label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
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
    return (
      <div className="space-y-4">
        {p.rights.edit && !staff && (
          <div className="flex justify-end">
            <button type="button" className={secondaryBtn} onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
          </div>
        )}
        <section className={`${cardCls} p-4`}>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Problem</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">{p.problemStatement}</p>
          {p.description && <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">{p.description}</p>}
          {p.outcomeSummary && (
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
              <Check className="mr-1 inline h-4 w-4" /> {p.outcomeSummary}
            </div>
          )}
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`${cardCls} flex items-center gap-3 p-3`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${p.category?.color ?? "#94a3b8"}22` }}>
              <CatIcon className="h-5 w-5" style={{ color: p.category?.color ?? "#64748b" }} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-white">{p.category?.name ?? "—"}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.techTags.map((t) => (
                  <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div className={`${cardCls} flex items-center gap-3 p-3`}>
            <Calendar className="h-5 w-5 text-slate-400" aria-hidden />
            <div className="flex flex-1 items-center justify-between gap-2 text-xs">
              <div><p className="text-slate-500 dark:text-slate-400">Start</p><p className="font-bold text-slate-800 dark:text-white">{fmtDate(p.startDate) ?? "—"}</p></div>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-500" />
              <div className="text-right"><p className="text-slate-500 dark:text-slate-400">Target</p><p className="font-bold text-slate-800 dark:text-white">{fmtDate(p.targetDate) ?? "—"}</p></div>
            </div>
          </div>
          <div className={`${cardCls} flex items-center gap-3 p-3`}>
            <UserCheck className="h-5 w-5 text-slate-400" aria-hidden />
            {p.supervisor ? (
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                <UserAvatar name={p.supervisor.name} userId={p.supervisor.id} size={26} decorative /> {p.supervisor.name}
              </span>
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">—</span>
            )}
          </div>
        </div>
        {(p.githubUrl || p.accessUrl || p.links.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {p.githubUrl && <ExtLink href={p.githubUrl} icon={Github} label={p.githubUrl.replace("https://github.com/", "")} />}
            {p.accessUrl && <ExtLink href={p.accessUrl} icon={Globe} label={new URL(p.accessUrl).hostname} />}
            {p.links.map((l) => (
              <ExtLink key={l.id} href={l.url} icon={LINK_ICON[l.kind]} label={l.label} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between"><label htmlFor="ov-title" className={labelCls}>Title</label><CharMeter value={f.title} min={3} max={150} /></div>
        <input id="ov-title" value={f.title} onChange={(e) => set("title", e.target.value)} className={`${inputCls} ${errors.title ? inputErrCls : ""}`} />
        <FieldError message={errors.title} />
      </div>
      <div>
        <div className="flex items-center justify-between"><label htmlFor="ov-problem" className={labelCls}>Problem</label><CharMeter value={f.problemStatement} min={30} max={3000} /></div>
        <textarea id="ov-problem" rows={3} value={f.problemStatement} onChange={(e) => set("problemStatement", e.target.value)} className={`${inputCls} ${errors.problemStatement ? inputErrCls : ""}`} />
        <FieldError message={errors.problemStatement} />
      </div>
      <div>
        <label htmlFor="ov-desc" className={labelCls}>Description</label>
        <textarea id="ov-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
      </div>
      <div><span className={labelCls}>Category</span><CategoryPicker categories={categories} value={f.categoryId} onChange={(v) => set("categoryId", v)} /></div>
      <div><span className={labelCls}>Technologies</span><TagInput value={f.techTags} onChange={(v) => set("techTags", v)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ov-gh" className={labelCls}><Github className="mr-1 inline h-3.5 w-3.5" />GitHub</label>
          <input id="ov-gh" value={f.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} className={`${inputCls} ${errors.githubUrl ? inputErrCls : ""}`} placeholder="https://github.com/you/project" />
          <FieldError message={errors.githubUrl} />
        </div>
        <div>
          <label htmlFor="ov-live" className={labelCls}><Globe className="mr-1 inline h-3.5 w-3.5" />Live link</label>
          <input id="ov-live" value={f.accessUrl} onChange={(e) => set("accessUrl", e.target.value)} className={`${inputCls} ${errors.accessUrl ? inputErrCls : ""}`} placeholder="https://…" />
          <FieldError message={errors.accessUrl} />
        </div>
        <div>
          <label htmlFor="ov-start" className={labelCls}>Start</label>
          <input id="ov-start" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ov-target" className={labelCls}>Target</label>
          <input id="ov-target" type="date" value={f.targetDate} onChange={(e) => set("targetDate", e.target.value)} className={`${inputCls} ${errors.targetDate ? inputErrCls : ""}`} />
          <FieldError message={errors.targetDate} />
        </div>
      </div>
      <div><span className={labelCls}>Supervisor</span><PersonPicker value={f.supervisor} onChange={(v) => set("supervisor", v)} search={sideProjectsApi.supervisors} placeholder="Search a teacher" error={errors.supervisorId} /></div>
      <div>
        <span className={labelCls}>Other links</span>
        <div className="space-y-2">
          {f.links.map((l, i) => {
            const Icon = LINK_ICON[l.kind];
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-600" role="radiogroup" aria-label="Link type">
                    {LINK_KINDS.map((k) => {
                      const KI = LINK_ICON[k];
                      return (
                        <button key={k} type="button" role="radio" aria-checked={l.kind === k} aria-label={k.toLowerCase()} onClick={() => set("links", f.links.map((x, j) => (j === i ? { ...x, kind: k } : x)))} className={`rounded-lg p-1.5 ${l.kind === k ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"}`}>
                          <KI className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>
                  <input aria-label="Label" value={l.label} onChange={(e) => set("links", f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={`${inputCls} w-28`} placeholder="Label" />
                  <div className="relative flex-1">
                    <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input aria-label="Link" value={l.url} onChange={(e) => set("links", f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={`${inputCls} pl-8 ${errors[`links.${i}.url`] ? inputErrCls : ""}`} placeholder="https://…" />
                  </div>
                  <button type="button" aria-label="Remove link" onClick={() => set("links", f.links.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <FieldError message={errors[`links.${i}.url`]} />
              </div>
            );
          })}
          {f.links.length < 10 && (
            <button type="button" onClick={() => set("links", [...f.links, { kind: "OTHER", label: "", url: "" }])} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300">
              <Plus className="h-3.5 w-3.5" /> Link
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
        <button type="button" className={secondaryBtn} onClick={() => (setEdit(false), setErrors({}))}><X className="h-4 w-4" /> Cancel</button>
        <button type="button" className={primaryBtn} disabled={busy} onClick={save}>{busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save</button>
      </div>
    </div>
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
