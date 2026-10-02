import React from "react";
import Modal from "../ui/Modal";

/** Placeholder until the register lands (plan §12, phase 3). */
const RegisterSheet: React.FC<{ sessionId: number; onClose: () => void; onSaved?: () => void }> = ({ onClose }) => (
  <Modal isOpen onClose={onClose} title="Register">
    <p className="text-sm text-slate-600 dark:text-slate-300">The register is coming soon.</p>
  </Modal>
);

export default RegisterSheet;
