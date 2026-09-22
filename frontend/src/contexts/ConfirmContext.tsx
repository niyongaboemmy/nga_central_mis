import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog, { ConfirmOptions } from "../components/ui/ConfirmDialog";

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | undefined>(undefined);

/**
 * Promise-based confirmation, mounted once at the app root.
 *
 *   if (!(await confirm({ title: "Delete this week?", tone: "danger" }))) return;
 *
 * It replaces `window.confirm` at every destructive call site: same one-line shape, but a
 * dialog that matches the app in both themes, says what will be lost, and can hold a
 * spinner while the delete runs. Awaiting it never throws — a dismissed dialog resolves
 * false, so the caller just returns.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<Confirm>((opts) => {
    // A second request while one is open resolves the first as cancelled rather than
    // stranding its caller awaiting forever.
    resolverRef.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={!!options}
        title={options?.title || ""}
        message={options?.message}
        details={options?.details}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        tone={options?.tone}
        confirmationPhrase={options?.confirmationPhrase}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
};

/** Throws outside the provider rather than silently falling back — a delete must not
 *  proceed just because the dialog couldn't be shown. */
export const useConfirm = (): Confirm => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
};

export default ConfirmContext;
