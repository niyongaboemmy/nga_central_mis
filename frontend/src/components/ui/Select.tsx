import React from "react";
import SelectField from "./SelectField";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
}

const Select: React.FC<SelectProps> = ({
  label,
  error,
  className = "",
  options,
  ...props
}) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
          {label}
        </label>
      )}
      <SelectField
        className={`w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 focus:bg-surface-light dark:focus:bg-surface-dark/40 text-text-primary-light dark:text-text-primary-dark ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
            : ""
        } ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
