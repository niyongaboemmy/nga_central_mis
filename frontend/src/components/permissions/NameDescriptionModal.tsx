import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Button from "../ui/Button";

interface NameDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  iconAccent?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  initialName?: string;
  initialDescription?: string;
  submitLabel: string;
  saving?: boolean;
  errorMessage?: string | null;
  onSubmit: (data: { name: string; description: string }) => void;
}

const NameDescriptionModal: React.FC<NameDescriptionModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconAccent = "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  nameLabel = "Name",
  namePlaceholder = "Enter name",
  initialName = "",
  initialDescription = "",
  submitLabel,
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
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {(Icon || subtitle) && (
          <div className="flex items-center gap-3 -mt-1">
            {Icon && (
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconAccent}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
        )}

        <Input
          label={nameLabel}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={namePlaceholder}
        />
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
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NameDescriptionModal;
