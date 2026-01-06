import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

interface VerificationCodeProps {
  length?: number;
  onComplete?: (code: string) => void;
  onChange?: (code: string) => void;
  error?: boolean;
}

const VerificationCode: React.FC<VerificationCodeProps> = ({
  length = 6,
  onComplete,
  onChange,
  error = false,
}) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Handle input change for a single field
  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only allow single digits
      const sanitizedValue = value.replace(/\D/g, "").slice(0, 1);

      const newValues = [...values];
      newValues[index] = sanitizedValue;
      setValues(newValues);

      // Notify parent of change
      const code = newValues.join("");
      onChange?.(code);

      // If value was entered, move to next input
      if (sanitizedValue && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Check if complete
      if (code.length === length) {
        onComplete?.(code);
      }
    },
    [values, length, onComplete, onChange]
  );

  // Handle keydown events (backspace, arrow keys)
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      const key = e.key;

      // Handle backspace
      if (key === "Backspace") {
        if (!values[index] && index > 0) {
          // If current input is empty, move to previous and clear it
          inputRefs.current[index - 1]?.focus();
        }
      }

      // Handle arrow left
      if (key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }

      // Handle arrow right
      if (key === "ArrowRight" && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [values, length]
  );

  // Handle paste event - distribute pasted characters to correct positions
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text");
      const pastedChars = pastedData.replace(/\D/g, "").slice(0, length);

      if (!pastedChars) return;

      const newValues = [...values];

      // Distribute pasted characters starting from the focused input or first input
      const startIndex =
        inputRefs.current.findIndex((ref) => ref === document.activeElement) ??
        0;

      pastedChars.split("").forEach((char, i) => {
        const targetIndex = startIndex + i;
        if (targetIndex < length) {
          newValues[targetIndex] = char;
        }
      });

      setValues(newValues);

      // Notify parent of change
      const code = newValues.join("");
      onChange?.(code);

      // Focus the appropriate input after paste
      const lastFilledIndex =
        Math.min(startIndex + pastedChars.length, length) - 1;
      if (lastFilledIndex >= 0) {
        inputRefs.current[Math.min(lastFilledIndex, length - 1)]?.focus();
      }

      // Check if complete
      if (code.length === length) {
        onComplete?.(code);
      }
    },
    [values, length, onComplete, onChange]
  );

  // Handle focus selection
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }, (_, index) => (
        <motion.input
          key={index}
          ref={(ref) => {
            inputRefs.current[index] = ref;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={values[index]}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={handleFocus}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileFocus={{
            scale: 1.05,
            borderColor: error ? "#EF4444" : "#2f98ff",
          }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
          className={`w-12 h-14 text-center text-xl font-semibold rounded-xl border-2 focus:outline-none focus:ring-2 transition-all duration-200 cursor-text
            ${
              error
                ? "border-red-500 bg-red-50 dark:bg-red-900/20 focus:border-red-500 focus:ring-red-500/20"
                : values[index]
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 focus:border-blue-500 focus:ring-blue-500/20"
                : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 focus:border-blue-500 focus:ring-blue-500/20"
            }
            text-gray-900 dark:text-white
            placeholder-gray-300 dark:placeholder-gray-500`}
          aria-label={`Verification code digit ${index + 1}`}
        />
      ))}
    </div>
  );
};

export default VerificationCode;
