import React, { useEffect, useId, useState } from "react";
import { KeyRound, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Modal from "../ui/Modal";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import { inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn } from "../officeHours/ohUi";
import { APP_LABELS, balanceText, errorMessage, myAiApi, type AiPersonalApp, type MyAiCredential } from "../../api/myAi";
import { AI_PERSONAL_APPS } from "../../vendor/nga-access";
import { Badge, StatusDot, Switch, relTime } from "./ui";

/** One connected key: health, balance, last use, and Test now / Edit / Delete. */
const CredentialCard: React.FC<{
  credential: MyAiCredential;
  isStudent: boolean;
  /** Apps where My AI is on at this school. */
  apps: AiPersonalApp[];
  onChanged: (c: MyAiCredential | null) => void;
}> = ({ credential: c, isStudent, apps, onChanged }) => {
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const { showToast } = useToast();
  const balance = balanceText(c.balance);
  const used = relTime(c.lastUsedAt);
  const checked = relTime(c.lastValidatedAt);

  const test = async () => {
    setTesting(true);
    try {
      const r = await myAiApi.test(c.id);
      onChanged(r.data.data);
      showToast(r.data.data.status === "active" ? `${c.label} works.` : r.data.data.statusDetail || "The key needs attention.", r.data.data.status === "active" ? "success" : "warning");
    } catch (e) {
      showToast(errorMessage(e, "Couldn't test the key."), "error");
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${c.label}?`,
      message: "The key is erased from the MIS. Anything you set it to answer goes back to School AI. The key itself still works at the provider; revoke it there if you no longer need it.",
      confirmText: "Delete key",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await myAiApi.remove(c.id);
      onChanged(null);
      showToast("Key deleted.", "success");
    } catch (e) {
      showToast(errorMessage(e, "Couldn't delete the key."), "error");
    }
  };

  const headingId = `cred-${c.id}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/40 dark:bg-gray-800/40">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-gray-700/50 dark:text-gray-200" aria-hidden>
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {c.label}
          </h3>
          <p className="text-xs text-slate-600 dark:text-gray-300">
            {c.providerLabel} · <span className="font-mono">…{c.keyHint}</span>
            {c.authType === "oauth_pkce" && " · connected"}
          </p>
        </div>
        <StatusDot status={c.status} />
      </div>

      {c.statusDetail && c.status !== "active" && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{c.statusDetail}</p>}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-gray-300 sm:grid-cols-2">
        {balance && (
          <div>
            <dt className="inline font-semibold text-slate-700 dark:text-gray-200">Balance: </dt>
            <dd className="inline">{balance}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-semibold text-slate-700 dark:text-gray-200">Last used: </dt>
          <dd className="inline">{used ?? "never"}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-700 dark:text-gray-200">Checked: </dt>
          <dd className="inline">{checked ?? "not yet"}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-700 dark:text-gray-200">Daily limit: </dt>
          <dd className="inline">{c.dailyRequestCap ? `${c.dailyRequestCap} requests` : "none"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline font-semibold text-slate-700 dark:text-gray-200">Apps: </dt>
          <dd className="inline">{c.allowedApps.length ? c.allowedApps.map((a) => APP_LABELS[a]).join(", ") : "none"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1">
        {c.models.length > 0 && <Badge>{c.models.length} models</Badge>}
        {c.freeOnly && <Badge tone="green">Free models only</Badge>}
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" className={`${secondaryBtn} !px-3 !py-1.5 !text-xs`} onClick={() => void test()} disabled={testing}>
          <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} aria-hidden /> {testing ? "Testing…" : "Test now"}
          <span className="sr-only"> {c.label}</span>
        </button>
        <button type="button" className={`${secondaryBtn} !px-3 !py-1.5 !text-xs`} onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit<span className="sr-only"> {c.label}</span>
        </button>
        <button type="button" className={`${dangerBtn} !px-3 !py-1.5 !text-xs`} onClick={() => void remove()}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete<span className="sr-only"> {c.label}</span>
        </button>
      </div>

      <EditCredentialModal
        isOpen={editing}
        credential={c}
        isStudent={isStudent}
        apps={apps}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          setEditing(false);
          onChanged(next);
        }}
      />
    </article>
  );
};

/** Rename, allowed apps, daily limit, replace key, OpenRouter free-only (staff). */
export const EditCredentialModal: React.FC<{
  isOpen: boolean;
  credential: MyAiCredential;
  isStudent: boolean;
  apps: AiPersonalApp[];
  onClose: () => void;
  onSaved: (c: MyAiCredential) => void;
}> = ({ isOpen, credential: c, isStudent, apps, onClose, onSaved }) => {
  const [label, setLabel] = useState(c.label);
  const [allowed, setAllowed] = useState<AiPersonalApp[]>(c.allowedApps);
  const [cap, setCap] = useState(c.dailyRequestCap ? String(c.dailyRequestCap) : "");
  const [apiKey, setApiKey] = useState("");
  const [freeOnly, setFreeOnly] = useState(c.freeOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const uid = useId();

  useEffect(() => {
    if (!isOpen) return;
    setLabel(c.label);
    setAllowed(c.allowedApps);
    setCap(c.dailyRequestCap ? String(c.dailyRequestCap) : "");
    setApiKey("");
    setFreeOnly(c.freeOnly);
    setError(null);
  }, [isOpen, c]);

  // Every app the key could be used from; apps the school has turned off are shown but noted.
  const shownApps = AI_PERSONAL_APPS;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const capNum = cap.trim() ? Number(cap) : null;
    if (capNum !== null && (!Number.isInteger(capNum) || capNum < 1 || capNum > 100000)) {
      setError("The daily limit must be a whole number from 1 to 100000, or empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await myAiApi.update(c.id, {
        label: label.trim(),
        allowedApps: allowed,
        dailyRequestCap: capNum,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(c.provider === "openrouter" && !isStudent ? { freeOnly } : {}),
      });
      showToast(apiKey.trim() ? "Key replaced and checked." : "Saved.", "success");
      onSaved(r.data.data);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the key."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${c.label}`} size="lg">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div>
          <label htmlFor={`${uid}-label`} className={labelCls}>
            Name
          </label>
          <input id={`${uid}-label`} className={inputCls} value={label} maxLength={80} required onChange={(e) => setLabel(e.target.value)} />
        </div>

        <fieldset>
          <legend className={labelCls}>Use this key in</legend>
          <div className="grid grid-cols-2 gap-2">
            {shownApps.map((a) => (
              <label key={a} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 dark:border-gray-700/50 dark:text-gray-100">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400"
                  checked={allowed.includes(a)}
                  onChange={(e) => setAllowed((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))}
                />
                {APP_LABELS[a]}
                {!apps.includes(a) && <span className="text-xs text-slate-600 dark:text-gray-300">(off at school)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${uid}-cap`} className={labelCls}>
            Daily limit (requests)
          </label>
          <input
            id={`${uid}-cap`}
            className={inputCls}
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            placeholder="No limit"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            aria-describedby={`${uid}-cap-hint`}
          />
          <p id={`${uid}-cap-hint`} className="mt-1 text-xs text-slate-600 dark:text-gray-300">
            After this many requests in a day, School AI answers instead. Protects your credit.
          </p>
        </div>

        <div>
          <label htmlFor={`${uid}-key`} className={labelCls}>
            Replace key (optional)
          </label>
          <input
            id={`${uid}-key`}
            className={`${inputCls} font-mono`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={`Current key ends …${c.keyHint}`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-600 dark:text-gray-300">The new key is checked with {c.providerLabel} before it replaces the old one.</p>
        </div>

        {c.provider === "openrouter" && !isStudent && (
          <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-gray-800/60">
            <div>
              <p id={`${uid}-free`} className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                Free models only
              </p>
              <p className="text-xs text-slate-600 dark:text-gray-300">Only OpenRouter's free models are offered and used, so this key never spends credit.</p>
            </div>
            <Switch on={freeOnly} onChange={setFreeOnly} label="Free models only" />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={busy || !label.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CredentialCard;
