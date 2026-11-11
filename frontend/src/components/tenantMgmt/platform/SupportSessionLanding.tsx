import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, Link2Off, Loader2 } from "lucide-react";
import { EmptyState } from "../kit";
import { beginSupportSession, parseSupportHash } from "./supportSession";

export { SupportSessionChip } from "./SupportSessionChip";

/**
 * /support-session#token=…&tid=…&exp=… : a platform support user lands in the
 * school they may help (§6.9). The hash is cleared at once, the token becomes
 * this browser's MIS session (localStorage "token", as a normal sign-in does),
 * then a full load of /home so UserContext and every cache start from the
 * school's identity (a soft refreshUser() can race the provider's first load).
 */
const SupportSessionLanding: React.FC = () => {
  const [bad, setBad] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const parsed = parseSupportHash(window.location.hash);
    // never leave the token in the address bar or history
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!parsed || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      setBad(true);
      return;
    }
    beginSupportSession(parsed.token, parsed.tid, parsed.expiresAt, { mode: parsed.mode, schoolName: parsed.schoolName });
    window.location.replace("/home");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      {bad ? (
        <EmptyState icon={Link2Off} title="Link expired" />
      ) : (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3" role="status">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg">
            <LifeBuoy className="h-8 w-8" aria-hidden />
          </span>
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" aria-hidden />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Support session</span>
        </motion.div>
      )}
    </div>
  );
};

export default SupportSessionLanding;
