import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";

interface Props {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (query: string) => void;
  count: number;
  index: number;
  tooShort: boolean;
  step: (delta: number) => void;
  onClose: () => void;
  /** Offered only where an AI assistant is available — turns a fruitless search into a question. */
  onAskAI?: () => void;
  placeholder?: string;
}

const FindBar: React.FC<Props> = ({
  inputRef,
  query,
  setQuery,
  count,
  index,
  tooShort,
  step,
  onClose,
  onAskAI,
  placeholder = "Find in this note...",
}) => (
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    className="overflow-hidden border-t border-gray-200/70 dark:border-gray-700/40"
  >
    <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-2 flex items-center gap-2">
      <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
      />
      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
        {tooShort ? "Type to search" : count === 0 ? "No matches" : `${index + 1} / ${count}`}
      </span>
      <button
        onClick={() => step(-1)}
        disabled={count === 0}
        aria-label="Previous match"
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => step(1)}
        disabled={count === 0}
        aria-label="Next match"
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      {onAskAI && !tooShort && (
        <button
          onClick={onAskAI}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Sparkles className="w-3.5 h-3.5" /> Ask AI instead
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close find"
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </motion.div>
);

export default FindBar;
