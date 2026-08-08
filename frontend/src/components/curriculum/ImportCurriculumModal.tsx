import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  CloudUpload,
  ListChecks,
} from "lucide-react";
import Modal from "../ui/Modal";
import {
  curriculumImportApi,
  CurriculumImportStatus,
  ExtractedElement,
} from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";
import CurriculumExtractionPreview from "./CurriculumExtractionPreview";

interface ImportCurriculumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  subjectId: number;
  subjectName?: string;
}

type Step = "upload" | "processing" | "preview";

const STEPS: { key: CurriculumImportStatus["status"]; label: string; description: string }[] = [
  { key: "parsing", label: "Reading document", description: "Extracting text from your curriculum file" },
  { key: "analyzing", label: "Analyzing with AI", description: "Gemini is identifying elements & performance criteria" },
  { key: "structuring", label: "Structuring curriculum", description: "Matching indicative content & hours to each element" },
];

const POLL_INTERVAL_MS = 1200;
const ACCEPTED_EXT = ".pdf,.docx,.txt";

const DropZone: React.FC<{
  file: File | null;
  onFile: (f: File) => void;
  disabled?: boolean;
}> = ({ file, onFile, disabled }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
        dragging
          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
          : "border-gray-300 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-600 bg-gray-50/50 dark:bg-gray-900/20"
      } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
        <CloudUpload className="w-7 h-7 text-white" />
      </div>
      {file ? (
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
          <FileText className="w-4 h-4 text-violet-500" />
          {file.name}
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Drop the official curriculum PDF/DOCX here, or click to browse
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Supports .pdf, .docx, .txt — e.g. an RTB curriculum document
          </p>
        </>
      )}
    </div>
  );
};

const ImportCurriculumModal: React.FC<ImportCurriculumModalProps> = ({
  isOpen,
  onClose,
  onImported,
  subjectId,
  subjectName,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<CurriculumImportStatus | null>(null);
  const [previewElements, setPreviewElements] = useState<ExtractedElement[]>([]);
  const [sourceFilename, setSourceFilename] = useState<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setIsSubmitting(false);
    setJobId(null);
    setJobStatus(null);
    setPreviewElements([]);
    setSourceFilename(undefined);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  useEffect(() => {
    if (isOpen) reset();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    onClose();
  };

  const startPolling = (jid: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await curriculumImportApi.getStatus(subjectId, jid);
        const status = res.data.data;
        setJobStatus(status);

        if (status.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPreviewElements(status.elements || []);
          setSourceFilename(status.sourceFilename);
          setStep("preview");
        } else if (status.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          showToast(status.error || "Curriculum extraction failed", "error");
          setStep("upload");
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        showToast("Lost connection while checking import progress", "error");
        setStep("upload");
      }
    }, POLL_INTERVAL_MS);
  };

  const handleStartExtraction = async () => {
    if (!file) {
      showToast("Choose a curriculum document first", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (subjectName) formData.append("subject_name", subjectName);
      const res = await curriculumImportApi.start(subjectId, formData);
      const jid = res.data.data.jobId;
      setJobId(jid);
      setStep("processing");
      startPolling(jid);
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to start curriculum import",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStepIdx = jobStatus
    ? STEPS.findIndex((s) => s.key === jobStatus.status)
    : -1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      contentClassName="p-0"
      title={
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-md shadow-violet-500/20">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              Import from Curriculum
            </div>
            <div className="text-xs font-normal text-gray-400 dark:text-gray-500">
              AI-assisted extraction from an official curriculum document
            </div>
          </div>
        </div>
      }
    >
      <div className="p-6">
        {step === "upload" && (
          <div className="space-y-5">
            <DropZone file={file} onFile={setFile} disabled={isSubmitting} />
            <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3">
              <ListChecks className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
              <p>
                Gemini will read the document and detect every <strong>Element of
                Competency</strong>, its <strong>Performance Criteria</strong>, and
                (where available) the matching <strong>learning hours</strong> and{" "}
                <strong>indicative content</strong>. You'll be able to review, edit, and
                choose exactly what gets saved before anything is written to the
                database.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExtraction}
                disabled={!file || isSubmitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 rounded-full transition-colors shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Extract with AI
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="py-6 space-y-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20 animate-pulse">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {jobStatus?.message || "Starting extraction..."}
              </p>
              <p className="text-xs text-gray-400">{file?.name}</p>
            </div>

            <div className="space-y-3 max-w-sm mx-auto">
              {STEPS.map((s, i) => {
                const done = activeStepIdx > i || jobStatus?.status === "done";
                const active = activeStepIdx === i && jobStatus?.status !== "done";
                return (
                  <div key={s.key} className="flex items-start gap-3">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : active ? (
                      <Loader2 className="w-5 h-5 text-violet-500 animate-spin flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700 flex-shrink-0" />
                    )}
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          done || active
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-400 dark:text-gray-600"
                        }`}
                      >
                        {s.label}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-600">
                        {s.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === "preview" && (
          <CurriculumExtractionPreview
            subjectId={subjectId}
            initialElements={previewElements}
            sourceFilename={sourceFilename}
            jobId={jobId || undefined}
            onSaved={() => {
              onImported();
              handleClose();
            }}
            onCancel={() => setStep("upload")}
            cancelLabel="Start over"
          />
        )}
      </div>
    </Modal>
  );
};

export default ImportCurriculumModal;
