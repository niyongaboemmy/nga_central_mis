import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpenText, Briefcase, ChevronDown, Lightbulb, Check, ExternalLink, Figma, Tag, Target, Trophy, FileText, Github, Globe, Link2, Pencil, Plus, Store, Trash2, UserCheck, Video, X } from "lucide-react";
import { failure, sideProjectsApi, type Category, type LinkKind, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import StageTimeline from "./StageTimeline";
import { CUSTOMER_KIND_META, CustomerField, CustomerLogo } from "../customers/CustomerParts";
import type { Customer } from "../../../api/sideProjects";
import ContributionGraph from "./ContributionGraph";
import { CategoryPicker, PersonPicker, TagInput, checkGithub, checkHttps } from "../fields";
import { Field, FormSection, IconInput, TextArea } from "../form";
import { ABSTRACT_MAX, ABSTRACT_MIN, CATEGORY_ICON, FieldError, iconBtn, inputCls, inputErrCls, primaryBtn, secondaryBtn, Spinner, cardCls } from "../ui";

const LINK_ICON: Record<LinkKind, React.ElementType> = { VIDEO: Video, DESIGN: Figma, DOCS: FileText, STORE: Store, OTHER: Link2 };
const LINK_KINDS: LinkKind[] = ["VIDEO", "DESIGN", "DOCS", "STORE", "OTHER"];


export const ExtLink: React.FC<{ href: string; icon: React.ElementType; label: string }> = ({ href, icon: Icon, label }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-full border border-slate-900/[0.07] bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-white/10 dark:bg-gray-800/40 dark:text-gray-100">
    <Icon className="h-4 w-4" aria-hidden />
    <span className="max-w-[12rem] truncate">{label}</span>
    <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
  </a>
);

const OverviewPanel: React.FC<{ p: ProjectDetail; categories: Category[]; onSaved: () => void; staff?: boolean; wide?: boolean }> = ({ p, categories, onSaved, staff, wide }) => {
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
    const ab = f.abstract.trim();
    if (ab || p.abstract) {
      if (ab.length < ABSTRACT_MIN) e.abstract = `${ABSTRACT_MIN - ab.length} more characters`;
      else if (ab.length > ABSTRACT_MAX) e.abstract = `At most ${ABSTRACT_MAX} characters`;
    }
    if (f.problemStatement.trim().length < 30) e.problemStatement = "At least 30 characters";
    const g = checkGithub(f.githubUrl);
    if (g) e.githubUrl = g;
    if (f.customerMode === "CUSTOMER" && !f.customer) e.customerId = "Choose or register the customer";
    const a = checkHttps(f.accessUrl);
    if (a) e.accessUrl = a;
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
        ...(f.abstract.trim() ? { abstract: f.abstract.trim() } : {}),
        problemStatement: f.problemStatement,
        description: f.description,
        categoryId: f.categoryId,
        techTags: f.techTags,
        githubUrl: f.githubUrl,
        accessUrl: f.accessUrl,
        supervisorId: f.supervisor?.id ?? null,
        customerMode: f.customerMode,
        customerId: f.customerMode === "CUSTOMER" ? (f.customer?.id ?? null) : null,
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

        {/* Abstract first: the project in a few sentences, then the problem and the approach */}
        <AbstractCard p={p} canEdit={canEdit} onSaved={onSaved} />
        <div className={`grid gap-3 ${p.description ? "md:grid-cols-2" : ""}`}>
          <StoryCard icon={Target} title="The problem" text={p.problemStatement} />
          {p.description && <StoryCard icon={Lightbulb} title="The approach" text={p.description} />}
        </div>
        {p.outcomeSummary && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Trophy className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Outcome</p>
              <p className="mt-0.5 text-sm leading-6 text-emerald-900/90 dark:text-emerald-100/90">{p.outcomeSummary}</p>
            </div>
          </div>
        )}

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
          <FactTile label="Customer" icon={Briefcase}>
            {p.customerDetail ? (
              <div className="flex items-start gap-2.5">
                <CustomerLogo c={p.customerDetail} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.customerDetail.name}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-gray-400">
                    {CUSTOMER_KIND_META[p.customerDetail.kind]?.label}
                    {p.customerDetail.contactName ? ` · ${p.customerDetail.contactName}` : ""}
                  </p>
                  {(p.customerDetail.email || p.customerDetail.phone) && (
                    <p className="mt-1 truncate text-[11px]">
                      {p.customerDetail.email ? (
                        <a href={`mailto:${p.customerDetail.email}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{p.customerDetail.email}</a>
                      ) : (
                        <a href={`tel:${p.customerDetail.phone}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{p.customerDetail.phone}</a>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                  <Lightbulb className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Own initiative</p>
                  {canEdit && (
                    <button type="button" onClick={() => setEdit(true)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-300">
                      Set a customer
                    </button>
                  )}
                </div>
              </div>
            )}
          </FactTile>
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
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-slate-900/10 text-slate-400 dark:border-gray-600">
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

        {/* Time: planned vs actual per stage, and the daily work calendar */}
        <div className={`grid gap-4 ${wide ? "2xl:grid-cols-2" : ""}`}>
          <StageTimeline p={p} canEdit={p.rights.edit || p.rights.manageAny} onSaved={onSaved} />
          <ContributionGraph projectId={p.id} refreshKey={p.lastActivityAt} />
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
            <button type="button" onClick={() => setEdit(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-900/[0.07] p-4 text-sm font-semibold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 dark:border-white/10 dark:text-gray-400 dark:hover:bg-blue-500/10">
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
          <Field label="Abstract" htmlFor="ov-abstract" counter={{ value: f.abstract, min: ABSTRACT_MIN, max: ABSTRACT_MAX }} error={errors.abstract} hint="Introduce the project in two or three sentences: what it is and who it is for.">
            <TextArea id="ov-abstract" rows={3} value={f.abstract} onChange={(e) => set("abstract", e.target.value)} invalid={!!errors.abstract} placeholder="A web app that…" />
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
                <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-900/[0.07] bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-gray-800/30">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-full border border-slate-900/[0.07] bg-white p-1 dark:border-white/10 dark:bg-gray-800/40" role="radiogroup" aria-label="Link type">
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
              <button type="button" onClick={() => set("links", [...f.links, { kind: "OTHER", label: "", url: "" }])} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-900/10 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-solid hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:text-gray-300 dark:hover:bg-blue-500/10">
                <Plus className="h-3.5 w-3.5" /> Add a link (video, design, docs…)
              </button>
            )}
          </div>
        </FormSection>

        <FormSection title="Who is it for?" icon={Briefcase}>
          <CustomerField mode={f.customerMode} customer={f.customer} error={errors.customerId} onChange={(m, c) => setF((x) => ({ ...x, customerMode: m, customer: c === undefined ? x.customer : c }))} />
        </FormSection>

        <FormSection title="Supervision" icon={UserCheck}>
          <Field label="Supervisor" icon={UserCheck}>
            <PersonPicker value={f.supervisor} onChange={(v) => set("supervisor", v)} search={(q: string) => sideProjectsApi.supervisors(q, p.id)} placeholder="Search a teacher" error={errors.supervisorId} />
          </Field>
        </FormSection>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-900/[0.06] bg-slate-50/80 px-5 py-4 sm:px-6 dark:border-white/[0.06] dark:bg-gray-800/40">
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
    <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-gray-400">
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </p>
    {children}
  </div>
);

function init(p: ProjectDetail) {
  return {
    title: p.title,
    abstract: p.abstract ?? "",
    problemStatement: p.problemStatement,
    description: p.description ?? "",
    categoryId: p.category?.id ?? null,
    techTags: p.techTags,
    githubUrl: p.githubUrl ?? "",
    accessUrl: p.accessUrl ?? "",
    startDate: p.startDate ?? "",
    targetDate: p.targetDate ?? "",
    supervisor: p.supervisor as { id: number; name: string } | null,
    customerMode: (p.customerMode ?? "OWN") as "OWN" | "CUSTOMER",
    customer: (p.customerDetail ?? null) as Customer | null,
    links: p.links.map((l) => ({ kind: l.kind, label: l.label, url: l.url })),
  };
}

export default OverviewPanel;

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/**
 * The abstract opens the project. The team adds or edits it in place (2-3 sentences); a project
 * without one shows the team a prompt and everyone else a quiet note.
 */
const AbstractCard: React.FC<{ p: ProjectDetail; canEdit: boolean; onSaved: () => void }> = ({ p, canEdit, onSaved }) => {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.abstract ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(p.abstract ?? "");
  }, [p.abstract, editing]);
  const len = draft.trim().length;

  const save = async () => {
    if (len < ABSTRACT_MIN) return setError(`${ABSTRACT_MIN - len} more characters`);
    if (len > ABSTRACT_MAX) return setError(`At most ${ABSTRACT_MAX} characters`);
    setBusy(true);
    try {
      await sideProjectsApi.update(p.id, { abstract: draft.trim() });
      setEditing(false);
      setError(null);
      showToast("Abstract saved", "success");
      onSaved();
    } catch (err) {
      const x = failure(err, "The abstract wasn't saved");
      setError(x.message);
      showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${cardCls} group p-5 sm:p-6`} aria-labelledby="sp-abstract-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
            <BookOpenText className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <h4 id="sp-abstract-title" className="text-sm font-semibold text-slate-900 dark:text-white">Abstract</h4>
        </div>
        <div className="flex items-center gap-2">
          {p.abstract && !editing && (
            <span className="text-xs text-slate-500 dark:text-gray-400">{words(p.abstract)} words · under a minute</span>
          )}
          {canEdit && p.abstract && !editing && (
            <button type="button" aria-label="Edit the abstract" onClick={() => setEditing(true)} className={`${iconBtn} opacity-70 transition group-hover:opacity-100`}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-4">
          <label htmlFor="sp-abstract-edit" className="sr-only">Abstract</label>
          <textarea
            id="sp-abstract-edit"
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
            placeholder="A web app that… It helps… so that…"
            aria-invalid={!!error}
            aria-describedby="sp-abstract-help"
            className={`${inputCls} min-h-[96px] resize-y text-[15px] leading-7 ${error ? inputErrCls : ""}`}
          />
          <div id="sp-abstract-help" className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${error ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-gray-400"}`}>
              {error ?? "Two or three sentences: what it is, who it is for, what it changes."}
            </p>
            <div className="flex items-center gap-2">
              <span className={`text-xs tabular-nums ${len > ABSTRACT_MAX || (len > 0 && len < ABSTRACT_MIN) ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-gray-400"}`}>
                {len}/{ABSTRACT_MAX}
              </span>
              <button type="button" onClick={() => setEditing(false)} className={`${secondaryBtn} !min-h-[34px] !px-3.5 !py-1 !text-xs`}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy} className={`${primaryBtn} !min-h-[34px] !px-3.5 !py-1 !text-xs`}>
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save
              </button>
            </div>
          </div>
        </div>
      ) : p.abstract ? (
        <p className="mt-4 whitespace-pre-line text-[17px] leading-8 text-slate-800 dark:text-gray-100">{p.abstract}</p>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-blue-500/30 bg-blue-50/50 px-4 py-4 text-left transition hover:border-blue-500/60 hover:bg-blue-50 dark:border-blue-400/25 dark:bg-blue-500/[0.06] dark:hover:bg-blue-500/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-blue-800 dark:text-blue-200">Add an abstract</span>
            <span className="block text-xs text-blue-800 dark:text-blue-200/90">Introduce the project in two or three sentences, so readers know what it is before the details.</span>
          </span>
        </button>
      ) : (
        <p className="mt-4 text-sm text-slate-500 dark:text-gray-400">The team hasn't written an abstract yet.</p>
      )}
    </section>
  );
};

/** A titled block of project text; long text folds with "Read more". */
const StoryCard: React.FC<{ icon: React.ElementType; title: string; text: string }> = ({ icon: Icon, title, text }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 || text.split("\n").length > 5;
  return (
    <section className={`${cardCls} flex flex-col p-5`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-gray-300">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
      </div>
      <p className={`mt-3 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-gray-300 ${long && !open ? "line-clamp-5" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 self-start text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
          {open ? "Show less" : "Read more"} <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </section>
  );
};
