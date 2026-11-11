import React, { useCallback, useEffect, useState } from "react";
import { ChevronsDown, Search } from "lucide-react";
import SelectField from "../../ui/SelectField";
import { platformApi, type AuditEntry, type TenantListItem } from "../../../api/tenantMgmt";
import { Btn, Card, Spinner, cx, errorText, inputCls } from "./platformShared";
import { AuditList } from "./SchoolDetailPage";

/** Page size the "load more" expects; a shorter page means the end. */
export const AUDIT_PAGE = 50;

const AuditPage: React.FC = () => {
  const [action, setAction] = useState("");
  const [tid, setTid] = useState<number | "">("");
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi.tenants().then(setTenants, () => undefined);
  }, []);

  const fetchPage = useCallback(
    (before?: number) => platformApi.audit({ action: action.trim() || undefined, tid: tid === "" ? undefined : tid, before }),
    [action, tid],
  );

  useEffect(() => {
    let live = true;
    setRows(null);
    const t = window.setTimeout(
      () =>
        fetchPage().then(
          (r) => {
            if (!live) return;
            setRows(r);
            setMore(r.length >= AUDIT_PAGE);
            setError(null);
          },
          (e) => live && (setError(errorText(e)), setRows([])),
        ),
      action ? 300 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [fetchPage, action]);

  const nameOf = (id: number | null) => tenants.find((t) => t.tid === id)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input aria-label="Action" placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
        <SelectField aria-label="School" value={tid} onChange={(e) => setTid(e.target.value ? Number(e.target.value) : "")} className={cx(inputCls, "w-auto")}>
          <option value="">All schools</option>
          {tenants.map((t) => (
            <option key={t.tid} value={t.tid}>
              {t.name}
            </option>
          ))}
        </SelectField>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <Card>
        {!rows ? <Spinner /> : <AuditList entries={rows} schoolName={nameOf} />}
        {rows && more && (
          <div className="mt-4 flex justify-center">
            <Btn
              icon={ChevronsDown}
              busy={busy}
              onClick={async () => {
                const last = rows[rows.length - 1];
                if (!last) return;
                setBusy(true);
                try {
                  const page = await fetchPage(last.id);
                  setRows([...rows, ...page.filter((p) => !rows.some((r) => r.id === p.id))]);
                  setMore(page.length >= AUDIT_PAGE);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              More
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AuditPage;
