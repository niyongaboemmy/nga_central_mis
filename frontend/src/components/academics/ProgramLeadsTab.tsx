import React, { useEffect, useMemo, useState } from "react";
import { AllProgramLead, AcademicYear, Program } from "../../api/academics";
import { getUsers, UserWithProfile } from "../../api/users";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import SelectField from "../ui/SelectField";

interface ProgramLeadsTabProps {
  data: AllProgramLead[];
  academicYears: AcademicYear[];
  programs: Program[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: {
    user_id: number;
    program_id: number;
    academic_year_id: number;
  }) => Promise<void>;
  onDelete: (
    programId: number,
    userId: number,
    academicYearId: number,
  ) => Promise<void>;
  onCopy: (
    sourceAcademicYearId: number,
    targetAcademicYearId: number,
  ) => Promise<{ copied: number; skipped: number; total: number }>;
}

const ProgramLeadsTab: React.FC<ProgramLeadsTabProps> = ({
  data,
  academicYears,
  programs,
  loading,
  onRefresh,
  onCreate,
  onDelete,
  onCopy,
}) => {
  const currentYearId = useMemo(
    () => academicYears.find((y) => y.is_current === 1)?.academic_year_id || 0,
    [academicYears],
  );
  const [yearFilter, setYearFilter] = useState<number>(0);
  const [yearFilterInitialized, setYearFilterInitialized] = useState(false);

  useEffect(() => {
    if (!yearFilterInitialized && currentYearId) {
      setYearFilterInitialized(true);
      setYearFilter(currentYearId);
    }
  }, [currentYearId, yearFilterInitialized]);

  const filteredData = useMemo(
    () =>
      yearFilter
        ? data.filter((item) => item.academic_year_id === yearFilter)
        : data,
    [data, yearFilter],
  );

  const countByYear = useMemo(() => {
    const counts = new Map<number, number>();
    data.forEach((item) => {
      counts.set(
        item.academic_year_id,
        (counts.get(item.academic_year_id) || 0) + 1,
      );
    });
    return counts;
  }, [data]);

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceYearId, setCopySourceYearId] = useState<number>(0);
  const [copyTargetYearId, setCopyTargetYearId] = useState<number>(0);
  const [copySubmitting, setCopySubmitting] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copyResultMessage, setCopyResultMessage] = useState("");

  const openCopyModal = () => {
    const yearsWithLeads = academicYears
      .filter((y) => (countByYear.get(y.academic_year_id) || 0) > 0)
      .sort((a, b) => b.academic_year_id - a.academic_year_id);

    const defaultTarget =
      yearFilter && (countByYear.get(yearFilter) || 0) === 0
        ? yearFilter
        : academicYears.find(
            (y) => (countByYear.get(y.academic_year_id) || 0) === 0,
          )?.academic_year_id || 0;

    const defaultSource = yearsWithLeads.find(
      (y) => y.academic_year_id !== defaultTarget,
    )?.academic_year_id;

    setCopyTargetYearId(defaultTarget);
    setCopySourceYearId(defaultSource || 0);
    setCopyError("");
    setCopyResultMessage("");
    setShowCopyModal(true);
  };

  const handleCopy = async () => {
    if (!copySourceYearId || !copyTargetYearId) {
      setCopyError("Select both a source and target academic year");
      return;
    }
    if (copySourceYearId === copyTargetYearId) {
      setCopyError("Source and target academic years must be different");
      return;
    }
    setCopySubmitting(true);
    setCopyError("");
    try {
      const result = await onCopy(copySourceYearId, copyTargetYearId);
      setCopyResultMessage(
        result.skipped > 0
          ? `Copied ${result.copied} program lead(s); ${result.skipped} already existed in the target year`
          : `Copied ${result.copied} program lead(s) successfully`,
      );
      setYearFilter(copyTargetYearId);
    } catch (error: any) {
      setCopyError(
        error?.response?.data?.message || "Failed to copy program leads",
      );
    } finally {
      setCopySubmitting(false);
    }
  };

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignYearId, setAssignYearId] = useState<number>(0);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherResults, setTeacherResults] = useState<UserWithProfile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(
    null,
  );
  const [assignProgramId, setAssignProgramId] = useState<number>(0);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState("");

  const openAssignModal = () => {
    setAssignYearId(yearFilter || currentYearId);
    setTeacherSearch("");
    setTeacherResults([]);
    setSelectedUser(null);
    setAssignProgramId(0);
    setAssignError("");
    setShowAssignModal(true);
  };

  useEffect(() => {
    if (!showAssignModal || teacherSearch.trim().length < 2) {
      setTeacherResults([]);
      return;
    }
    let cancelled = false;
    setSearchingUsers(true);
    const timeout = setTimeout(() => {
      getUsers({ search: teacherSearch.trim(), limit: 20 })
        .then((users) => {
          if (!cancelled && users) setTeacherResults(users);
        })
        .catch(() => {
          if (!cancelled) setTeacherResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingUsers(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [teacherSearch, showAssignModal]);

  const handleAssign = async () => {
    if (!selectedUser || !assignProgramId || !assignYearId) {
      setAssignError("Select a user, program, and academic year");
      return;
    }
    setAssignSubmitting(true);
    setAssignError("");
    try {
      await onCreate({
        user_id: selectedUser.user.user_id,
        program_id: assignProgramId,
        academic_year_id: assignYearId,
      });
      setShowAssignModal(false);
    } catch (error: any) {
      setAssignError(
        error?.response?.data?.message || "Failed to assign program lead",
      );
    } finally {
      setAssignSubmitting(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<AllProgramLead | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (lead: AllProgramLead) => {
    setSelectedLead(lead);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedLead) return;
    setDeleting(true);
    try {
      await onDelete(
        selectedLead.program_id,
        selectedLead.user_id,
        selectedLead.academic_year_id,
      );
      setShowDeleteModal(false);
      setSelectedLead(null);
    } catch (error) {
      console.error("Failed to remove program lead:", error);
    } finally {
      setDeleting(false);
    }
  };

  const getAcademicYearName = (yearId: number) => {
    const year = academicYears.find((y) => y.academic_year_id === yearId);
    return year?.name || "Unknown";
  };

  return (
    <div className="">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Program Leads
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Everyone assigned to lead a program, across every user
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <SelectField
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value))}
            className="px-4 py-2 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-sm text-text-primary-light dark:text-text-primary-dark whitespace-nowrap"
          >
            <option value={0}>All Academic Years</option>
            {academicYears.map((year) => (
              <option key={year.academic_year_id} value={year.academic_year_id}>
                {year.name}
                {year.is_current === 1 ? " (Current)" : ""}
              </option>
            ))}
          </SelectField>
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={loading}
            className="whitespace-nowrap"
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={openCopyModal}
            disabled={loading || countByYear.size === 0}
            className="whitespace-nowrap"
          >
            Copy Program Leads
          </Button>
          <Button onClick={openAssignModal} className="whitespace-nowrap">
            Assign Program Lead
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800/40 rounded-2xl shadow-sm border border-border-light dark:border-border-dark/30 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-light dark:divide-border-dark/30">
              <thead className="bg-surface-light dark:bg-surface-dark">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Program
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Academic Year
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800/30 divide-y divide-border-light dark:divide-border-dark/30">
                {filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      {yearFilter
                        ? `No program leads found for ${getAcademicYearName(yearFilter)}. Use "Assign Program Lead" to create one, or "Copy Program Leads" to reuse another year's.`
                        : "No program leads found"}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => (
                    <tr
                      key={item.lead_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.user_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.program_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.academic_year_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Copy Program Leads Modal */}
      <Modal
        isOpen={showCopyModal}
        onClose={() => {
          setShowCopyModal(false);
          setCopyError("");
          setCopyResultMessage("");
        }}
        title="Copy Program Leads"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            Reuse an existing academic year's program leads instead of
            reassigning them one by one. Pairs that already exist in the
            target year are skipped automatically.
          </p>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Copy from
            </label>
            <SelectField
              value={copySourceYearId}
              onChange={(e) => setCopySourceYearId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select source academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  lead{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Copy to
            </label>
            <SelectField
              value={copyTargetYearId}
              onChange={(e) => setCopyTargetYearId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select target academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  lead{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </SelectField>
          </div>

          {copyResultMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {copyResultMessage}
            </p>
          )}

          {copyError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {copyError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCopyModal(false);
              setCopyError("");
              setCopyResultMessage("");
            }}
          >
            Close
          </Button>
          <Button
            onClick={handleCopy}
            disabled={copySubmitting}
            isLoading={copySubmitting}
          >
            {copySubmitting ? "Copying..." : "Copy Program Leads"}
          </Button>
        </div>
      </Modal>

      {/* Assign Program Lead Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Program Lead"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <SelectField
              value={assignYearId}
              onChange={(e) => setAssignYearId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select an academic year...</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name}
                  {year.is_current === 1 ? " (Current)" : ""}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              User
            </label>
            {selectedUser ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                <span className="text-sm text-text-primary-light dark:text-text-primary-dark">
                  {selectedUser.profile?.first_name}{" "}
                  {selectedUser.profile?.last_name} (
                  {selectedUser.user.username})
                </span>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Search by name or username..."
                  className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
                />
                {searchingUsers && (
                  <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
                    Searching...
                  </p>
                )}
                {teacherResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border-light dark:border-border-dark/30 rounded-2xl divide-y divide-border-light dark:divide-border-dark/30">
                    {teacherResults.map((u) => (
                      <button
                        key={u.user.user_id}
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-light dark:hover:bg-surface-dark text-text-primary-light dark:text-text-primary-dark"
                      >
                        {u.profile?.first_name} {u.profile?.last_name} (
                        {u.user.username})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Program
            </label>
            <SelectField
              value={assignProgramId}
              onChange={(e) => setAssignProgramId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select a program...</option>
              {programs.map((program) => (
                <option key={program.program_id} value={program.program_id}>
                  {program.name}
                </option>
              ))}
            </SelectField>
          </div>

          {assignError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {assignError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={() => setShowAssignModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              assignSubmitting || !selectedUser || !assignProgramId || !assignYearId
            }
            isLoading={assignSubmitting}
          >
            {assignSubmitting ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedLead(null);
        }}
        onConfirm={confirmDelete}
        title="Remove Program Lead"
        message={`Are you sure you want to remove "${selectedLead?.user_name}" as lead of "${selectedLead?.program_name}"? This action cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
};

export default ProgramLeadsTab;
