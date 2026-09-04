import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, KeyRound, Loader2, Plus, ShieldOff } from "lucide-react";
import Modal from "./ui/Modal";
import ConfirmModal from "./ui/ConfirmModal";
import { useToast } from "../contexts/ToastContext";
import {
  getIntegrationTokens,
  createIntegrationToken,
  revokeIntegrationToken,
  IntegrationToken,
} from "../api/integrationTokens";

/**
 * Integration tokens — the credentials a partner system uses to pull data from
 * this MIS with no user signed in (Ganzaa's sync holds one).
 *
 * Sits under Modules because that is where an admin already goes to connect
 * another system, but it is a different kind of credential from the SSO client
 * on that screen: a System signs OUR USERS IN, a token READS OUR DATA. Saying
 * so on the screen is not padding — the two were confused often enough that
 * somebody went looking for a sync token on the Modules form and did not find
 * one.
 *
 * The value is shown ONCE, at creation. Only its hash is stored, so there is no
 * screen, endpoint or database query that can show it again; losing it means
 * creating another and revoking the old.
 */

const relative = (iso: string | null) => {
  if (!iso) return "never";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86_400)} d ago`;
};

const STATUS_STYLES: Record<IntegrationToken["status"], string> = {
  ACTIVE: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  REVOKED: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  EXPIRED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const IntegrationTokens: React.FC = () => {
  const { showToast } = useToast();
  const [tokens, setTokens] = useState<IntegrationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<IntegrationToken | null>(null);

  const load = async () => {
    try {
      setTokens(await getIntegrationTokens());
    } catch {
      showToast("Failed to load integration tokens", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const token = await createIntegrationToken({ name: name.trim() });
      // The modal deliberately stays OPEN. Closing it here would destroy the
      // only copy of the value that will ever exist.
      setCreated(token.token);
      setName("");
      load();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to create the token", "error");
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!toRevoke) return;
    try {
      await revokeIntegrationToken(toRevoke.token_id);
      showToast(`"${toRevoke.name}" revoked`, "success");
      load();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to revoke the token", "error");
    } finally {
      setToRevoke(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Integration tokens
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Let a partner system read this MIS without a user signing in — Ganzaa&apos;s sync uses one.
            Different from a module&apos;s client secret above, which signs users in.
          </p>
        </div>
        <button
          onClick={() => {
            setCreated(null);
            setName("");
            setModalOpen(true);
          }}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          New token
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/40 py-10 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No integration tokens yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <motion.div
              key={t.token_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/30"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{t.name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{t.token_prefix}…</p>
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${STATUS_STYLES[t.status]}`}>
                {t.status}
              </span>
              <div className="text-xs text-gray-500 dark:text-gray-400 w-32">
                <span className="block">last used</span>
                <span className="font-semibold">{relative(t.last_used_at)}</span>
              </div>
              {t.status === "ACTIVE" && (
                <button
                  onClick={() => setToRevoke(t)}
                  title="Revoke"
                  className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  <ShieldOff className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
              <KeyRound className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">New integration token</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
                Read-only access for one partner system
              </p>
            </div>
          </div>
        }
      >
        {created ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                Copy this now — it is shown once
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Only a hash is stored, so it cannot be shown again. Paste it into the partner
                system (in Ganzaa: Academics → Sync MIS → the connection form).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-3 rounded-xl bg-gray-900 text-gray-100 text-xs font-mono break-all">
                {created}
              </code>
              <button
                onClick={() => copy(created)}
                className="p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                title="Copy"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Ganzaa production sync"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              />
              <span className="block mt-1 ml-1 text-xs text-gray-400">
                How you will recognise it later — and what you revoke by.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create token
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!toRevoke}
        onClose={() => setToRevoke(null)}
        onConfirm={confirmRevoke}
        title="Revoke this token?"
        message={`"${toRevoke?.name}" stops working immediately, and any system using it will fail its next sync. This cannot be undone — issue a new token instead.`}
        confirmText="Revoke"
      />
    </div>
  );
};

export default IntegrationTokens;
