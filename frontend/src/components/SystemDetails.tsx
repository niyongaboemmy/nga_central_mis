import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Fingerprint,
  Link as LinkIcon,
  ExternalLink,
  Layers,
  Shield,
  Calendar,
  Globe,
} from "lucide-react";
import { getSystemById, System } from "../api/systems";
import { useToast } from "../contexts/ToastContext";
import { useUser } from "../contexts/UserContext";

// A single copyable credential / value row with optional masking.
const CredentialField = ({
  label,
  value,
  icon,
  secret = false,
  mono = true,
}: {
  label: string;
  value?: string | null;
  icon: React.ReactNode;
  secret?: boolean;
  mono?: boolean;
}) => {
  const { showToast } = useToast();
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);

  const hasValue = !!value;

  const handleCopy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value as string);
      setCopied(true);
      showToast(`${label} copied to clipboard`, "success");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  const display = !hasValue
    ? "—"
    : revealed
      ? (value as string)
      : "•".repeat(Math.min(40, (value as string).length));

  return (
    <div className="group">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
        {icon}
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <div
          className={`flex-1 flex items-center px-4 py-3 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700/40 rounded-xl overflow-x-auto ${
            mono ? "font-mono" : ""
          } text-sm text-gray-800 dark:text-gray-100 whitespace-nowrap ${
            !hasValue ? "text-gray-400 dark:text-gray-600" : ""
          }`}
        >
          {display}
        </div>
        {secret && hasValue && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            title={revealed ? "Hide" : "Reveal"}
            className="px-3 flex items-center justify-center bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700/40 rounded-xl text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            {revealed ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasValue}
          title="Copy"
          className="px-3 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};

const SystemDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useUser();

  const [system, setSystem] = useState<System | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const canManage = user?.roles?.find((itm) =>
    itm.permissions?.find(
      (perm) =>
        perm.name.includes("MANAGE_SYSTEMS") || perm.name.includes("ADMIN"),
    ),
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(false);
      try {
        const data = await getSystemById(Number(id));
        if (active && data) setSystem(data);
      } catch (e) {
        if (active) {
          setError(true);
          showToast("Failed to load system details", "error");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!canManage) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h2>
        <p className="text-gray-500 max-w-sm">
          You do not have permission to view system details.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600" />
      </div>
    );
  }

  if (error || !system) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900/60 rounded-full flex items-center justify-center mb-5">
          <Layers className="w-9 h-9 text-gray-300 dark:text-gray-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          System not found
        </h2>
        <button
          onClick={() => navigate("/systems")}
          className="mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          Back to Modules
        </button>
      </div>
    );
  }

  const hasSSO = !!system.client_id || !!system.client_secret;
  const redirectUris = (system.allowed_redirect_uris || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen p-3 md:p-6 md:pt-4 space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/systems")}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to System Modules
      </button>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-white dark:bg-gray-900/60 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-slate-700/30"
      >
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {system.icon_url ? (
              <img
                src={system.icon_url}
                alt={system.name}
                className="w-12 h-12 object-contain"
              />
            ) : (
              <Layers className="w-9 h-9" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                {system.name}
              </h1>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  system.status === "ACTIVE"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {system.status}
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 max-w-2xl">
              {system.description || "No description provided."}
            </p>
          </div>
          {system.home_url && (
            <a
              href={system.home_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700/40 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-full transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Open App
            </a>
          )}
        </div>
      </motion.div>

      {/* SSO credentials */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white dark:bg-gray-900/60 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-slate-700/30"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              SSO Credentials
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              OAuth2 credentials for integrating this application.
            </p>
          </div>
        </div>

        {hasSSO ? (
          <div className="space-y-5">
            <CredentialField
              label="Client ID"
              value={system.client_id}
              icon={<Fingerprint className="w-3.5 h-3.5" />}
            />
            <CredentialField
              label="Client Secret"
              value={system.client_secret}
              icon={<KeyRound className="w-3.5 h-3.5" />}
              secret
            />
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300/80 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/30 rounded-xl p-3">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Keep the Client Secret confidential — it must only ever live on
                the partner's server, never in browser or mobile code. To
                invalidate a leaked secret, regenerate it from the Edit dialog.
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/40 border border-dashed border-gray-200 dark:border-slate-700/40 rounded-xl p-5 text-center">
            SSO is not configured for this module. Add a Client ID from the Edit
            dialog to generate credentials.
          </div>
        )}
      </motion.div>

      {/* Configuration */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-900/60 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-slate-700/30"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
            <LinkIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Configuration
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <CredentialField
            label="Home URL"
            value={system.home_url}
            icon={<Globe className="w-3.5 h-3.5" />}
            mono={false}
          />
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              <Calendar className="w-3.5 h-3.5" />
              Created
            </label>
            <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700/40 rounded-xl text-sm text-gray-800 dark:text-gray-100">
              {system.created_at
                ? new Date(system.created_at).toLocaleString()
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            <LinkIcon className="w-3.5 h-3.5" />
            Allowed Redirect URIs
          </label>
          {redirectUris.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {redirectUris.map((uri) => (
                <span
                  key={uri}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700/40 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-200"
                >
                  <LinkIcon className="w-3 h-3 text-gray-400" />
                  {uri}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-600">
              No redirect URIs configured.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default SystemDetails;
