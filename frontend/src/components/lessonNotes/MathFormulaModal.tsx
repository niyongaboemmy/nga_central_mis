import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../ui/Modal";
import { Sigma, Info, RotateCcw, Check } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latex: string) => void;
}

// Categorized quick-insert palette (ported from nga-task-mentor's MathFormulaModal) plus
// a MathLive visual input field below it — a teacher who's never seen LaTeX can build a
// whole formula by clicking symbols and using MathLive's own on-screen math keyboard,
// never typing a backslash. The field's live value (LaTeX) is still what gets inserted,
// so it stays compatible with the existing @tiptap/extension-mathematics $...$ rendering.
const CATEGORIES: { label: string; symbols: { label: string; latex: string; preview: string }[] }[] = [
  {
    label: "Basic",
    symbols: [
      { label: "Fraction", latex: "\\frac{a}{b}", preview: "a/b" },
      { label: "Square root", latex: "\\sqrt{x}", preview: "√x" },
      { label: "Power", latex: "x^{n}", preview: "xⁿ" },
      { label: "Subscript", latex: "x_{n}", preview: "xₙ" },
      { label: "Absolute value", latex: "\\left|x\\right|", preview: "|x|" },
      { label: "Infinity", latex: "\\infty", preview: "∞" },
      { label: "Pi", latex: "\\pi", preview: "π" },
      { label: "Plus/minus", latex: "\\pm", preview: "±" },
      { label: "Not equal", latex: "\\neq", preview: "≠" },
      { label: "Approx", latex: "\\approx", preview: "≈" },
      { label: "Less/equal", latex: "\\leq", preview: "≤" },
      { label: "Greater/equal", latex: "\\geq", preview: "≥" },
    ],
  },
  {
    label: "Algebra",
    symbols: [
      { label: "Sum", latex: "\\sum_{i=1}^{n}", preview: "Σ" },
      { label: "Product", latex: "\\prod_{i=1}^{n}", preview: "Π" },
      { label: "Nth root", latex: "\\sqrt[n]{x}", preview: "ⁿ√x" },
      { label: "Quadratic formula", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", preview: "Quadratic" },
      { label: "Logarithm", latex: "\\log_{b}{x}", preview: "logᵦx" },
      { label: "Natural log", latex: "\\ln(x)", preview: "ln(x)" },
      { label: "Exponential", latex: "e^{x}", preview: "eˣ" },
      { label: "Factorial", latex: "n!", preview: "n!" },
      { label: "Binomial", latex: "\\binom{n}{k}", preview: "C(n,k)" },
    ],
  },
  {
    label: "Geometry & Trig",
    symbols: [
      { label: "sin", latex: "\\sin(\\theta)", preview: "sin θ" },
      { label: "cos", latex: "\\cos(\\theta)", preview: "cos θ" },
      { label: "tan", latex: "\\tan(\\theta)", preview: "tan θ" },
      { label: "Degrees", latex: "90^{\\circ}", preview: "90°" },
      { label: "Pythagorean theorem", latex: "a^2 + b^2 = c^2", preview: "a²+b²=c²" },
      { label: "Area of circle", latex: "A = \\pi r^2", preview: "πr²" },
      { label: "Circumference", latex: "C = 2\\pi r", preview: "2πr" },
      { label: "Angle", latex: "\\angle", preview: "∠" },
      { label: "Triangle", latex: "\\triangle", preview: "△" },
    ],
  },
  {
    label: "Calculus",
    symbols: [
      { label: "Derivative", latex: "\\frac{d}{dx}", preview: "d/dx" },
      { label: "Partial derivative", latex: "\\frac{\\partial f}{\\partial x}", preview: "∂f/∂x" },
      { label: "Integral", latex: "\\int_{a}^{b} f(x)\\,dx", preview: "∫" },
      { label: "Limit", latex: "\\lim_{x \\to 0} f(x)", preview: "lim" },
      { label: "Gradient", latex: "\\nabla f", preview: "∇f" },
    ],
  },
  {
    label: "Greek",
    symbols: [
      { label: "Alpha", latex: "\\alpha", preview: "α" },
      { label: "Beta", latex: "\\beta", preview: "β" },
      { label: "Gamma", latex: "\\gamma", preview: "γ" },
      { label: "Delta", latex: "\\delta", preview: "δ" },
      { label: "Theta", latex: "\\theta", preview: "θ" },
      { label: "Lambda", latex: "\\lambda", preview: "λ" },
      { label: "Mu", latex: "\\mu", preview: "μ" },
      { label: "Sigma", latex: "\\sigma", preview: "σ" },
      { label: "Capital Delta", latex: "\\Delta", preview: "Δ" },
      { label: "Capital Sigma", latex: "\\Sigma", preview: "Σ" },
      { label: "Omega", latex: "\\Omega", preview: "Ω" },
    ],
  },
];

const MathFormulaModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mathFieldRef = useRef<any>(null);
  const [latex, setLatex] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const [showTip, setShowTip] = useState(false);

  // MathLive's <math-field> custom element is mounted imperatively rather than as JSX —
  // it isn't a typed React component, and imperative creation matches the reference
  // implementation this was ported from (nga-task-mentor's MathFormulaModal).
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    let field: any;
    let cancelled = false;

    (async () => {
      await import("mathlive");
      if (cancelled || !containerRef.current) return;

      field = document.createElement("math-field");
      field.setAttribute("virtual-keyboard-mode", "onfocus");
      field.setAttribute("math-virtual-keyboard-policy", "sandboxed");
      Object.assign(field.style, {
        width: "100%",
        minHeight: "48px",
        fontSize: "20px",
        display: "block",
        outline: "none",
        padding: "4px",
      });

      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(field);
      mathFieldRef.current = field;

      const handleInput = () => setLatex(field.value || "");
      field.addEventListener("input", handleInput);
      setTimeout(() => field.focus(), 100);
    })();

    return () => {
      cancelled = true;
      mathFieldRef.current = null;
      setLatex("");
    };
  }, [isOpen]);

  const insertSymbol = useCallback((snippet: string) => {
    const field = mathFieldRef.current;
    if (!field) return;
    field.executeCommand(["insert", snippet, { selectionMode: "after" }]);
    setTimeout(() => setLatex(field.value || ""), 30);
    field.focus();
  }, []);

  const handleInsert = () => {
    const field = mathFieldRef.current;
    const value = (field?.value || latex).trim();
    if (!value) return;
    onInsert(value);
    setLatex("");
    onClose();
  };

  const handleClear = () => {
    const field = mathFieldRef.current;
    if (field) field.value = "";
    setLatex("");
    field?.focus();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      contentClassName="p-0"
      title={
        <div>
          <div className="flex items-center gap-2">
            <Sigma className="w-5 h-5 text-violet-600" /> Formula Builder
          </div>
          <p className="text-xs font-normal text-gray-500 dark:text-gray-400 mt-1">
            Click a symbol to insert it, or type/tap directly in the box below — no LaTeX knowledge needed.
          </p>
        </div>
      }
    >
      <div className="flex flex-col">
        <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="flex gap-1 px-4 pt-3 overflow-x-auto">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => setActiveCategory(i)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  activeCategory === i
                    ? "bg-violet-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-3">
            {CATEGORIES[activeCategory].symbols.map((sym) => (
              <button
                key={sym.latex}
                type="button"
                onClick={() => insertSymbol(sym.latex)}
                title={sym.label}
                className="flex flex-col items-center gap-0.5 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors text-center"
              >
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{sym.preview}</span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate max-w-full">{sym.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Formula editor
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTip((v) => !v)}
                className="text-gray-400 hover:text-violet-500 transition-colors"
                title="Show tips"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Clear formula"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showTip && (
            <div className="mb-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300">
              Click the buttons above to build your formula, or click inside the box below — a
              full visual math keyboard opens at the bottom of the screen. No LaTeX typing required.
            </div>
          )}

          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-950 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-colors">
            <div ref={containerRef} className="min-h-[48px]" />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700/50">
          <div className="text-xs text-gray-400 dark:text-gray-500 font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded max-w-[240px] truncate">
            {latex || <span className="italic opacity-60">no formula yet…</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!latex.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> Insert formula
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MathFormulaModal;
