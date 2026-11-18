import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArchiveRestore, Briefcase, FolderKanban, Globe, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { failure, sideProjectsApi, type Customer } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useUser } from "../../../contexts/UserContext";
import PageHeader from "../PageHeader";
import { useSpMe } from "../useMe";
import { Skeleton, cardCls, chipCls, primaryBtn } from "../ui";
import { CUSTOMER_KIND_META, CustomerLogo, CustomerModal } from "./CustomerParts";

/**
 * /project-customers: the shared register of customers projects are built for. Register once,
 * pick it from any project. The person who registered a customer (or the projects lead) edits
 * it; a customer in use is archived instead of deleted.
 */
const CustomersPage: React.FC = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user } = useUser();
  const me = useSpMe();
  const meId = Number(user?.user?.user_id ?? 0);
  const [list, setList] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [modal, setModal] = useState<{ customer: Customer | null } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setList(await sideProjectsApi.customers(q, archived));
    } catch (e) {
      setError(failure(e, "Customers couldn't load").message);
    }
  }, [q, archived]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const canEdit = (c: Customer) => !!me?.manageAny || c.createdBy === meId;
  const remove = async (c: Customer) => {
    const inUse = (c.projects ?? 0) > 0;
    if (!(await confirm({ title: `${inUse ? "Archive" : "Delete"} ${c.name}?`, tone: "danger", confirmText: inUse ? "Archive" : "Delete", message: inUse ? "Projects keep it; it disappears from the customer list." : "It isn't used by any project." }))) return;
    setBusy(c.id);
    try {
      const r = await sideProjectsApi.removeCustomer(c.id);
      showToast(r.archived ? `${c.name} archived` : `${c.name} deleted`, "success");
      load();
    } catch (e) {
      showToast(failure(e, "That didn't work").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const restore = async (c: Customer) => {
    setBusy(c.id);
    try {
      await sideProjectsApi.restoreCustomer(c.id);
      showToast(`${c.name} restored`, "success");
      load();
    } catch (e) {
      showToast(failure(e, "It wasn't restored").message, "error");
    } finally {
      setBusy(null);
    }
  };

  const total = list?.length;
  const companies = list?.filter((c) => c.kind === "COMPANY").length;
  const withProjects = list?.filter((c) => (c.projects ?? 0) > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <PageHeader
        icon={Briefcase}
        title="Customers"
        subtitle="Who your projects are for. Registered once, shared by every project."
        actions={
          <button type="button" className={primaryBtn} onClick={() => setModal({ customer: null })}>
            <Plus className="h-4 w-4" /> Register a customer
          </button>
        }
        stats={[
          { label: archived ? "Shown" : "Customers", value: total, icon: Briefcase },
          { label: "Companies", value: companies, icon: FolderKanban },
          { label: "With projects", value: withProjects, icon: FolderKanban },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact, email" aria-label="Search customers" className="w-full rounded-full border border-slate-900/[0.07] bg-white py-2 pl-10 pr-8 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-gray-900 dark:text-white" />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="button" aria-pressed={archived} onClick={() => setArchived((a) => !a)} className={chipCls(archived)}>
          <Archive className="h-3.5 w-3.5" /> Include archived
        </button>
      </div>

      {error ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
            Retry
          </button>
        </div>
      ) : !list ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading customers">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className={`${cardCls} flex flex-col items-center gap-3 p-10 text-center`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <Briefcase className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{q ? "No customer matches" : "No customers yet"}</p>
          <p className="max-w-sm text-xs text-slate-500 dark:text-gray-400">Register the people and companies you build for. Any project can then pick them.</p>
          <button type="button" className={primaryBtn} onClick={() => setModal({ customer: null })}>
            <Plus className="h-4 w-4" /> Register a customer
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const K = CUSTOMER_KIND_META[c.kind];
            return (
              <motion.article key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: c.archived ? 0.65 : 1, y: 0 }} className={`${cardCls} flex flex-col gap-3 p-4`}>
                <div className="flex items-start gap-3">
                  <CustomerLogo c={c} size={48} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{c.name}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                        <K.icon className="h-3 w-3" aria-hidden /> {K.label}
                      </span>
                      <span>
                        {c.projects ?? 0} project{c.projects === 1 ? "" : "s"}
                      </span>
                      {c.archived && <span className="font-semibold text-amber-700 dark:text-amber-300">Archived</span>}
                    </p>
                  </div>
                  {canEdit(c) && (
                    <div className="flex shrink-0">
                      {!c.archived && (
                        <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setModal({ customer: c })} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {c.archived ? (
                        <button type="button" aria-label={`Restore ${c.name}`} onClick={() => restore(c)} disabled={busy === c.id} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                          <ArchiveRestore className="h-4 w-4" />
                        </button>
                      ) : (
                        <button type="button" aria-label={`${(c.projects ?? 0) > 0 ? "Archive" : "Delete"} ${c.name}`} onClick={() => remove(c)} disabled={busy === c.id} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                          {(c.projects ?? 0) > 0 ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {c.description && <p className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-gray-300">{c.description}</p>}
                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-gray-300">
                  {c.contactName && (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {c.contactName}
                    </span>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300">
                      <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300">
                      <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {c.phone}
                    </a>
                  )}
                  {c.website && (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300">
                      <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {c.website.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <CustomerModal open={!!modal} customer={modal?.customer ?? null} onClose={() => setModal(null)} onSaved={load} />
    </div>
  );
};

export default CustomersPage;
