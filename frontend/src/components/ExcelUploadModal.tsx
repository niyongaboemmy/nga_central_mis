import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Download,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
} from "lucide-react";
import { getRoles, bulkCreateUsers, otherSchoolMatchesOf, Role, type OtherSchoolMatch } from "../api/users";
import OtherSchoolReview from "./users/OtherSchoolReview";
import { useToast } from "../contexts/ToastContext";
import * as XLSX from "xlsx";
import SelectField from "./ui/SelectField";

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewUser {
  username: string;
  email: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  address?: string;
  user_type?: string;
  _rowNum: number;
  _errors: string[];
  _isValid: boolean;
  /** A student row without an e-mail: saved, but the account can't sign in. */
  _noEmail?: boolean;
}

type UploadStep = "upload" | "preview" | "processing" | "complete";

// Minimal Drag Drop Zone Component
const DragDropZone = ({
  dragActive,
  fileInputRef,
  onFileChange,
  onDrag,
  onDrop,
}: {
  dragActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) => (
  <div
    className={`relative border-2 rounded-3xl p-8 text-center transition-all duration-200 cursor-pointer ${
      dragActive
        ? "border-green-500 bg-green-50 dark:bg-green-900/20 scale-[1.02]"
        : "border-dashed border-gray-300 dark:border-slate-600 hover:border-green-400 hover:bg-gray-50 dark:hover:bg-slate-800/50"
    }`}
    onDragEnter={onDrag}
    onDragLeave={onDrag}
    onDragOver={onDrag}
    onDrop={onDrop}
    onClick={() => fileInputRef.current?.click()}
  >
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx,.xls"
      onChange={onFileChange}
      className="hidden"
    />
    <div
      className={`w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-all duration-200 ${
        dragActive ? "bg-green-500 scale-110" : "bg-gray-100 dark:bg-slate-700"
      }`}
    >
      <Upload
        className={`w-6 h-6 transition-colors duration-200 ${
          dragActive ? "text-white" : "text-gray-400"
        }`}
      />
    </div>
    <p
      className={`text-sm font-medium transition-colors duration-200 ${
        dragActive
          ? "text-green-600 dark:text-green-400"
          : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {dragActive ? "Drop file here" : "Drag & drop Excel file"}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      or <span className="text-green-500 font-medium">browse</span>
    </p>
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
      .xlsx, .xls up to 5MB
    </p>
  </div>
);

const ExcelUploadModal: React.FC<ExcelUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Rows as read from the sheet; checked again whenever the role changes, because
  // students (and only students) may be uploaded without an e-mail.
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<{
    success: number;
    failed: number;
    without_email?: number;
    errors: string[];
  } | null>(null);
  const [step, setStep] = useState<UploadStep>("upload");
  // Rows the server found in another school (nothing created yet) and the ones to add anyway.
  const [otherMatches, setOtherMatches] = useState<OtherSchoolMatch[] | null>(null);
  const [addRows, setAddRows] = useState<Set<number>>(new Set());
  const clearOtherMatches = () => {
    setOtherMatches(null);
    setAddRows(new Set());
  };
  const [dragActive, setDragActive] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadRoles();
    }
  }, [isOpen]);

  const loadRoles = async () => {
    try {
      const data = await getRoles("ACTIVE");
      if (data) {
        setRoles(data);
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  const validateRow = (
    row: any,
    rowNum: number,
    emailOptional: boolean
  ): { data: PreviewUser; errors: string[] } => {
    const errors: string[] = [];
    const data: PreviewUser = {
      username: "",
      email: "",
      _rowNum: rowNum,
      _errors: [],
      _isValid: true,
    };

    const username = row.username?.toString().trim();
    if (!username) {
      errors.push("Username required");
    } else if (username.length < 3) {
      errors.push("Username min 3 chars");
    }
    data.username = username || "";

    const email = row.email?.toString().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      if (emailOptional) data._noEmail = true;
      else errors.push("Email required (only students may be uploaded without one)");
    } else if (!emailRegex.test(email)) {
      errors.push("Invalid email");
    }
    data.email = email || "";

    data.phone_number = row.phone_number?.toString().trim() || undefined;
    data.first_name = row.first_name?.toString().trim() || undefined;
    data.last_name = row.last_name?.toString().trim() || undefined;
    data.gender = row.gender?.toString().trim().toUpperCase() || undefined;
    data.date_of_birth = row.date_of_birth?.toString().trim() || undefined;
    data.address = row.address?.toString().trim() || undefined;
    data.user_type =
      row.user_type?.toString().trim().toUpperCase() || undefined;

    if (data.gender && !["MALE", "FEMALE", "OTHER"].includes(data.gender)) {
      errors.push("Gender: MALE/FEMALE/OTHER");
    }
    if (
      data.user_type &&
      !["STUDENT", "TEACHER", "PARENT", "ADMIN", "STAFF"].includes(
        data.user_type
      )
    ) {
      errors.push("user_type invalid");
    }

    data._errors = errors;
    data._isValid = errors.length === 0;

    return { data, errors };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (selectedFile: File) => {
    if (
      !selectedFile.name.endsWith(".xlsx") &&
      !selectedFile.name.endsWith(".xls")
    ) {
      setError("Only .xlsx or .xls files allowed");
      return;
    }

    setFile(selectedFile);
    clearOtherMatches();
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        if (!jsonData || jsonData.length === 0) {
          setError("File is empty");
          return;
        }

        setRawRows(jsonData as any[]);
        setStep("preview");
      } catch (err) {
        setError("Failed to parse file");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setStep("processing");
    setLoading(true);
    setError(null);
    setUploadStatus(null);

    try {
      const result = await bulkCreateUsers(
        file,
        selectedRole ? Number(selectedRole) : undefined,
        otherMatches ? { addRows: [...addRows] } : undefined,
      );
      setUploadStatus(result);
      setStep("complete");
      if (result.success > 0) {
        onSuccess();
        const noEmail = result.without_email
          ? ` (${result.without_email} without an e-mail: they can't sign in)`
          : "";
        const skipped = result.skipped_other_school
          ? `, ${result.skipped_other_school} skipped (already in another school)`
          : "";
        showToast(
          `${result.success} user${result.success === 1 ? "" : "s"} created${skipped}${noEmail}${result.failed ? `, ${result.failed} failed` : ""}`,
          result.failed ? "warning" : "success",
        );
      } else if (result.skipped_other_school) {
        showToast(`No users were created: ${result.skipped_other_school} skipped (already in another school)`, "warning");
      } else {
        showToast("No users were created", "error");
      }
    } catch (err: any) {
      const matches = otherSchoolMatchesOf(err);
      if (matches) {
        // Nothing was created: the admin decides who to add, then uploads again.
        setOtherMatches(matches);
        setAddRows(new Set());
        setStep("preview");
        showToast(
          `${matches.length} ${matches.length === 1 ? "person is" : "people are"} already in another school. Choose who to add.`,
          "warning",
        );
        return;
      }
      const status: number | undefined = err.response?.status;
      const serverMessage: string | undefined = err.response?.data?.message;
      if (!err.response) {
        // No answer (timeout or connection lost): the server may still have created the
        // accounts. Refresh the list so the person sees them before trying again.
        setError(
          err.code === "ECONNABORTED"
            ? "The server is taking longer than expected. Some or all users may already have been created: the list has been refreshed, check it before uploading again."
            : "The connection was lost during the upload. Some users may already have been created: the list has been refreshed, check it before uploading again.",
        );
        onSuccess();
      } else if (serverMessage) {
        setError(serverMessage);
      } else if (status === 413) {
        setError("The file is too large for the server. Split it into smaller files.");
      } else if (status === 403) {
        setError("You don't have permission to add users.");
      } else if (status && status >= 500) {
        setError(`The server hit an error (${status}). Some users may have been created: check the list before trying again.`);
        onSuccess();
      } else {
        setError(`Upload failed${status ? ` (${status})` : ""}.`);
      }
      setStep("preview");
      showToast("Upload failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const templateData = [
        {
          username: "john_doe_001",
          email: "john.doe@example.com",
          phone_number: "+250788123456",
          first_name: "John",
          last_name: "Doe",
          gender: "MALE",
          date_of_birth: "2010-01-15",
          address: "Kigali, Rwanda",
          user_type: "STUDENT",
        },
        {
          // A young student without an e-mail: saved, but can't sign in.
          username: "amani_k_003",
          email: "",
          phone_number: "",
          first_name: "Amani",
          last_name: "Keza",
          gender: "FEMALE",
          date_of_birth: "2016-02-11",
          address: "Kigali, Rwanda",
          user_type: "STUDENT",
        },
        {
          username: "jane_smith_002",
          email: "jane.smith@example.com",
          phone_number: "+250788654321",
          first_name: "Jane",
          last_name: "Smith",
          gender: "FEMALE",
          date_of_birth: "2008-05-20",
          address: "Kigali, Rwanda",
          user_type: "TEACHER",
        },
      ];

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet["!cols"] = [
        { wch: 20 },
        { wch: 30 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 10 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
      XLSX.writeFile(workbook, "user_template.xlsx");
    } catch (err) {
      setError("Failed to download template");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    clearOtherMatches();
    setRawRows([]);
    setError(null);
    setWarning(null);
    setUploadStatus(null);
    setStep("upload");
    setSelectedRole("");
  };

  const getUploadButtonWarning = (): string | null => {
    if (!selectedRole) {
      return "Please select a role first";
    }
    if (invalidCount > 0) {
      return `${invalidCount} row(s) have validation errors and cannot be uploaded`;
    }
    if (preview.length === 0) {
      return "No valid rows to upload";
    }
    return null;
  };

  const handleUploadClick = () => {
    const warningMsg = getUploadButtonWarning();
    if (warningMsg) {
      setWarning(warningMsg);
      showToast(warningMsg, "warning");
    } else {
      handleUpload();
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const studentRoleSelected =
    // The select hands back the id as a string, whatever its declared type.
    roles.find((r) => String(r.role_id) === String(selectedRole))?.name?.toUpperCase() === "STUDENT";
  const preview: PreviewUser[] = useMemo(
    () => rawRows.map((row, index) => validateRow(row, index + 2, studentRoleSelected).data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawRows, studentRoleSelected]
  );
  const validCount = preview.filter((p) => p._isValid).length;
  const invalidCount = preview.filter((p) => !p._isValid).length;
  const noEmailCount = preview.filter((p) => p._isValid && p._noEmail).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-blue-500 dark:bg-blue-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Bulk Upload Users
                  </h2>
                  <p className="text-sm text-white/80">Upload Excel file</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                {["upload", "preview", "processing", "complete"].map((s, i) => (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                          step === s
                            ? "bg-green-500 text-white"
                            : [
                                "upload",
                                "preview",
                                "processing",
                                "complete",
                              ].indexOf(step) > i
                            ? "bg-green-200 text-green-600 dark:bg-green-900 dark:text-green-400"
                            : "bg-gray-200 dark:bg-slate-700 text-gray-500"
                        }`}
                      >
                        {[
                          "upload",
                          "preview",
                          "processing",
                          "complete",
                        ].indexOf(step) > i ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          step === s
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : "text-gray-500"
                        } hidden sm:inline`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                    </div>
                    {i < 3 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 rounded ${
                          [
                            "upload",
                            "preview",
                            "processing",
                            "complete",
                          ].indexOf(step) > i
                            ? "bg-green-400"
                            : "bg-gray-200 dark:bg-slate-700"
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Upload Step */}
              {step === "upload" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 w-full"
                >
                  <div className="w-full flex flex-row items-center gap-4">
                    {/* Role Selection */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Assign Role to All Users
                      </label>
                      <div className="relative">
                        <SelectField
                          value={selectedRole}
                          onChange={(e) =>
                            setSelectedRole(e.target.value as number | "")
                          }
                          className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-blue-500 dark:border-yellow-600 rounded-xl text-sm focus:outline-none focus:border-green-500 dark:text-white"
                        >
                          <option value="">Choose a role...</option>
                          {roles.map((role) => (
                            <option key={role.role_id} value={role.role_id}>
                              {role.name}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    </div>

                    {/* Download Template */}
                    <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            Download template
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            Get sample Excel file
                          </p>
                        </div>
                        <button
                          onClick={handleDownloadTemplate}
                          disabled={downloadingTemplate}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
                        >
                          {downloadingTemplate ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          Template
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Drag Drop Zone */}
                  <DragDropZone
                    dragActive={dragActive}
                    fileInputRef={fileInputRef}
                    onFileChange={handleFileChange}
                    onDrag={handleDrag}
                    onDrop={handleDrop}
                  />

                  {/* Quick Instructions */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-sm">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Required columns:
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      username, email
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                      Students may be uploaded without an email (leave it
                      blank): their accounts are saved but can't sign in until
                      an email is added.
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                      Optional: phone_number, first_name, last_name, gender,
                      date_of_birth, address, user_type
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Preview Step */}
              {step === "preview" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {otherMatches && (
                    <OtherSchoolReview
                      matches={otherMatches}
                      addRows={addRows}
                      onToggle={(row) =>
                        setAddRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(row)) next.delete(row);
                          else next.add(row);
                          return next;
                        })
                      }
                    />
                  )}

                  {/* File Info */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {((file?.size || 0) / 1024).toFixed(1)} KB •{" "}
                        {preview.length} rows
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        clearOtherMatches();
                        setRawRows([]);
                        setStep("upload");
                      }}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>

                  {/* Warning Message */}
                  {warning && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl flex items-center gap-3"
                    >
                      <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        {warning}
                      </p>
                      <button
                        onClick={() => setWarning(null)}
                        className="ml-auto p-1 hover:bg-yellow-100 dark:hover:bg-yellow-800 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4 text-yellow-500" />
                      </button>
                    </motion.div>
                  )}

                  {/* Validation Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <p className="text-xl font-bold text-green-600 dark:text-green-400">
                        {validCount}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Valid
                      </p>
                    </div>
                    <div
                      className={`p-3 rounded-xl ${
                        invalidCount > 0
                          ? "bg-red-50 dark:bg-red-900/20"
                          : "bg-gray-50 dark:bg-slate-900"
                      }`}
                    >
                      <p
                        className={`text-xl font-bold ${
                          invalidCount > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-500"
                        }`}
                      >
                        {invalidCount}
                      </p>
                      <p
                        className={`text-xs ${
                          invalidCount > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-500"
                        }`}
                      >
                        Invalid
                      </p>
                    </div>
                  </div>

                  {noEmailCount > 0 && (
                    <p className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                      {noEmailCount} student{noEmailCount === 1 ? " has" : "s have"} no
                      email: {noEmailCount === 1 ? "the account" : "their accounts"} will
                      be saved but can't sign in until an email is added.
                    </p>
                  )}
                  {!studentRoleSelected &&
                    preview.some((p) => !p.email) &&
                    selectedRole !== "" && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        Only students may be uploaded without an email. Fill in
                        the missing emails, or press Change and upload the file
                        under the Student role.
                      </p>
                    )}

                  {/* Preview Table */}
                  <div className="border border-gray-200 dark:border-slate-600 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-slate-700 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">
                              Row
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">
                              Username
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">
                              Email
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-600">
                          {preview.slice(0, 15).map((row, i) => (
                            <tr
                              key={i}
                              className={
                                !row._isValid
                                  ? "bg-red-50/50 dark:bg-red-900/10"
                                  : "hover:bg-gray-50 dark:hover:bg-slate-600/30"
                              }
                            >
                              <td className="px-3 py-2 text-gray-500">
                                {row._rowNum}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    !row.username
                                      ? "text-red-500"
                                      : "text-gray-700 dark:text-gray-200"
                                  }
                                >
                                  {row.username || "(missing)"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {row.email ? (
                                  row.email
                                ) : row._noEmail ? (
                                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                                    No email · can't sign in
                                  </span>
                                ) : (
                                  <span className="text-red-500">(missing)</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {row._isValid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-xs">
                                    <CheckCircle className="w-3 h-3" />
                                    Valid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs">
                                    <AlertCircle className="w-3 h-3" />
                                    {row._errors.length} errors
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {preview.length > 15 && (
                      <div className="px-3 py-2 bg-gray-50 dark:bg-slate-700 text-xs text-gray-500 text-center">
                        Showing 15 of {preview.length} rows
                      </div>
                    )}
                  </div>

                  {/* Error Details */}
                  {invalidCount > 0 && (
                    <details className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                      <summary className="text-sm font-medium text-red-700 dark:text-red-300 cursor-pointer">
                        Show {invalidCount} error(s)
                      </summary>
                      <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {preview
                          .filter((p) => !p._isValid)
                          .slice(0, 5)
                          .map((row, i) => (
                            <li
                              key={i}
                              className="text-xs text-red-600 dark:text-red-400"
                            >
                              Row {row._rowNum}: {row._errors.join(", ")}
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}
                </motion.div>
              )}

              {/* Processing Step */}
              {step === "processing" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="py-12 text-center"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="w-12 h-12 border-3 border-green-200 border-t-green-500 rounded-full mx-auto mb-4"
                  />
                  <p className="text-base font-medium text-gray-700 dark:text-gray-200">
                    Processing...
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Creating user accounts
                  </p>
                </motion.div>
              )}

              {/* Complete Step */}
              {step === "complete" && uploadStatus && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      uploadStatus.success > 0
                        ? "bg-green-100 dark:bg-green-900/30"
                        : "bg-red-100 dark:bg-red-900/30"
                    }`}
                  >
                    {uploadStatus.success > 0 ? (
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    ) : (
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    )}
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {uploadStatus.success > 0
                      ? "Upload Complete!"
                      : "Upload Failed"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {uploadStatus.success} created, {uploadStatus.failed} failed
                  </p>
                  {!!uploadStatus.without_email && (
                    <p className="text-xs text-gray-500 mt-1">
                      {uploadStatus.without_email} without an email: they can't
                      sign in until an email is added.
                    </p>
                  )}

                  {uploadStatus.errors.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-left max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
                        Errors:
                      </p>
                      {uploadStatus.errors.map((err, i) => (
                        <p
                          key={i}
                          className="text-xs text-red-600 dark:text-red-400"
                        >
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                {step === "complete" ? "Close" : "Cancel"}
              </button>

              {step === "upload" && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Select File
                </button>
              )}

              {step === "preview" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFile(null);
                      clearOtherMatches();
                      setRawRows([]);
                      setStep("upload");
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Change
                  </button>
                  <div className="relative">
                    <button
                      onClick={handleUploadClick}
                      disabled={loading}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors flex items-center gap-2 ${
                        loading
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : invalidCount > 0 || !selectedRole
                          ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                          : "bg-green-500 hover:bg-green-600 text-white"
                      }`}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          {otherMatches
                            ? `Upload, skip ${otherMatches.length - addRows.size}`
                            : `Upload ${validCount} Valid`}
                        </>
                      )}
                    </button>
                    {/* Warning indicator on button */}
                    {(invalidCount > 0 || !selectedRole) && !loading && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === "complete" && (
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ExcelUploadModal;
