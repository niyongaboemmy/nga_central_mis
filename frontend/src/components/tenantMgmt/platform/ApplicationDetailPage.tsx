import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  AtSign,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  GraduationCap,
  History,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Phone,
  Receipt,
  RotateCcw,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  UserPlus,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Modal from "../../ui/Modal";
import { Burst, EmptyState, JourneyStepper, PackageCard, Segmented, StatusPill, Timeline, entIcon } from "../kit";
import {
  APP_LABELS,
  platformApi,
  publicApi,
  type ApplicationDetail,
  type ApplicationDocument,
  type BillingCycle,
  type Entitlement,
  type PackageInfo,
  type ThreadMessage,
} from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, IconBtn, Lightbox, ReasonDialog, Spinner, TabBar, act, cx, errorText, fmtDate, fmtDateTime, initials, inputCls, isPdf, usePlatform } from "./platformShared";
import { InvoiceList } from "./BillingPage";

type Action = ApplicationDetail["allowedActions"][number];
type Tab = "school" | "documents" | "checklist" | "messages" | "timeline" | "billing";

const ACTION_META: Record<Action, { label: string; icon: LucideIcon; tone: "primary" | "danger" | "success" | "warning" | "ghost" }> = {
  assign: { label: "Assign", icon: UserPlus, tone: "ghost" },
  start_review: { label: "Review", icon: Search, tone: "primary" },
  request_changes: { label: "Changes", icon: MessageSquareWarning, tone: "warning" },
  reject: { label: "Reject", icon: XCircle, tone: "danger" },
  approve: { label: "Approve", icon: CheckCircle2, tone: "success" },
  reopen: { label: "Reopen", icon: RotateCcw, tone: "ghost" },
};
const ACTION_ORDER: Action[] = ["assign", "start_review", "request_changes", "reject", "reopen", "approve"];

const DOC_LABELS: Record<string, string> = { REGISTRATION_CERT: "Registration", AUTHORISATION_LETTER: "Authorisation", LOGO: "Logo", OTHER: "Other" };
const DUP_LABELS: Record<string, string> = { NAME: "Name", EMAIL_DOMAIN: "Email", PHONE: "Phone", SLUG: "Address" };

const ApplicationDetailPage: React.FC = () => {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { reload } = usePlatform();
  const [d, setD] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("school");
  const [dialog, setDialog] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformApi.application(id).then(setD, (e) => setError(errorText(e)));
  }, [id]);

  if (error) return <EmptyState icon={TriangleAlert} title={error} />;
  if (!d) return <Spinner />;
  const a = d.application;
  const failed = ["REJECTED", "PAYMENT_REJECTED", "PROVISIONING_FAILED", "EXPIRED", "WITHDRAWN"].includes(a.status);

  const apply = async (fn: () => Promise<ApplicationDetail>, ok: string) => {
    const next = await act(fn, ok);
    if (next) {
      setD(next);
      setDialog(null);
      void reload();
    }
    return next;
  };

  const actions = ACTION_ORDER.filter((x) => d.allowedActions.includes(x));
  const missingDocs = d.requiredDocuments.filter((k) => !d.documents.some((doc) => doc.kind === k && doc.status !== "REJECTED"));
  const unread = d.messages.filter((m) => m.author === "APPLICANT" && !m.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/platform/applications" className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Back to applications">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900 dark:text-white">{a.schoolName}</h1>
        <StatusPill status={a.status} />
        {d.assignedTo && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200" title={d.assignedTo.name}>
            {initials(d.assignedTo.name)}
            <span className="sr-only">Assigned to {d.assignedTo.name}</span>
          </span>
        )}
      </div>
      <Card>
        <JourneyStepper current={a.step} failed={failed} />
      </Card>
      {d.duplicates.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Possible duplicates">
          {d.duplicates.map((h) => (
            <li key={`${h.kind}-${h.id}-${h.reason}`}>
              <Link
                to={h.kind === "TENANT" ? `/platform/schools/${h.id}` : `/platform/applications/${h.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-100"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                {h.name}
                <span className="opacity-80">· {DUP_LABELS[h.reason] ?? h.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TabBar
        id="app-detail"
        label="Application"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "school", label: "School", icon: Building2 },
          { value: "documents", label: "Documents", icon: FileText, badge: missingDocs.length },
          { value: "checklist", label: "Checklist", icon: ClipboardList },
          { value: "messages", label: "Messages", icon: MessageSquare, badge: unread },
          { value: "timeline", label: "Timeline", icon: History },
          { value: "billing", label: "Billing", icon: Receipt },
        ]}
      />

      <div role="tabpanel">
        {tab === "school" && <SchoolTab d={d} />}
        {tab === "documents" && <DocumentsTab d={d} missing={missingDocs} onDoc={(doc) => setD({ ...d, documents: d.documents.map((x) => (x.id === doc.id ? doc : x)) })} />}
        {tab === "checklist" && <ChecklistTab d={d} onChange={(checklist) => setD({ ...d, checklist })} />}
        {tab === "messages" && <MessagesTab d={d} onSent={(msg) => setD({ ...d, messages: [...d.messages, msg] })} />}
        {tab === "timeline" && <Timeline events={[...d.timeline].sort((x, y) => y.at.localeCompare(x.at))} />}
        {tab === "billing" &&
          (d.invoice ? (
            <InvoiceList
              invoices={[d.invoice]}
              onChange={(inv) => setD({ ...d, invoice: inv })}
            />
          ) : (
            <EmptyState icon={Receipt} title="No invoice" />
          ))}
      </div>

      {actions.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap justify-end gap-2" role="toolbar" aria-label="Decision">
            {actions.map((x) => {
              const meta = ACTION_META[x];
              return (
                <Btn
                  key={x}
                  icon={meta.icon}
                  tone={meta.tone}
                  busy={busy && x === "start_review"}
                  onClick={async () => {
                    if (x !== "start_review") return setDialog(x);
                    setBusy(true);
                    await apply(() => platformApi.startReview(id), "Review started");
                    setBusy(false);
                  }}
                >
                  {meta.label}
                </Btn>
              );
            })}
          </div>
        </div>
      )}

      <AssignDialog open={dialog === "assign"} current={d.assignedTo?.id ?? null} onClose={() => setDialog(null)} onPick={(uid) => apply(() => platformApi.assign(id, uid), "Assigned")} />
      <ReasonDialog
        open={dialog === "request_changes"}
        title="Request changes"
        icon={MessageSquareWarning}
        confirmText="Send"
        tone="warning"
        placeholder="Message to the school"
        onClose={() => setDialog(null)}
        onSubmit={(msg) => apply(() => platformApi.requestChanges(id, msg), "Changes requested")}
      />
      <ReasonDialog
        open={dialog === "reject"}
        title="Reject"
        icon={XCircle}
        confirmText="Reject"
        tone="danger"
        placeholder="Reason"
        onClose={() => setDialog(null)}
        onSubmit={(r) => apply(() => platformApi.reject(id, r), "Rejected")}
      />
      <ReasonDialog
        open={dialog === "reopen"}
        title="Reopen"
        icon={RotateCcw}
        confirmText="Reopen"
        placeholder="Reason"
        onClose={() => setDialog(null)}
        onSubmit={(r) => apply(() => platformApi.reopen(id, r), "Reopened")}
      />
      {dialog === "approve" && <ApproveDialog d={d} onClose={() => setDialog(null)} onApproved={(next) => (setD(next), void reload())} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// School tab
// ---------------------------------------------------------------------------

const SchoolTab: React.FC<{ d: ApplicationDetail }> = ({ d }) => {
  const a = d.application;
  const rows: Array<[LucideIcon, string, React.ReactNode]> = [
    [Building2, "Type", a.schoolType],
    [MapPin, "Location", [a.sector, a.district, a.province, a.country].filter(Boolean).join(", ")],
    [MapPin, "Address", a.address],
    [Phone, "Phone", a.schoolPhone],
    [AtSign, "Email", a.schoolEmail],
    [Link2, "Website", a.website],
    [GraduationCap, "Students", a.estStudents?.toLocaleString()],
    [Users, "Staff", a.estStaff?.toLocaleString()],
    [Link2, "Address wanted", a.desiredSlug],
    [Receipt, "Package", a.requestedPackage && `${a.requestedPackage} · ${a.billingCycle === "YEAR" ? "Year" : "Term"}`],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([Icon, label, value]) => (
            <div key={label} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-slate-600 dark:text-slate-300">{label}</dt>
                <dd className="break-words text-sm font-medium text-slate-900 dark:text-white">{value || "—"}</dd>
              </div>
            </div>
          ))}
        </dl>
        {a.requestedApps.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Apps wanted">
            {a.requestedApps.map((k) => {
              const Icon = entIcon(k);
              return (
                <li key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {APP_LABELS[k] ?? k}
                </li>
              );
            })}
          </ul>
        )}
        {a.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{a.notes}</p>}
      </Card>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{initials(d.applicant.fullName)}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{d.applicant.fullName}</p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-600 dark:text-slate-300">
              {d.applicant.email}
              {d.applicant.emailVerified && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified" />}
            </p>
            {d.applicant.phone && <p className="text-xs text-slate-600 dark:text-slate-300">{d.applicant.phone}</p>}
          </div>
        </div>
        <dl className="mt-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex justify-between">
            <dt>Ref</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{a.ref ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Submitted</dt>
            <dd>{fmtDate(a.submittedAt)}</dd>
          </div>
          {a.decisionReason && (
            <div>
              <dt>Decision</dt>
              <dd className="text-slate-900 dark:text-white">{a.decisionReason}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

const DocumentsTab: React.FC<{ d: ApplicationDetail; missing: string[]; onDoc: (doc: ApplicationDocument) => void }> = ({ d, missing, onDoc }) => {
  const [preview, setPreview] = useState<ApplicationDocument | null>(null);
  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Missing documents">
          {missing.map((k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:bg-red-400/15 dark:text-red-200">
              <X className="h-3.5 w-3.5" aria-hidden />
              {DOC_LABELS[k] ?? k}
            </li>
          ))}
        </ul>
      )}
      {d.documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.documents.map((doc) => (
            <DocCard key={doc.id} appId={d.application.id} doc={doc} onPreview={() => setPreview(doc)} onDoc={onDoc} />
          ))}
        </ul>
      )}
      <Lightbox url={preview?.url ?? null} title={preview ? DOC_LABELS[preview.kind] ?? preview.kind : ""} onClose={() => setPreview(null)} />
    </div>
  );
};

const DocCard: React.FC<{ appId: number; doc: ApplicationDocument; onPreview: () => void; onDoc: (d: ApplicationDocument) => void }> = ({ appId, doc, onPreview, onDoc }) => {
  const [note, setNote] = useState(doc.note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const review = async (status: "ACCEPTED" | "REJECTED") => {
    setBusy(status);
    const next = await act(() => platformApi.reviewDocument(appId, doc.id, status, note.trim() || undefined));
    setBusy(null);
    if (next) onDoc(next);
  };
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button type="button" onClick={onPreview} className="flex h-36 w-full items-center justify-center bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-800">
        {isPdf(doc.url) ? <FileText className="h-12 w-12 text-slate-400" aria-hidden /> : <img src={doc.url} alt="" className="h-full w-full object-cover" />}
        <span className="sr-only">Preview {DOC_LABELS[doc.kind] ?? doc.kind}</span>
      </button>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{DOC_LABELS[doc.kind] ?? doc.kind}</span>
          <StatusPill status={doc.status === "ACCEPTED" ? "CONFIRMED" : doc.status} label={doc.status === "PENDING" ? "Pending" : doc.status === "ACCEPTED" ? "Accepted" : "Rejected"} />
        </div>
        <input aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className={cx(inputCls, "py-1.5")} />
        <div className="flex gap-2" role="group" aria-label="Decision">
          <button
            type="button"
            aria-pressed={doc.status === "ACCEPTED"}
            onClick={() => review("ACCEPTED")}
            disabled={!!busy}
            className={cx(
              "flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
              doc.status === "ACCEPTED" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200",
            )}
          >
            {busy === "ACCEPTED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" aria-hidden />}
            Accept
          </button>
          <button
            type="button"
            aria-pressed={doc.status === "REJECTED"}
            onClick={() => review("REJECTED")}
            disabled={!!busy || !note.trim()}
            title={note.trim() ? undefined : "Add a note"}
            className={cx(
              "flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              doc.status === "REJECTED" ? "bg-red-600 text-white" : "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-400/10 dark:text-red-200",
            )}
          >
            {busy === "REJECTED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" aria-hidden />}
            Reject
          </button>
        </div>
      </div>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Checklist tab
// ---------------------------------------------------------------------------

const ChecklistTab: React.FC<{ d: ApplicationDetail; onChange: (c: ApplicationDetail["checklist"]) => void }> = ({ d, onChange }) => {
  const m = useMotion();
  const [busy, setBusy] = useState<string | null>(null);
  const done = d.checklist.filter((c) => c.checked).length;
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
          <motion.div className="h-full rounded-full bg-emerald-500" animate={{ width: `${d.checklist.length ? (done / d.checklist.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
          {done}/{d.checklist.length}
        </span>
      </div>
      <ul className="space-y-1">
        {d.checklist.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              role="checkbox"
              aria-checked={c.checked}
              disabled={busy === c.key}
              onClick={async () => {
                setBusy(c.key);
                const next = await act(() => platformApi.setChecklist(d.application.id, c.key, !c.checked));
                setBusy(null);
                if (next) onChange(next);
              }}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800"
            >
              <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors", c.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 dark:border-slate-600")}>
                <AnimatePresence>{c.checked && <motion.span {...m("check")}><Check className="h-4 w-4" aria-hidden /></motion.span>}</AnimatePresence>
              </span>
              <span className={cx("flex-1 text-sm", c.checked ? "text-slate-600 line-through dark:text-slate-300" : "font-medium text-slate-900 dark:text-white")}>{c.label}</span>
              {c.checked && c.checkedBy && (
                <span className="text-right text-[11px] text-slate-600 dark:text-slate-300">
                  {c.checkedBy}
                  <br />
                  {fmtDateTime(c.checkedAt)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Messages tab
// ---------------------------------------------------------------------------

const MessagesTab: React.FC<{ d: ApplicationDetail; onSent: (m: ThreadMessage) => void }> = ({ d, onSent }) => {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const m = useMotion();
  useEffect(() => end.current?.scrollIntoView?.({ block: "end" }), [d.messages.length]);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const msg = await act(() => platformApi.sendMessage(d.application.id, body.trim(), internal));
    setBusy(false);
    if (msg) {
      onSent(msg);
      setBody("");
    }
  };
  return (
    <Card className="flex flex-col gap-3">
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1" aria-label="Messages">
        <AnimatePresence initial={false}>
          {d.messages.map((msg) => {
            const mine = msg.author === "PLATFORM";
            return (
              <motion.li key={msg.id} {...m("reveal")} className={cx("flex", mine ? "justify-end" : msg.author === "SYSTEM" ? "justify-center" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    msg.internal
                      ? "border border-dashed border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50"
                      : mine
                        ? "bg-brand-600 text-white"
                        : msg.author === "SYSTEM"
                          ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white",
                  )}
                >
                  <div className={cx("mb-0.5 flex items-center gap-1 text-[11px] font-semibold", mine && !msg.internal ? "text-white/85" : "text-slate-600 dark:text-slate-300")}>
                    {msg.internal && <Lock className="h-3 w-3" aria-label="Internal" />}
                    {msg.authorName ?? msg.author.toLowerCase()} · {fmtDateTime(msg.at)}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  {msg.attachmentUrl && (
                    <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline">
                      <FileText className="h-3 w-3" aria-hidden />
                      File
                    </a>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        <div ref={end} />
      </ul>
      {d.messages.length === 0 && <EmptyState icon={MessageSquare} title="No messages" />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className={cx("flex items-end gap-2 rounded-2xl p-2", internal ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-400/10" : "bg-slate-50 dark:bg-slate-800")}
      >
        <button
          type="button"
          aria-pressed={internal}
          onClick={() => setInternal(!internal)}
          title="Internal note"
          className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", internal ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700")}
        >
          <Lock className="h-4 w-4" aria-hidden />
          <span className="sr-only">Internal note</span>
        </button>
        <textarea
          aria-label={internal ? "Internal note" : "Message"}
          placeholder={internal ? "Internal note" : "Message"}
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          className="max-h-32 min-h-[2.25rem] flex-1 resize-y bg-transparent px-1 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none dark:text-white"
        />
        <IconBtn icon={busy ? Loader2 : Send} label="Send" type="submit" disabled={busy || !body.trim()} className="bg-brand-600 text-white hover:bg-brand-700 dark:text-white dark:hover:bg-brand-700" />
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Assign dialog
// ---------------------------------------------------------------------------

const AssignDialog: React.FC<{ open: boolean; current: number | null; onClose: () => void; onPick: (uid: number | null) => Promise<unknown> }> = ({ open, current, onClose, onPick }) => {
  const [staff, setStaff] = useState<Array<{ id: number; name: string }> | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open && !staff) platformApi.staff().then(setStaff, () => setStaff([]));
  }, [open, staff]);
  const shown = (staff ?? []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal isOpen={open} onClose={onClose} title={<span className="flex items-center gap-2"><UserPlus className="h-5 w-5" aria-hidden />Assign</span>} size="sm">
      <input aria-label="Search staff" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
      {!staff ? (
        <Spinner />
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {current !== null && (
            <li>
              <button type="button" onClick={() => onPick(null)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10">
                <X className="h-4 w-4" aria-hidden />
                Unassign
              </button>
            </li>
          )}
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={s.id === current}
                onClick={() => onPick(s.id)}
                className={cx("flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800", s.id === current && "bg-brand-50 dark:bg-brand-500/10")}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{initials(s.name)}</span>
                <span className="flex-1 font-medium text-slate-900 dark:text-white">{s.name}</span>
                {s.id === current && <Check className="h-4 w-4 text-brand-600" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Approve dialog: package, cycle, slug (live check), apps, note
// ---------------------------------------------------------------------------

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const ApproveDialog: React.FC<{ d: ApplicationDetail; onClose: () => void; onApproved: (next: ApplicationDetail) => void }> = ({ d, onClose, onApproved }) => {
  const a = d.application;
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [catalog, setCatalog] = useState<Entitlement[]>([]);
  const [code, setCode] = useState<string>(a.approvedPackage ?? a.requestedPackage ?? "");
  const [cycle, setCycle] = useState<BillingCycle>(a.billingCycle ?? "TERM");
  const [slug, setSlug] = useState(a.desiredSlug ?? slugify(a.schoolName));
  const [slugState, setSlugState] = useState<{ checking: boolean; available: boolean | null; suggestion: string | null; reason?: string }>({ checking: false, available: null, suggestion: null });
  const [apps, setApps] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    platformApi.packages().then((p) => {
      const usable = p.filter((x) => x.isActive);
      setPackages(usable);
      setCode((c) => (usable.some((x) => x.code === c) ? c : usable[0]?.code ?? ""));
    }, () => setPackages([]));
    platformApi.entitlementCatalog().then(setCatalog, () => undefined);
  }, []);

  const pkg = packages?.find((p) => p.code === code) ?? null;
  const pkgApps = useMemo(() => (pkg ? pkg.entitlements.filter((e) => e.kind === "APP").map((e) => e.key) : []), [pkg]);
  // default: the apps the school asked for that the package holds (else all of the package's)
  useEffect(() => {
    if (!pkg) return;
    const wanted = a.requestedApps.filter((k) => pkgApps.includes(k));
    setApps(wanted.length ? wanted : pkgApps);
  }, [pkg, pkgApps, a.requestedApps]);

  useEffect(() => {
    const s = slug.trim();
    if (!s) return setSlugState({ checking: false, available: false, suggestion: null });
    setSlugState((x) => ({ ...x, checking: true }));
    let live = true;
    const t = window.setTimeout(() => {
      publicApi.slugAvailable(s).then(
        (r) => live && setSlugState({ checking: false, available: r.available, suggestion: r.suggestion, reason: r.reason }),
        () => live && setSlugState({ checking: false, available: null, suggestion: null }),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [slug]);

  const canSubmit = !!pkg && !!slug.trim() && slugState.available !== false && !slugState.checking && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const next = await act(
      () => platformApi.approve(a.id, { packageCode: code, billingCycle: cycle, slug: slug.trim(), apps: apps ?? undefined, note: note.trim() || undefined }),
      "Approved",
    );
    setBusy(false);
    if (next) {
      setDone(true);
      onApproved(next);
      window.setTimeout(onClose, 1400);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} size="2xl" title={<span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />Approve</span>}>
      <div className="relative space-y-5">
        <Burst show={done} />
        <AnimatePresence>
          {done && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2 py-10" role="status">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                <Check className="h-9 w-9" aria-hidden />
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">Approved</span>
            </motion.div>
          )}
        </AnimatePresence>
        {!done && (
          <>
            <div className="flex justify-end">
              <Segmented label="Billing cycle" value={cycle} onChange={setCycle} options={[{ value: "TERM", label: "Term" }, { value: "YEAR", label: "Year" }]} />
            </div>
            {!packages ? (
              <Spinner />
            ) : (
              <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Package">
                {packages.map((p) => (
                  <PackageCard key={p.code} pkg={p} allEntitlements={catalog.length ? catalog : undefined} cycle={cycle} selected={p.code === code} recommended={p.code === a.requestedPackage} onSelect={() => setCode(p.code)} />
                ))}
              </div>
            )}

            <div>
              <label htmlFor="approve-slug" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Address
              </label>
              <div className="flex items-center gap-2">
                <input id="approve-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value) || e.target.value.toLowerCase())} className={cx(inputCls, "font-mono")} aria-describedby="approve-slug-state" />
                <span id="approve-slug-state" className="flex h-8 w-8 shrink-0 items-center justify-center" aria-live="polite">
                  {slugState.checking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Checking" />
                  ) : slugState.available === true ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Available" />
                  ) : slugState.available === false ? (
                    <XCircle className="h-5 w-5 text-red-600" aria-label={slugState.reason ?? "Taken"} />
                  ) : null}
                </span>
              </div>
              {slugState.available === false && slugState.suggestion && (
                <button type="button" onClick={() => setSlug(slugState.suggestion!)} className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100">
                  <Copy className="h-3 w-3" aria-hidden />
                  {slugState.suggestion}
                </button>
              )}
            </div>

            {pkgApps.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Apps</p>
                <div className="flex flex-wrap gap-2">
                  {pkgApps.map((k) => {
                    const on = apps?.includes(k) ?? false;
                    const Icon = entIcon(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        disabled={k === "app.mis"}
                        onClick={() => setApps((cur) => (on ? (cur ?? []).filter((x) => x !== k) : [...(cur ?? []), k]))}
                        className={cx(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
                          on ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {APP_LABELS[k] ?? k}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <textarea aria-label="Note" placeholder="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            <div className="flex justify-end gap-2">
              <Btn onClick={onClose} disabled={busy}>
                Cancel
              </Btn>
              <Btn tone="success" icon={CheckCircle2} onClick={submit} disabled={!canSubmit} busy={busy}>
                Approve
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ApplicationDetailPage;
