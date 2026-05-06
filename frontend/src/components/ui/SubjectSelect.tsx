import React, { useState, useMemo, useRef } from "react";
import Select, { ClearIndicatorProps } from "react-select";
import { Search, X, BookOpen, User, ChevronDown, Pencil } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

export interface SubjectOption {
  subject_id: string;
  name: string;
  code: string;
  teachers: {
    user_id: string;
    first_name: string;
    last_name: string;
    class_group_id?: string;
  }[];
}

interface SubjectSelectProps {
  label?: string;
  error?: string;
  subjects: SubjectOption[];
  value: string;
  onChange: (value: string, classGroupId?: number) => void;
  required?: boolean;
  placeholder?: string;
}

interface Option {
  value: string;
  label: string;
  searchText: string;
  subject: SubjectOption;
  teacher?: {
    user_id: string;
    first_name: string;
    last_name: string;
    class_group_id?: string;
  };
}

const SubjectSelect: React.FC<SubjectSelectProps> = ({
  label,
  error,
  subjects,
  value,
  onChange,
  required = false,
  placeholder = "Search subjects or instructors...",
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const selectRef = useRef<any>(null);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const options: Option[] = useMemo(() => {
    const opts: Option[] = [];
    subjects.forEach((subject) => {
      const teachers = subject.teachers || [];
      teachers.forEach((teacher) => {
        const classGroupId = teacher.class_group_id || 0;
        opts.push({
          value: `${subject.subject_id}_${teacher.user_id}_${classGroupId}`,
          label: `${subject.name} - ${teacher.first_name} ${teacher.last_name}`,
          searchText:
            `${subject.name} ${subject.code || ""} ${teacher.first_name} ${teacher.last_name}`.toLowerCase(),
          subject,
          teacher,
        });
      });
    });
    return opts;
  }, [subjects]);

  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) return options;
    const search = searchValue.toLowerCase();
    return options.filter((opt) => opt.searchText.includes(search));
  }, [options, searchValue]);

  const selectedOption = useMemo(() => {
    if (!value) return null;
    const found = options.find((opt) => opt.value === value);
    if (found) return found;

    const parts = value.split("_");
    if (parts.length >= 2) {
      const subjectId = parseInt(parts[0]);
      const userId = parseInt(parts[1]);
      const subject = subjects.find(
        (s) => parseInt(s.subject_id) === subjectId,
      );
      if (subject) {
        const teacher = subject.teachers?.find(
          (t) => parseInt(t.user_id) === userId,
        );
        return {
          value,
          label: `${subject.name}${teacher ? ` - ${teacher.first_name} ${teacher.last_name}` : ""}`,
          searchText: `${subject.name}`.toLowerCase(),
          subject,
          teacher,
        };
      }
    }
    return null;
  }, [options, value, subjects]);

  // Stable base styles — no layout changes between empty/selected states
  const getCustomStyles = (hasSelectedInInput: boolean) => ({
    control: (base: any, state: any) => ({
      ...base,
      minHeight: "52px",
      height: "52px",
      borderRadius: "12px",
      border: `2px ${
        error
          ? "solid #ef4444"
          : state.isFocused
            ? "solid #3b82f6"
            : isDarkMode
              ? "solid #4b5563"
              : "solid #e5e7eb"
      }`,
      backgroundColor: isDarkMode ? "#374151" : "white",
      boxShadow: state.isFocused ? "0 0 0 3px rgba(59, 130, 246, 0.1)" : "none",
      "&:hover": {
        borderColor: error
          ? "#ef4444"
          : state.isFocused
            ? "#3b82f6"
            : isDarkMode
              ? "#6b7280"
              : "#d1d5db",
      },
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      flexWrap: "nowrap",
    }),
    // FIX: lock valueContainer height and padding so it never shifts
    valueContainer: (base: any) => ({
      ...base,
      height: "48px",
      padding: "0",
      paddingLeft: hasSelectedInInput ? "12px" : "38px", // space for search icon when empty
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      overflow: "hidden",
    }),
    input: (base: any) => ({
      ...base,
      margin: "0",
      padding: "0",
      color: isDarkMode ? "#f9fafb" : "#374151",
      // Prevent the input from pushing layout when typing
      position: "absolute",
      opacity: hasSelectedInInput ? 0 : 1,
    }),
    menu: (base: any) => ({
      ...base,
      borderRadius: "14px",
      marginTop: "6px",
      boxShadow: isDarkMode
        ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)"
        : "0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
      zIndex: 50,
      backgroundColor: isDarkMode ? "#1f2937" : "white",
    }),
    menuList: (base: any) => ({
      ...base,
      maxHeight: "280px",
      padding: "6px",
    }),
    option: (base: any, state: any) => ({
      ...base,
      borderRadius: "9px",
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
          : isDarkMode
            ? "#1f2937"
            : "white",
      color: state.isSelected
        ? isDarkMode
          ? "#93c5fd"
          : "#1d4ed8"
        : isDarkMode
          ? "#f9fafb"
          : "#374151",
      fontWeight: state.isSelected ? "600" : "400",
      cursor: "pointer",
      transition: "background-color 0.1s ease",
    }),
    noOptionsMessage: (base: any) => ({
      ...base,
      padding: "20px",
      textAlign: "center",
      color: "#9ca3af",
      fontSize: "14px",
    }),
    placeholder: (base: any) => ({
      ...base,
      color: "#9ca3af",
      fontSize: "14px",
      margin: "0",
      position: "static",
      transform: "none",
    }),
    indicatorSeparator: () => ({ display: "none" }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: "48px",
    }),
    dropdownIndicator: (base: any, state: any) => ({
      ...base,
      padding: "0 10px",
      color: state.isFocused ? "#3b82f6" : "#9ca3af",
      transition: "transform 0.2s ease, color 0.15s ease",
      transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : "none",
    }),
    singleValue: (base: any) => ({
      ...base,
      margin: "0",
      maxWidth: "100%",
      color: isDarkMode ? "#f9fafb" : "#374151",
      position: "static",
      transform: "none",
      overflow: "hidden",
    }),
    clearIndicator: (base: any) => ({
      ...base,
      padding: "0 4px",
      color: "#9ca3af",
      "&:hover": { color: isDarkMode ? "#f9fafb" : "#374151" },
    }),
  });

  const handleChange = (newValue: any) => {
    if (!newValue?.value) {
      onChange("", undefined);
      setIsEditing(false);
      return;
    }
    const parts = newValue.value.split("_");
    const classGroupId = parts.length >= 3 ? parseInt(parts[2]) : undefined;
    onChange(newValue.value, classGroupId);
    setIsEditing(false);
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (selectRef.current) {
        selectRef.current.focus();
        selectRef.current.openMenu("first");
      }
    }, 0);
  };

  const hasSelectedInInput = !!selectedOption;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1 font-normal">*</span>}
        </label>
      )}

      {/* ── Selected card (read mode) ── */}
      {value && !isEditing && selectedOption ? (
        <div
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all duration-200 cursor-pointer"
          onClick={handleEditClick}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {selectedOption.subject.name}
              </span>
              {selectedOption.subject.code && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-medium">
                  {selectedOption.subject.code}
                </span>
              )}
            </div>
            {selectedOption.teacher && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-4 h-4 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {selectedOption.teacher.first_name}{" "}
                  {selectedOption.teacher.last_name}
                </span>
              </div>
            )}
          </div>

          {/* Edit affordance — visible on hover */}
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
            <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
              Change
            </span>
            <div className="w-7 h-7 bg-blue-50 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
              <Pencil className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            </div>
          </div>
        </div>
      ) : (
        /* ── Search / dropdown (edit mode) ── */
        <div className="relative">
          {/* Search icon — only shown when no item is selected inside the input */}
          {!hasSelectedInInput && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
          )}

          <Select
            ref={selectRef}
            value={selectedOption}
            onChange={handleChange}
            options={filteredOptions}
            placeholder={placeholder}
            isClearable={true}
            onInputChange={(val) => setSearchValue(val)}
            inputValue={searchValue}
            filterOption={() => true}
            formatOptionLabel={(option: Option) => (
              <div className="flex items-center gap-3 py-0">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/50 dark:to-blue-800/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white text-xs leading-tight truncate">
                    {option.subject.name}
                  </div>
                  {option.subject.code && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      {option.subject.code}
                    </span>
                  )}
                </div>
                {option.teacher && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700/80 rounded-full flex-shrink-0">
                    <div className="w-4 h-4 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {option.teacher.first_name} {option.teacher.last_name}
                    </span>
                  </div>
                )}
              </div>
            )}
            styles={getCustomStyles(hasSelectedInInput)}
            components={{
              IndicatorSeparator: () => null,
              DropdownIndicator: () => (
                <div className="flex items-center px-2">
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
              ),
              ClearIndicator: ({
                clearValue,
                innerProps,
              }: ClearIndicatorProps<Option>) => {
                if (!value) return null;
                return (
                  <div
                    {...innerProps}
                    className="flex items-center justify-center w-6 h-6 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors duration-100 mr-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearValue();
                    }}
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                );
              },
              SingleValue: () => {
                if (!selectedOption) return null;
                return (
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                      <BookOpen className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex flex-col min-w-0 overflow-hidden">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
                        {selectedOption.subject.name}
                      </span>
                      {selectedOption.teacher && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {selectedOption.teacher.first_name}{" "}
                          {selectedOption.teacher.last_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              },
            }}
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0 inline-block" />
          {error}
        </p>
      )}
      {required && !value && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Search by subject name, code, or instructor
        </p>
      )}
    </div>
  );
};

export default SubjectSelect;
