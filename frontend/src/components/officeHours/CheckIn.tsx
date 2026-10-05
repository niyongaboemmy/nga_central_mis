import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import qrcode from "qrcode-generator";
import { CheckCircle2, QrCode, XCircle } from "lucide-react";
import Modal from "../ui/Modal";
import { apiError, formatYmd, officeHoursApi, type StudentSessionView } from "../../api/officeHours";
import { Card, EmptyState, inputCls, labelCls, Muted, primaryBtn, Spinner } from "./ohUi";
import SelectField from "../ui/SelectField";

/**
 * Self check-in (plan §16.1). The host shows a QR code (and a 6-digit code
 * for students without a camera) that rotates every 30 seconds; students scan
 * it into /office-hours/checkin. The teacher's register still decides.
 */
const qrSvg = (text: string) => {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
};

export const checkInUrl = (token: string) => `${window.location.origin}/office-hours/checkin?t=${encodeURIComponent(token)}`;

export const CheckInPanel: React.FC<{ sessionId: number; onClose: () => void; checkedIn: number }> = ({ sessionId, onClose, checkedIn }) => {
  const [data, setData] = useState<{ token: string; code: string; expires_in: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await officeHoursApi.checkInToken(sessionId);
      setData(r.data.data);
      setLeft(r.data.data.expires_in);
      setError(null);
    } catch (e) {
      setError(apiError(e, "Couldn't create a check-in code"));
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          void refresh();
          return 30;
        }
        return n - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  return (
    <Modal isOpen onClose={onClose} title="Self check-in" size="lg">
      {error ? (
        <EmptyState title="Check-in isn't available" body={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-64 max-w-full rounded-2xl bg-white p-2" aria-label="Check-in QR code" role="img" dangerouslySetInnerHTML={{ __html: qrSvg(checkInUrl(data.token)) }} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">Or type this code</p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-slate-900 dark:text-slate-50" aria-live="polite">{data.code}</p>
          </div>
          <Muted className="text-xs">New code in {left}s · {checkedIn} checked in so far. Codes stop working after a minute, so photos of the screen don't help.</Muted>
        </div>
      )}
    </Modal>
  );
};

/** /office-hours/checkin -- the student's side. */
export const CheckInPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get("t");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<StudentSessionView[]>([]);
  const [sessionId, setSessionId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const tried = useRef(false);

  const submit = useCallback(async (body: { token?: string; session_id?: number; code?: string }) => {
    setBusy(true);
    try {
      const r = await officeHoursApi.checkIn(body);
      const d = r.data.data;
      setResult({ ok: true, text: d.already ? `You're already marked ${d.status.toLowerCase()}.` : `Checked in${d.status === "LATE" ? " — late" : ""}${d.title ? ` to ${d.title}` : ""}.` });
    } catch (e) {
      setResult({ ok: false, text: apiError(e, "Couldn't check you in") });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (token && !tried.current) {
      tried.current = true;
      void submit({ token });
    }
  }, [token, submit]);

  useEffect(() => {
    if (token) return;
    officeHoursApi
      .me()
      .then((r) => {
        // Kigali is UTC+2 all year.
        const todayYmd = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
        const list = r.data.data.upcoming.filter((u) => u.session_date === todayYmd);
        setToday(list);
        if (list[0]) setSessionId(list[0].session_id);
      })
      .catch(() => setToday([]));
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-50">
          <QrCode className="h-5 w-5 text-blue-600" aria-hidden /> Office hours check-in
        </h1>
        {busy && <Spinner label="Checking you in" />}
        {result && (
          <div className={`mb-4 flex items-start gap-2 rounded-2xl p-4 ${result.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" : "bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100"}`} role="status">
            {result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />}
            <p className="font-semibold">{result.text}</p>
          </div>
        )}
        {!token && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (sessionId) void submit({ session_id: Number(sessionId), code: code.trim() });
            }}
          >
            {today.length === 0 ? (
              <Muted>You have no office hours today.</Muted>
            ) : (
              <>
                {today.length > 1 && (
                  <div>
                    <label htmlFor="oh-ci-session" className={labelCls}>Session</label>
                    <SelectField id="oh-ci-session" className={inputCls} value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))}>
                      {today.map((s) => (
                        <option key={s.session_id} value={s.session_id}>{`${s.start_time} ${s.title ?? ""}`}</option>
                      ))}
                    </SelectField>
                  </div>
                )}
                <div>
                  <label htmlFor="oh-ci-code" className={labelCls}>Code on the screen</label>
                  <input id="oh-ci-code" className={`${inputCls} text-center font-mono text-2xl tracking-[0.3em]`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
                </div>
                <button type="submit" className={`${primaryBtn} w-full`} disabled={code.length !== 6 || busy}>Check in</button>
                <Muted className="text-xs">{today[0] ? `${formatYmd(today[0].session_date)} · ${today[0].start_time}` : ""}</Muted>
              </>
            )}
          </form>
        )}
      </Card>
    </div>
  );
};
