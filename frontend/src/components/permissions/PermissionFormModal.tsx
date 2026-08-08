import React, { useState, useEffect } from "react";
import { AlertCircle, Key } from "lucide-react";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Button from "../ui/Button";
import { PermissionNamePicker } from "./shared";

interface PermissionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  availableNames: string[];
  initialName?: string;
  initialDescription?: string;
  saving?: boolean;
  errorMessage?: string | null;
  onSubmit: (data: { name: string; description: string }) => void;
}

const PermissionFormModal: React.FC<PermissionFormModalProps> = ({
  isOpen,
  onClose,
  mode,
  availableNames,
  initialName = "",
  initialDescription = "",
  saving = false,
  errorMessage,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
    }
  }, [isOpen, initialName, initialDescription]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "New Permission" : "Edit Permission"}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 -mt-1">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {mode === "create"
              ? "Pick a permission defined in the codebase — names can't be made up."
              : "The name is fixed since code elsewhere checks for it exactly."}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
            Name
          </label>
          {mode === "create" ? (
            <PermissionNamePicker
              options={availableNames}
              value={name}
              onChange={setName}
            />
          ) : (
            <input
              value={name}
              disabled
              className="w-full px-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
          )}
        </div>

        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter description"
        />

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            isLoading={saving}
            disabled={!name.trim() || saving}
            onClick={() =>
              onSubmit({ name: name.trim(), description: description.trim() })
            }
          >
            {mode === "create" ? "Create" : "Update"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PermissionFormModal;
