import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenText, ChevronRight, FileText, Folder, FolderOpen, Lock, Search, X } from "lucide-react";
import PageHeader from "../ui/PageHeader";
import SelectField from "../ui/SelectField";
import { useUser } from "../../contexts/UserContext";
import { GUIDES, MODULES, findGuide, guidePath, guidesOf, searchGuides, type DocModule, type Guide } from "../../docs";
import { GuideBody } from "../../docs/markdown";

/**
 * /docs -- how-to guides for staff, one folder per app (src/docs/<module>/*.md).
 *
 *   /docs                    the folders
 *   /docs/:module            opens the module's first guide
 *   /docs/:module/:guide     one guide, with the folder tree beside it
 *
 * Staff only (teachers, staff, administrators): the same rule as the menu entry.
 */

export const STAFF_TYPES = ["TEACHER", "STAFF", "ADMIN"];

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
const card = "rounded-2xl border border-gray-200 bg-white dark:border-gray-700/40 dark:bg-gray-800/40";
const moduleOf = (id: string): DocModule | undefined => MODULES.find((m) => m.id === id);

/* ---------------------------------------------------------------- */
/* Search                                                            */
/* ---------------------------------------------------------------- */

const SearchField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search the guides"
      aria-label="Search the guides"
      className="h-10 w-full rounded-full border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700/30 dark:bg-gray-900/50 dark:text-white dark:placeholder-gray-500"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear the search"
        className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700/60 dark:hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    )}
  </div>
);

const SearchResults: React.FC<{ query: string; onPick: () => void }> = ({ query, onPick }) => {
  const hits = useMemo(() => searchGuides(query), [query]);
  return (
    <section aria-label="Search results" className={cx(card, "p-2")}>
      {hits.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No guide matches “{query.trim()}”. Try a shorter word.</p>
      ) : (
        <ul>
          {hits.map(({ guide, excerpt }) => (
            <li key={guidePath(guide)}>
              <Link to={guidePath(guide)} onClick={onPick} className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/50">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-900 dark:text-white">
                  {guide.title}
                  <span className="rounded-full bg-blue-50 px-2 py-px text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{moduleOf(guide.module)?.name ?? guide.module}</span>
                </span>
                <span className="mt-0.5 block text-sm leading-6 text-gray-500 dark:text-gray-400">{excerpt}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* ---------------------------------------------------------------- */
/* Folders (home)                                                    */
/* ---------------------------------------------------------------- */

const FolderGrid: React.FC = () => (
  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {MODULES.map((m) => {
      const guides = guidesOf(m.id);
      return (
        <li key={m.id}>
          <Link
            to={`/docs/${m.id}`}
            className={cx(card, "group flex h-full flex-col p-4 transition-colors hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-500")}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                <m.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-base font-semibold text-gray-900 dark:text-white">
                  {m.name}
                  <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Folder className="h-3.5 w-3.5" aria-hidden />
                  {guides.length} {guides.length === 1 ? "guide" : "guides"}
                </span>
              </span>
            </span>
            <span className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{m.tagline}</span>
            {guides.length > 0 && (
              <span className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-3 dark:border-gray-700/30">
                {guides.slice(0, 3).map((g) => (
                  <span key={g.slug} className="flex items-center gap-2 truncate text-sm text-gray-500 dark:text-gray-400">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{g.title}</span>
                  </span>
                ))}
                {guides.length > 3 && <span className="pl-5 text-xs text-gray-400 dark:text-gray-500">and {guides.length - 3} more</span>}
              </span>
            )}
          </Link>
        </li>
      );
    })}
  </ul>
);

/* ---------------------------------------------------------------- */
/* Folder tree (beside a guide)                                      */
/* ---------------------------------------------------------------- */

const FolderTree: React.FC<{ current: Guide }> = ({ current }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({ [current.module]: true });
  useEffect(() => setOpen((o) => ({ ...o, [current.module]: true })), [current.module]);
  return (
    <nav aria-label="Guides by app" className={cx(card, "p-2")}>
      <ul>
        {MODULES.map((m) => {
          const isOpen = !!open[m.id];
          const guides = guidesOf(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}
                aria-expanded={isOpen}
                className={cx(
                  "flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  m.id === current.module ? "text-gray-900 dark:text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50",
                )}
              >
                {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden /> : <Folder className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="text-xs font-normal text-gray-400">{guides.length}</span>
              </button>
              {isOpen && (
                <ul className="mb-1 ml-5 border-l border-gray-200 pl-2 dark:border-gray-700/30">
                  {guides.map((g) => {
                    const on = g.module === current.module && g.slug === current.slug;
                    return (
                      <li key={g.slug}>
                        <Link
                          to={guidePath(g)}
                          aria-current={on ? "page" : undefined}
                          className={cx(
                            "block rounded-xl px-2.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                            on
                              ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white",
                          )}
                        >
                          {g.title}
                        </Link>
                      </li>
                    );
                  })}
                  {guides.length === 0 && <li className="px-2.5 py-1.5 text-sm text-gray-400">No guides yet</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/* ---------------------------------------------------------------- */
/* One guide                                                         */
/* ---------------------------------------------------------------- */

const GuideView: React.FC<{ guide: Guide; module: DocModule }> = ({ guide, module }) => {
  const navigate = useNavigate();
  const siblings = guidesOf(guide.module);
  const at = siblings.findIndex((g) => g.slug === guide.slug);
  const prev = at > 0 ? siblings[at - 1] : null;
  const next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;
  const outline = guide.blocks.filter((b): b is Extract<Guide["blocks"][number], { kind: "heading" }> => b.kind === "heading" && b.level === 2);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [guide.module, guide.slug]);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_13rem]">
      <div className="hidden lg:block">
        <div className="sticky top-4">
          <FolderTree current={guide} />
        </div>
      </div>

      <article className={cx(card, "min-w-0 p-5 sm:p-8")}>
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <Link to="/docs" className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
            Documentation
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <Link to={`/docs/${module.id}`} className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">
            {module.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="text-gray-900 dark:text-white">{guide.title}</span>
        </nav>
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{guide.title}</h2>
        {guide.summary && <p className="mt-2 text-base leading-7 text-gray-500 dark:text-gray-400">{guide.summary}</p>}

        {/* Phones and tablets: the other guides of this folder, in place of the tree. */}
        <label className="mt-5 block lg:hidden">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">In this folder</span>
          <SelectField
            value={guide.slug}
            onChange={(e) => navigate(guidePath({ module: guide.module, slug: e.target.value }))}
          >
            {siblings.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </SelectField>
        </label>

        <div className="mt-6 max-w-3xl">
          <GuideBody blocks={guide.blocks} />
        </div>

        <div className="mt-10 grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-2 dark:border-gray-700/30">
          {prev ? (
            <Link to={guidePath(prev)} className="group rounded-2xl bg-gray-50 px-4 py-3 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-800/50 dark:hover:bg-blue-500/15">
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Previous
              </span>
              <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={guidePath(next)} className="group rounded-2xl bg-gray-50 px-4 py-3 text-right transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-800/50 dark:hover:bg-blue-500/15">
              <span className="flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-gray-400">
                Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">{next.title}</span>
            </Link>
          )}
        </div>
      </article>

      {outline.length > 1 && (
        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">On this page</p>
            <ul className="space-y-1 border-l border-gray-200 dark:border-gray-700/30">
              {outline.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="block py-1 pl-3 text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">
                    {h.text.replace(/[`*]/g, "")}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

const StaffDocsPage: React.FC = () => {
  const { module: moduleId, guide: slug } = useParams<{ module?: string; guide?: string }>();
  const { user } = useUser();
  const [query, setQuery] = useState("");
  const userType = String(user?.profile?.user_type ?? "").toUpperCase();

  useEffect(() => setQuery(""), [moduleId, slug]);

  if (!STAFF_TYPES.includes(userType)) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className={cx(card, "p-8 text-center")}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">These guides are for staff</h1>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">The documentation is written for teachers and school staff.</p>
          <Link to="/home" className="mt-5 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const module = moduleId ? moduleOf(moduleId) : undefined;
  if (moduleId && !module) return <Navigate to="/docs" replace />;
  if (module && !slug) {
    const first = guidesOf(module.id)[0];
    if (first) return <Navigate to={guidePath(first)} replace />;
  }
  const guide = module && slug ? findGuide(module.id, slug) : undefined;
  if (module && slug && !guide) return <Navigate to={`/docs/${module.id}`} replace />;

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        icon={BookOpenText}
        title="Documentation"
        subtitle={
          <span>
            Step-by-step guides for staff, one folder per app · {GUIDES.length} guides
          </span>
        }
        actions={
          guide || module ? (
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50"
            >
              <Folder className="h-4 w-4" aria-hidden /> All folders
            </Link>
          ) : undefined
        }
      >
        <div className="mt-4 max-w-xl">
          <SearchField value={query} onChange={setQuery} />
        </div>
      </PageHeader>

      {searching ? (
        <SearchResults query={query} onPick={() => setQuery("")} />
      ) : guide && module ? (
        <GuideView guide={guide} module={module} />
      ) : module ? (
        <div className={cx(card, "p-8 text-center text-sm text-gray-500 dark:text-gray-400")}>The {module.name} folder has no guides yet.</div>
      ) : (
        <FolderGrid />
      )}
    </div>
  );
};

export default StaffDocsPage;
