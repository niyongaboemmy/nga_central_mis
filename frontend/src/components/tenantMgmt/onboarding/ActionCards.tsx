import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, FileUp, MessageSquareWarning, PartyPopper, PencilLine, Receipt, RotateCcw, Send, Hourglass } from "lucide-react";
import {
  applicantApi,
  publicApi,
  setOnboardingToken,
  type DocumentKind,
  type NextAction,
  type OnboardingMe,
  type PaymentMethod,
} from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { ActionCard, Burst } from "../kit";
import InvoiceCard from "../shared/InvoiceCard";
import PaymentProofForm from "../shared/PaymentProofForm";
import SchoolFields, { type Divisions } from "../register/SchoolFields";
import { DocumentDrops } from "../register/StepReview";
import { ErrorLine, RateLimitNotice, Shake, ghostBtn, primaryBtn } from "../register/fields";
import { apiErr, schoolFormFrom, validateSchool, type ApiErr, type SchoolErrors, type SchoolForm } from "../register/wizardState";
import { WaitIllustration } from "./LiveBits";

type Props = { me: OnboardingMe; reload: () => Promise<void> | void };

/** The reviewer's latest "changes requested" note. */
export const reviewerNote = (me: OnboardingMe) =>
  [...me.timeline].sort((a, b) => b.at.localeCompare(a.at)).find((e) => e.to === "CHANGES_REQUESTED" && e.message)?.message ?? me.application?.decisionReason ?? null;

const FixChanges: React.FC<Props> = ({ me, reload }) => {
  const app = me.application!;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SchoolForm>(() => schoolFormFrom(app));
  const [divisions, setDivisions] = useState<Divisions>({});
  const [errors, setErrors] = useState<SchoolErrors>({});
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const note = reviewerNote(me);

  useEffect(() => {
    if (editing) publicApi.adminDivisions().then(setDivisions).catch(() => setDivisions({}));
  }, [editing]);

  const resubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = editing ? validateSchool(form, slugOk) : {};
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setErr(null);
    try {
      if (editing) {
        const { slugTouched: _s, ...rest } = form;
        await applicantApi.updateApplication(app.id, {
          ...rest,
          schoolName: rest.schoolName.trim(),
          desiredSlug: rest.desiredSlug || null,
          sector: rest.sector || null,
          address: rest.address || null,
          schoolPhone: rest.schoolPhone || null,
          schoolEmail: rest.schoolEmail || null,
          website: rest.website || null,
        });
      }
      await applicantApi.submit(app.id, { acceptTerms: true });
      setEditing(false);
      await reload();
    } catch (e2) {
      setErr(apiErr(e2, "Could not resubmit"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionCard icon={MessageSquareWarning} title="Changes requested" tone="amber" pulse={!editing}>
      {note && <blockquote className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-slate-800 dark:bg-amber-400/10 dark:text-slate-100">{note}</blockquote>}
      <form onSubmit={resubmit} noValidate className="mt-3">
        {editing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-3 overflow-visible">
            <SchoolFields value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} errors={errors} divisions={divisions} onSlugState={setSlugOk} ownSlug={app.desiredSlug} checkSimilar={false} />
          </motion.div>
        )}
        {err && (err.status === 429 ? <RateLimitNotice seconds={err.retryAfter ?? 60} nonce={err} /> : <Shake error={err.message}><ErrorLine error={err.message} /></Shake>)}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {!editing && (
            <button type="button" className={ghostBtn} onClick={() => setEditing(true)}>
              <PencilLine className="h-4 w-4" aria-hidden />
              Edit details
            </button>
          )}
          <button type="submit" className={primaryBtn} disabled={busy}>
            <Send className="h-4 w-4" aria-hidden />
            Resubmit
          </button>
        </div>
      </form>
    </ActionCard>
  );
};

/** Kinds still needed: required ones with no live file, plus rejected ones. */
export const missingDocuments = (me: OnboardingMe): DocumentKind[] => {
  const latest = new Map<DocumentKind, (typeof me.documents)[number]>();
  [...me.documents].sort((a, b) => a.at.localeCompare(b.at)).forEach((d) => latest.set(d.kind, d));
  const kinds = new Set<DocumentKind>(me.requiredDocuments);
  latest.forEach((d, k) => d.status === "REJECTED" && kinds.add(k));
  return [...kinds].filter((k) => {
    const d = latest.get(k);
    return !d || d.status === "REJECTED";
  });
};

const UploadDocuments: React.FC<Props> = ({ me, reload }) => {
  const kinds = useMemo(() => missingDocuments(me), [me]);
  return (
    <ActionCard icon={FileUp} title="Upload documents" tone="violet" pulse>
      <div className="mt-2">
        <DocumentDrops applicationId={me.application!.id} kinds={kinds.length ? kinds : me.requiredDocuments} documents={me.documents} onUploaded={() => void reload()} />
      </div>
    </ActionCard>
  );
};

const methodsOf = (me: OnboardingMe): PaymentMethod[] | undefined => {
  const ms = Array.from(new Set(me.paymentInstructions.filter((i) => i.isActive !== false).map((i) => i.method)));
  return ms.length ? ms : undefined;
};

const PayInvoice: React.FC<Props> = ({ me, reload }) => {
  const [paying, setPaying] = useState(false);
  const inv = me.invoice;
  if (!inv) return null;
  return (
    <ActionCard icon={Receipt} title="Invoice ready" tone="brand" pulse={!paying}>
      <div className="mt-2 space-y-3">
        <InvoiceCard invoice={inv} instructions={me.paymentInstructions} pdfUrl={applicantApi.invoicePdfUrl(inv.id)} onPay={paying ? undefined : () => setPaying(true)} />
        {paying && (
          <PaymentProofForm
            invoice={inv}
            methods={methodsOf(me)}
            onCancel={() => {
              setPaying(false);
              void reload();
            }}
            // the form shows its own success state; Close (onCancel) refreshes the tracker
            onSubmit={async (body, proof) => {
              await applicantApi.submitPayment(inv.id, body, proof);
            }}
          />
        )}
      </div>
    </ActionCard>
  );
};

const ReuploadPayment: React.FC<Props> = ({ me, reload }) => {
  const inv = me.invoice;
  if (!inv) return null;
  const rejected = [...inv.payments].filter((p) => p.status === "REJECTED").sort((a, b) => (b.reviewedAt ?? b.submittedAt).localeCompare(a.reviewedAt ?? a.submittedAt))[0];
  return (
    <ActionCard icon={RotateCcw} title="Payment not accepted" tone="red">
      {rejected?.reviewNote && <blockquote className="rounded-xl border-l-4 border-red-400 bg-red-50 px-3 py-2 text-slate-800 dark:bg-red-400/10 dark:text-slate-100">{rejected.reviewNote}</blockquote>}
      <div className="mt-3">
        <PaymentProofForm
          invoice={inv}
          methods={methodsOf(me)}
          onCancel={() => void reload()}
          onSubmit={async (body, proof) => {
            await applicantApi.submitPayment(inv.id, body, proof);
          }}
        />
      </div>
    </ActionCard>
  );
};

const GoToSchool: React.FC<Props> = ({ me }) => {
  const m = useMotion();
  const school = me.school;
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-center text-white shadow-xl">
      <Burst show />
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
        <PartyPopper className="h-8 w-8" aria-hidden />
      </motion.span>
      <h3 className="mt-3 text-2xl font-extrabold">Your school is live</h3>
      {school && <p className="mt-1 font-medium text-white/95">{school.name}</p>}
      <motion.button
        type="button"
        {...m("tap")}
        disabled={!school}
        onClick={() => {
          if (!school) return;
          setOnboardingToken(null);
          window.location.assign(school.loginUrl);
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-bold text-emerald-800 shadow-lg hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
      >
        Go to your school
        <ArrowRight className="h-5 w-5" aria-hidden />
      </motion.button>
    </div>
  );
};

const ContinueDraft: React.FC = () => (
  <ActionCard
    icon={PencilLine}
    title="Finish registration"
    tone="brand"
    pulse
    action={
      <Link to="/register-school" className={primaryBtn}>
        Continue
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    }
  />
);

const Wait: React.FC<Props> = ({ me }) => (
  <ActionCard icon={Hourglass} title="Nothing to do" tone="emerald">
    <div className="mt-2">
      <WaitIllustration status={me.application!.status} />
    </div>
  </ActionCard>
);

const RENDER: Partial<Record<NextAction, React.FC<Props>>> = {
  FIX_CHANGES: FixChanges,
  UPLOAD_DOCUMENTS: UploadDocuments,
  PAY_INVOICE: PayInvoice,
  REUPLOAD_PAYMENT: ReuploadPayment,
  GO_TO_SCHOOL: GoToSchool,
  WAIT: Wait,
};

/** One card per next action, in the order the server sends them. */
const ActionCards: React.FC<Props> = ({ me, reload }) => {
  if (!me.application) return null;
  const actions = me.nextActions;
  const draft = actions.some((a) => a === "VERIFY_EMAIL" || a === "COMPLETE_DRAFT" || a === "SUBMIT");
  return (
    <div className="space-y-4">
      {draft && <ContinueDraft />}
      {actions.map((a) => {
        const C = RENDER[a];
        return C ? <C key={a} me={me} reload={reload} /> : null;
      })}
    </div>
  );
};

export default ActionCards;
