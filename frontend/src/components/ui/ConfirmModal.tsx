import React from "react";
import ConfirmDialog, { ConfirmTone } from "./ConfirmDialog";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  isLoading?: boolean;
}

/**
 * Declarative wrapper over ConfirmDialog, for the call sites that keep the open/closed state
 * themselves (usually because the confirm drives a loading spinner). Callers that just need a
 * yes/no before acting should use `useConfirm()` instead — same dialog, one line.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  details,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger",
  isLoading = false,
}) => (
  <ConfirmDialog
    isOpen={isOpen}
    title={title}
    message={message}
    details={details}
    confirmText={confirmText}
    cancelText={cancelText}
    tone={tone}
    isLoading={isLoading}
    onConfirm={onConfirm}
    onCancel={onClose}
  />
);

export default ConfirmModal;
