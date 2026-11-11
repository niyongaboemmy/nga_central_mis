import React, { useEffect, useState } from "react";
import { Building2, FileBadge2, FileCheck2, FileText, Image as ImageIcon, Package as PackageIcon, Pencil, Send, UserRound, type LucideIcon } from "lucide-react";
import { applicantApi, type Application, type ApplicationDocument, type DocumentKind, type PackageInfo } from "../../../api/tenantMgmt";
import { DropZone } from "../kit";
import Captcha, { type CaptchaProvider } from "./Captcha";
import { SCHOOL_TYPES } from "./SchoolFields";
import { ErrorLine, RateLimitNotice, Shake, StepFooter, cx, iconBtn } from "./fields";
import { OpenApplicationLink } from "./StepAdmin";
import { apiErr, type ApiErr, type WizardState } from "./wizardState";

export const DOC_LABELS: Record<DocumentKind, { label: string; icon: LucideIcon }> = {
  REGISTRATION_CERT: { label: "Registration certificate", icon: FileBadge2 },
  AUTHORISATION_LETTER: { label: "Authorisation letter", icon: FileText },
  LOGO: { label: "Logo", icon: ImageIcon },
  OTHER: { label: "Other document", icon: FileText },
};

const SummaryCard: React.FC<{ icon: LucideIcon; title: string; onEdit: () => void; children: React.ReactNode }> = ({ icon: Icon, title, onEdit, children }) => (
  <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <h3 className="flex-1 font-semibold text-slate-900 dark:text-white">{title}</h3>
      <button type="button" className={iconBtn} onClick={onEdit}>
        <Pencil className="h-4 w-4" aria-hidden />
        <span className="sr-only">Edit {title}</span>
      </button>
    </div>
    <div className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">{children}</div>
  </section>
);

/** Required documents as drop zones; a kind with a pending/accepted file shows a tick. */
export const DocumentDrops: React.FC<{ applicationId: number; kinds: DocumentKind[]; documents: ApplicationDocument[]; onUploaded: (d: ApplicationDocument) => void }> = ({
  applicationId,
  kinds,
  documents,
  onUploaded,
}) => {
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!kinds.length) return null;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => {
          const latest = documents.filter((d) => d.kind === k).sort((a, b) => b.at.localeCompare(a.at))[0];
          const done = !!latest && latest.status !== "REJECTED";
          const meta = DOC_LABELS[k] ?? DOC_LABELS.OTHER;
          return (
            <div key={k}>
              <DropZone
                label={meta.label}
                icon={meta.icon}
                busy={busy === k}
                done={done}
                onFile={async (f) => {
                  setBusy(k);
                  setError(null);
                  try {
                    onUploaded(await applicantApi.uploadDocument(applicationId, k, f));
                  } catch (e) {
                    setError(apiErr(e, "Upload failed").message);
                  } finally {
                    setBusy(null);
                  }
                }}
              />
              {latest?.status === "REJECTED" && latest.note && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{latest.note}</p>}
            </div>
          );
        })}
      </div>
      <ErrorLine error={error} />
    </div>
  );
};

const StepReview: React.FC<{
  wiz: WizardState;
  packages: PackageInfo[] | null;
  captcha: { provider: CaptchaProvider | null; siteKey: string | null } | null;
  onEdit: (step: number) => void;
  onBack: () => void;
  /** patch the draft with the latest fields and submit it */
  submit: (captchaToken?: string) => Promise<Application>;
  onSubmitted: (a: Application) => void;
}> = ({ wiz, packages, captcha, onEdit, onBack, submit, onSubmitted }) => {
  const [required, setRequired] = useState<DocumentKind[]>([]);
  const [docs, setDocs] = useState<ApplicationDocument[]>([]);
  const [terms, setTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const needCaptcha = !!(captcha?.provider && captcha.siteKey);

  useEffect(() => {
    let live = true;
    applicantApi
      .me()
      .then((me) => {
        if (!live) return;
        setRequired(me.requiredDocuments.filter((k) => k !== "LOGO"));
        setDocs(me.documents);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const s = wiz.school;
  const pkg = packages?.find((p) => p.code === wiz.requestedPackage);
  const type = SCHOOL_TYPES.find((t) => t.value === s.schoolType);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) {
      setTermsError("Accept to continue");
      document.getElementById("register-terms")?.focus();
      return;
    }
    if (needCaptcha && !captchaToken) {
      setErr({ status: 0, message: "Tick the box", fields: {} });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      onSubmitted(await submit(captchaToken ?? undefined));
    } catch (e2) {
      setErr(apiErr(e2, "Could not submit"));
      setCaptchaToken(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Building2} title="School" onEdit={() => onEdit(0)}>
          <p className="font-medium text-slate-900 dark:text-white">{s.schoolName}</p>
          <p className="flex items-center gap-1">{type && <type.icon className="h-3.5 w-3.5" aria-hidden />}{type?.label}</p>
          <p>{[s.sector, s.district, s.province].filter(Boolean).join(", ")}</p>
          <p className="truncate font-mono text-xs">{s.desiredSlug}.amashuri.com</p>
        </SummaryCard>
        <SummaryCard icon={PackageIcon} title="Package" onEdit={() => onEdit(1)}>
          <p className="font-medium text-slate-900 dark:text-white">{pkg?.name ?? wiz.requestedPackage}</p>
          <p>{wiz.billingCycle === "YEAR" ? "Yearly" : "Per term"}</p>
        </SummaryCard>
        <SummaryCard icon={UserRound} title="Administrator" onEdit={() => onEdit(2)}>
          <p className="font-medium text-slate-900 dark:text-white">{wiz.admin.fullName}</p>
          <p className="truncate">{wiz.admin.email}</p>
        </SummaryCard>
      </div>

      {wiz.applicationId && required.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <FileCheck2 className="h-4 w-4" aria-hidden />
            Documents <span className="font-normal text-slate-600 dark:text-slate-300">(or later)</span>
          </h3>
          <DocumentDrops applicationId={wiz.applicationId} kinds={required} documents={docs} onUploaded={(d) => setDocs((x) => [...x, d])} />
        </div>
      )}

      <Shake error={termsError} className="mt-5">
        <label className={cx("flex items-start gap-3 rounded-2xl border p-3", termsError ? "border-red-500" : "border-slate-200 dark:border-slate-700")}>
          <input
            id="register-terms"
            type="checkbox"
            checked={terms}
            onChange={(e) => {
              setTerms(e.target.checked);
              setTermsError(null);
            }}
            aria-invalid={!!termsError}
            className="mt-0.5 h-5 w-5 rounded border-slate-400 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-800 dark:text-slate-100">
            I accept the{" "}
            <a href="/terms/" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline dark:text-brand-200">
              terms
            </a>{" "}
            and{" "}
            <a href="/privacy/" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline dark:text-brand-200">
              data processing
            </a>
          </span>
        </label>
        <ErrorLine error={termsError} />
      </Shake>

      {needCaptcha && (
        <div className="mt-3">
          <Captcha provider={captcha!.provider!} siteKey={captcha!.siteKey!} onToken={setCaptchaToken} />
        </div>
      )}

      {err && (
        <div className="mt-3">
          {err.status === 429 ? (
            <RateLimitNotice seconds={err.retryAfter ?? 60} nonce={err} onDone={() => setErr(null)} />
          ) : (
            <Shake error={err.message}>
              <ErrorLine error={err.message} />
              {err.status === 409 && err.code !== "INVALID_TRANSITION" && <OpenApplicationLink />}
            </Shake>
          )}
        </div>
      )}
      <StepFooter onBack={onBack} primary="Submit" busy={busy} primaryIcon={Send} />
    </form>
  );
};

export default StepReview;
