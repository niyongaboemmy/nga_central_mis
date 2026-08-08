import React, { useMemo } from "react";
import ReactSelect, { components as rsComponents } from "react-select";
import { ChevronDown, X, LucideIcon } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

export interface RichSelectOption {
  value: number | string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

interface RichSelectProps {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  options: RichSelectOption[];
  value: number | string | null | undefined;
  onChange: (value: number | string | null) => void;
  placeholder?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  isClearable?: boolean;
  required?: boolean;
  helperText?: string;
  noOptionsMessage?: string;
}

/**
 * Themed, searchable single-select built on react-select. Generic
 * counterpart to SubjectSelect.tsx's styling approach (same dark-mode-aware
 * custom styles), for any {value,label} option list -- academic years,
 * subjects, class groups, users, etc. -- without each form re-implementing
 * its own search dropdown.
 */
const RichSelect: React.FC<RichSelectProps> = ({
  label,
  icon: Icon,
  error,
  options,
  value,
  onChange,
  placeholder = "Select...",
  isLoading = false,
  isDisabled = false,
  isClearable = false,
  required = false,
  helperText,
  noOptionsMessage = "No options found",
}) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value],
  );

  const styles = useMemo(
    () => ({
      control: (base: any, state: any) => ({
        ...base,
        minHeight: "48px",
        borderRadius: "16px",
        border: `2px solid ${
          error
            ? "#ef4444"
            : state.isFocused
              ? "#3b82f6"
              : isDarkMode
                ? "rgba(75, 85, 99, 0.5)"
                : "#e5e7eb"
        }`,
        backgroundColor: isDisabled
          ? isDarkMode
            ? "rgba(31, 41, 55, 0.3)"
            : "#f3f4f6"
          : isDarkMode
            ? "rgba(31, 41, 55, 0.4)"
            : "white",
        boxShadow: state.isFocused
          ? `0 0 0 4px ${error ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)"}`
          : "none",
        "&:hover": {
          borderColor: error
            ? "#ef4444"
            : isDarkMode
              ? "rgba(107, 114, 128, 0.7)"
              : "#d1d5db",
        },
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        cursor: isDisabled ? "not-allowed" : "pointer",
      }),
      valueContainer: (base: any) => ({
        ...base,
        padding: "2px 14px",
      }),
      input: (base: any) => ({
        ...base,
        color: isDarkMode ? "#f9fafb" : "#111827",
        margin: "0",
      }),
      menu: (base: any) => ({
        ...base,
        borderRadius: "16px",
        marginTop: "6px",
        overflow: "hidden",
        zIndex: 60,
        backgroundColor: isDarkMode ? "#1f2937" : "white",
        boxShadow: isDarkMode
          ? "0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)"
          : "0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
      }),
      menuList: (base: any) => ({
        ...base,
        maxHeight: "260px",
        padding: "6px",
      }),
      option: (base: any, state: any) => ({
        ...base,
        borderRadius: "10px",
        margin: "2px 0",
        padding: "10px 12px",
        backgroundColor: state.isSelected
          ? isDarkMode
            ? "#1e3a8a"
            : "#eff6ff"
          : state.isFocused
            ? isDarkMode
              ? "#374151"
              : "#f9fafb"
            : "transparent",
        color: state.isSelected
          ? isDarkMode
            ? "#93c5fd"
            : "#1d4ed8"
          : isDarkMode
            ? "#f3f4f6"
            : "#1f2937",
        fontWeight: state.isSelected ? 600 : 500,
        cursor: state.isDisabled ? "not-allowed" : "pointer",
        opacity: state.isDisabled ? 0.4 : 1,
        transition: "background-color 0.1s ease",
      }),
      placeholder: (base: any) => ({
        ...base,
        color: isDarkMode ? "#6b7280" : "#9ca3af",
        fontSize: "14px",
      }),
      singleValue: (base: any) => ({
        ...base,
        color: isDarkMode ? "#f9fafb" : "#111827",
      }),
      noOptionsMessage: (base: any) => ({
        ...base,
        padding: "16px",
        color: isDarkMode ? "#9ca3af" : "#6b7280",
        fontSize: "14px",
      }),
      loadingMessage: (base: any) => ({
        ...base,
        color: isDarkMode ? "#9ca3af" : "#6b7280",
        fontSize: "14px",
      }),
      indicatorSeparator: () => ({ display: "none" }),
      dropdownIndicator: (base: any, state: any) => ({
        ...base,
        color: state.isFocused
          ? "#3b82f6"
          : isDarkMode
            ? "#6b7280"
            : "#9ca3af",
        transition: "transform 0.2s ease, color 0.15s ease",
        transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : "none",
        padding: "0 10px",
      }),
      clearIndicator: (base: any) => ({
        ...base,
        color: isDarkMode ? "#6b7280" : "#9ca3af",
        padding: "0 6px",
        "&:hover": { color: isDarkMode ? "#f9fafb" : "#374151" },
      }),
    }),
    [error, isDarkMode, isDisabled],
  );

  return (
    <div className="space-y-2">
      {label && (
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
          {label}
          {required && <span className="text-red-500 font-normal">*</span>}
        </label>
      )}

      <ReactSelect
        value={selectedOption}
        onChange={(opt: any) => onChange(opt ? opt.value : null)}
        options={options.map((o) => ({ ...o, isDisabled: o.disabled }))}
        placeholder={placeholder}
        isLoading={isLoading}
        isDisabled={isDisabled}
        isClearable={isClearable}
        isSearchable
        noOptionsMessage={() => noOptionsMessage}
        loadingMessage={() => "Loading..."}
        styles={styles}
        formatOptionLabel={(option: RichSelectOption) => (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{option.label}</span>
            {option.badge && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {option.badge}
              </span>
            )}
          </div>
        )}
        components={{
          IndicatorSeparator: () => null,
          DropdownIndicator: (props) => (
            <rsComponents.DropdownIndicator {...props}>
              <ChevronDown className="w-4 h-4" />
            </rsComponents.DropdownIndicator>
          ),
          ClearIndicator: (props) => (
            <rsComponents.ClearIndicator {...props}>
              <X className="w-3.5 h-3.5" />
            </rsComponents.ClearIndicator>
          ),
        }}
      />

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0 inline-block" />
          {error}
        </p>
      ) : (
        helperText && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {helperText}
          </p>
        )
      )}
    </div>
  );
};

export default RichSelect;
