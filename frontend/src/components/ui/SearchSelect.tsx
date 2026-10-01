import React, { useId, useMemo } from "react";
import Select, { components, type GroupBase, type OptionProps, type SingleValueProps, type StylesConfig } from "react-select";
import { Check } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Compact searchable select for toolbars and dense forms -- the small sibling of
 * RichSelect (same react-select engine and dark-mode handling, 36px tall instead of
 * 48px). Type to filter; options can carry a description, a leading icon and a
 * group heading. Works single or multi.
 */
export interface SearchSelectOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  group?: string;
  disabled?: boolean;
}

type Opt = SearchSelectOption<string>;

interface BaseProps<V extends string> {
  options: SearchSelectOption<V>[];
  /** Accessible name; also shown as a visible label when `showLabel`. */
  label: string;
  showLabel?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  isClearable?: boolean;
  /** Fixed width (CSS) for toolbars; full width when omitted. */
  width?: number | string;
  className?: string;
  noOptionsMessage?: string;
  id?: string;
}

interface SingleProps<V extends string> extends BaseProps<V> {
  multi?: false;
  value: V | null | undefined;
  onChange: (value: V | null) => void;
}

interface MultiProps<V extends string> extends BaseProps<V> {
  multi: true;
  value: V[];
  onChange: (value: V[]) => void;
}

export type SearchSelectProps<V extends string = string> = SingleProps<V> | MultiProps<V>;

const OptionRow = (props: OptionProps<Opt, boolean, GroupBase<Opt>>) => (
  <components.Option {...props}>
    <span className="flex items-start gap-2">
      {props.data.icon && <span className="mt-0.5 shrink-0">{props.data.icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{props.data.label}</span>
        {props.data.description && <span className="block text-[11px] opacity-75 truncate">{props.data.description}</span>}
      </span>
      {props.isSelected && <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />}
    </span>
  </components.Option>
);

const SingleValueRow = (props: SingleValueProps<Opt, boolean, GroupBase<Opt>>) => (
  <components.SingleValue {...props}>
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {props.data.icon && <span className="shrink-0">{props.data.icon}</span>}
      <span className="truncate">{props.data.label}</span>
    </span>
  </components.SingleValue>
);

export function SearchSelect<V extends string = string>(props: SearchSelectProps<V>) {
  const { options, label, showLabel, placeholder, isLoading, isDisabled, isClearable, width, className = "", noOptionsMessage = "No matches" } = props;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const autoId = useId();
  const inputId = props.id ?? `ss-${autoId.replace(/:/g, "")}`;

  const grouped = useMemo(() => {
    if (!options.some((o) => o.group)) return options as Opt[];
    const groups = new Map<string, Opt[]>();
    for (const o of options) {
      const g = o.group ?? "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(o as Opt);
    }
    return Array.from(groups, ([g, opts]) => ({ label: g, options: opts }));
  }, [options]);

  const selected = useMemo(() => {
    if (props.multi) return (options as Opt[]).filter((o) => props.value.includes(o.value as V));
    return (options as Opt[]).find((o) => o.value === props.value) ?? null;
  }, [options, props.multi, props.value]);

  const styles = useMemo<StylesConfig<Opt, boolean, GroupBase<Opt>>>(
    () => ({
      container: (b) => ({ ...b, width: width ?? "100%", minWidth: 0 }),
      control: (b, s) => ({
        ...b,
        minHeight: 36,
        borderRadius: 10,
        borderWidth: 1,
        fontSize: 13,
        cursor: "pointer",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: s.isFocused ? (dark ? "#3987e5" : "#2a78d6") : dark ? "#334155" : "#e2e8f0",
        boxShadow: s.isFocused ? `0 0 0 3px ${dark ? "rgba(57,135,229,0.25)" : "rgba(42,120,214,0.18)"}` : "none",
        transition: "border-color 120ms, box-shadow 120ms",
        "&:hover": { borderColor: dark ? "#475569" : "#cbd5e1" },
      }),
      valueContainer: (b) => ({ ...b, padding: "0 8px", gap: 4 }),
      input: (b) => ({ ...b, margin: 0, padding: 0, color: dark ? "#f1f5f9" : "#0f172a" }),
      singleValue: (b) => ({ ...b, color: dark ? "#f1f5f9" : "#0f172a" }),
      placeholder: (b) => ({ ...b, color: dark ? "#94a3b8" : "#64748b" }),
      indicatorSeparator: () => ({ display: "none" }),
      dropdownIndicator: (b, s) => ({
        ...b,
        padding: "0 8px",
        color: dark ? "#94a3b8" : "#64748b",
        transform: s.selectProps.menuIsOpen ? "rotate(180deg)" : "none",
        transition: "transform 150ms",
      }),
      clearIndicator: (b) => ({ ...b, padding: "0 4px", color: dark ? "#94a3b8" : "#64748b" }),
      loadingIndicator: (b) => ({ ...b, color: dark ? "#94a3b8" : "#64748b" }),
      menuPortal: (b) => ({ ...b, zIndex: 80 }),
      menu: (b) => ({
        ...b,
        marginTop: 6,
        minWidth: 220,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`,
        boxShadow: dark ? "0 16px 40px rgba(0,0,0,0.5)" : "0 16px 40px rgba(15,23,42,0.14)",
        animation: "ss-pop 120ms ease-out",
      }),
      menuList: (b) => ({ ...b, padding: 4, maxHeight: 300 }),
      groupHeading: (b) => ({
        ...b,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: dark ? "#cbd5e1" : "#475569",
        padding: "6px 8px 4px",
      }),
      option: (b, s) => ({
        ...b,
        fontSize: 13,
        borderRadius: 8,
        padding: "7px 8px",
        cursor: s.isDisabled ? "not-allowed" : "pointer",
        opacity: s.isDisabled ? 0.5 : 1,
        backgroundColor: s.isSelected
          ? dark ? "rgba(57,135,229,0.22)" : "rgba(42,120,214,0.10)"
          : s.isFocused ? (dark ? "#1e293b" : "#f1f5f9") : "transparent",
        color: dark ? "#f1f5f9" : "#0f172a",
        fontWeight: s.isSelected ? 600 : 400,
        "&:active": { backgroundColor: dark ? "#334155" : "#e2e8f0" },
      }),
      multiValue: (b) => ({ ...b, borderRadius: 6, backgroundColor: dark ? "#1e293b" : "#eef2ff" }),
      multiValueLabel: (b) => ({ ...b, fontSize: 12, color: dark ? "#e2e8f0" : "#1e293b", padding: "1px 4px" }),
      multiValueRemove: (b) => ({ ...b, borderRadius: 6, color: dark ? "#94a3b8" : "#64748b", "&:hover": { backgroundColor: dark ? "#7f1d1d" : "#fee2e2", color: dark ? "#fecaca" : "#b91c1c" } }),
      noOptionsMessage: (b) => ({ ...b, fontSize: 13, color: dark ? "#94a3b8" : "#64748b" }),
    }),
    [dark, width],
  );

  return (
    <div className={`min-w-0 ${className}`} style={width ? { width } : undefined}>
      {showLabel ? (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
          {label}
        </label>
      ) : null}
      <Select<Opt, boolean, GroupBase<Opt>>
        inputId={inputId}
        aria-label={showLabel ? undefined : label}
        options={grouped as any}
        value={selected as any}
        isMulti={!!props.multi}
        onChange={(v: any) => {
          if (props.multi) props.onChange(((v ?? []) as Opt[]).map((o) => o.value as V));
          else props.onChange(v ? ((v as Opt).value as V) : null);
        }}
        isOptionDisabled={(o) => !!o.disabled}
        isSearchable
        isClearable={isClearable}
        isLoading={isLoading}
        isDisabled={isDisabled}
        closeMenuOnSelect={!props.multi}
        hideSelectedOptions={false}
        placeholder={placeholder ?? "Select…"}
        noOptionsMessage={() => noOptionsMessage}
        components={{ Option: OptionRow, SingleValue: SingleValueRow }}
        filterOption={(o, q) => {
          if (!q) return true;
          const s = q.toLowerCase();
          return o.data.label.toLowerCase().includes(s) || (o.data.description ?? "").toLowerCase().includes(s) || (o.data.group ?? "").toLowerCase().includes(s);
        }}
        menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
        menuPlacement="auto"
        styles={styles}
      />
    </div>
  );
}

export default SearchSelect;
