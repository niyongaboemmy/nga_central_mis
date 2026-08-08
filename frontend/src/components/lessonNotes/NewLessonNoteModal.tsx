import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, FileText, Loader2, AlertTriangle, BookOpen, CheckCircle2, RotateCcw } from "lucide-react";
import Modal from "../ui/Modal";
import { myAssignedSubjectsApi, MyAssignedSubject } from "../../api/academics";
import { schemeOfWorkApi, SchemeEntry } from "../../api/schemeOfWork";
import { competenciesApi, SubjectCompetency } from "../../api/curriculum";
import { lessonNotesApi, AINoteGenerationStatus } from "../../api/lessonNotes";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialSubjectId?: number;
}

const POLL_INTERVAL_MS = 1200;

// "Week 3" -> 3. Scheme entries generally come back ordered by start_date already, but
// that's a second-hand guarantee (depends on every entry having a correct date) — parsing
// the week label itself is a direct, defensive way to guarantee true numeric/sequential
// order regardless of how the API sorted them.
const weekNumberOf = (weekLabel: string): number => {
  const match = /(\d+)/.exec(weekLabel || "");
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

const NewLessonNoteModal: React.FC<Props> = ({ isOpen, onClose, initialSubjectId }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedTermId } = useAcademicPeriod();

  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [classGroupId, setClassGroupId] = useState<number | "">("");
  const [entries, setEntries] = useState<SchemeEntry[]>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [entryId, setEntryId] = useState<number | "">("");
  // Weeks this teacher already has a lesson note for, in this exact subject/class/term —
  // offering them again would just invite duplicate notes for the same week.
  const [coveredEntryIds, setCoveredEntryIds] = useState<Set<number>>(new Set());
  const [competencies, setCompetencies] = useState<SubjectCompetency[]>([]);
  const [competencyId, setCompetencyId] = useState<number | "">("");
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [jobStatus, setJobStatus] = useState<AINoteGenerationStatus | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSubjectId(initialSubjectId ?? "");
    setClassGroupId("");
    setEntries([]);
    setEntriesLoaded(false);
    setEntryId("");
    setCoveredEntryIds(new Set());
    setCompetencies([]);
    setCompetencyId("");
    setSelectedCriteriaIds([]);
    setTitle("");
    setExtraInstructions("");
    setJobStatus(null);
    myAssignedSubjectsApi
      .getAll(selectedTermId ?? undefined)
      .then((res) => setSubjects(res.data.data))
      .catch(() => showToast("Failed to load your assigned subjects", "error"));
  }, [isOpen, selectedTermId, initialSubjectId]);

  const selectedSubject = subjects.find((s) => s.subject_id === subjectId);

  useEffect(() => {
    setEntries([]);
    setEntriesLoaded(false);
    setEntryId("");
    setCoveredEntryIds(new Set());
    if (!subjectId || !classGroupId || !selectedTermId) return;

    let cancelled = false;

    Promise.all([
      schemeOfWorkApi.getEntries(Number(subjectId), Number(classGroupId), selectedTermId),
      // Existing notes for this exact subject/class/term, so weeks already covered can be
      // taken off the "create new" list instead of inviting a duplicate note per week.
      lessonNotesApi.list({
        subject_id: Number(subjectId),
        class_group_id: Number(classGroupId),
        academic_term_id: selectedTermId,
      }),
    ])
      .then(([entriesRes, notesRes]: [any, any]) => {
        if (cancelled) return;
        // GET /scheme-of-work/entries returns a bare `[]` when no SchemeOfWork row
        // exists yet for this subject/class/term, but `{ scheme, entries: [...] }`
        // once one does (even with zero entries) — handle both shapes explicitly
        // rather than assuming, which previously crashed the modal on the latter.
        const payload = entriesRes.data?.data;
        const list: SchemeEntry[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.entries)
            ? payload.entries
            : [];
        // Defensive sequential ordering by the actual week number, regardless of how
        // the API happened to sort them (it sorts by start_date, which only holds if
        // every entry's date was entered correctly).
        const sorted = [...list].sort((a, b) => weekNumberOf(a.week_number) - weekNumberOf(b.week_number));
        setEntries(sorted);

        const covered = new Set<number>(
          (notesRes.data.data || [])
            .map((n: { scheme_entry_id: number | null }) => n.scheme_entry_id)
            .filter((id: number | null): id is number => id != null),
        );
        setCoveredEntryIds(covered);

        // Guide the teacher along the natural weekly sequence: default to the next
        // week that doesn't have a note yet, rather than leaving them to scan for it.
        const nextUncovered = sorted.find((e) => !covered.has(e.entry_id));
        if (nextUncovered) {
          setEntryId(nextUncovered.entry_id);
          setTitle((prev) => prev || nextUncovered.topic);
        }
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setEntriesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId, classGroupId, selectedTermId]);

  // Fallback grounding source: when this subject/class/term has no Scheme of Work
  // entries yet, let the teacher pick straight from the Curriculum instead.
  useEffect(() => {
    setCompetencies([]);
    setCompetencyId("");
    setSelectedCriteriaIds([]);
    if (!subjectId || !classGroupId || !entriesLoaded || entries.length > 0) return;
    competenciesApi
      .getAll(Number(subjectId))
      .then((res) => setCompetencies(res.data.data))
      .catch(() => setCompetencies([]));
  }, [subjectId, classGroupId, entriesLoaded, entries.length]);

  const selectedEntry = entries.find((e) => e.entry_id === entryId);
  const selectedCompetency = competencies.find((c) => c.competency_id === competencyId);
  const showCurriculumFallback = !!classGroupId && entriesLoaded && entries.length === 0;

  const createBlank = async () => {
    if (!subjectId || !title.trim()) {
      showToast("Pick a subject and give the note a title", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await lessonNotesApi.create({
        subject_id: Number(subjectId),
        class_group_id: classGroupId ? Number(classGroupId) : undefined,
        scheme_entry_id: entryId ? Number(entryId) : undefined,
        academic_term_id: selectedTermId ?? undefined,
        title: title.trim(),
      });
      onClose();
      navigate(`/lesson-notes/${res.data.data.note_id}`);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to create note", "error");
    } finally {
      setCreating(false);
    }
  };

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await lessonNotesApi.getAIGenerateStatus(jobId);
        const status = res.data.data;
        setJobStatus(status);
        if (status.status === "done") {
          clearInterval(interval);
          showToast("Lesson note generated and saved as a draft — review it, then publish when ready.", "success");
          setTimeout(() => {
            onClose();
            navigate(`/lesson-notes/${status.noteId}`);
          }, 900);
        } else if (status.status === "error") {
          clearInterval(interval);
          showToast(status.error || "AI generation failed", "error");
          setCreating(false);
        }
      } catch {
        clearInterval(interval);
        setCreating(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const retryAfterError = () => {
    setJobStatus(null);
    setCreating(false);
  };

  const generateWithAI = async () => {
    if (!entryId && !competencyId) {
      showToast(
        showCurriculumFallback
          ? "Pick a Curriculum element to generate from"
          : "Pick a Scheme of Work topic to generate from",
        "error",
      );
      return;
    }
    setCreating(true);
    try {
      const res = await lessonNotesApi.startAIGenerate({
        ...(entryId
          ? { entry_id: Number(entryId) }
          : { competency_id: Number(competencyId), criteria_ids: selectedCriteriaIds }),
        class_group_id: classGroupId ? Number(classGroupId) : undefined,
        academic_term_id: selectedTermId ?? undefined,
        extra_instructions: extraInstructions.trim() || undefined,
      });
      setJobStatus({ status: "loading", stepIndex: 1, totalSteps: 4, message: "Loading curriculum context..." });
      pollJob(res.data.data.jobId);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to start AI generation", "error");
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Lesson Note" size="lg">
      {jobStatus ? (
        jobStatus.status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Generation failed</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                {jobStatus.error || "Something went wrong while generating this note."}
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                Close
              </button>
              <button
                onClick={retryAfterError}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          </div>
        ) : jobStatus.status === "done" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-gray-800 dark:text-gray-100">Lesson note generated!</p>
            <p className="text-xs text-gray-400">Saved as a draft — opening it now...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-800 dark:text-gray-100">{jobStatus.message}</p>
              <p className="text-xs text-gray-400 mt-1">Step {jobStatus.stepIndex} of {jobStatus.totalSteps}</p>
            </div>
            <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${(jobStatus.stepIndex / jobStatus.totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value ? Number(e.target.value) : "");
                setClassGroupId("");
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            >
              <option value="">Select a subject you teach...</option>
              {subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name}
                </option>
              ))}
            </select>
          </div>

          {selectedSubject && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Class</label>
              <select
                value={classGroupId}
                onChange={(e) => setClassGroupId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              >
                <option value="">Select a class...</option>
                {selectedSubject.grades.map((g) => (
                  <option key={g.class_group_id} value={g.class_group_id}>
                    {g.class_group_name} ({g.grade_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!!classGroupId && !showCurriculumFallback && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">
                Scheme of Work topic <span className="text-gray-400">(optional — grounds AI generation in this week's curriculum)</span>
              </label>
              <select
                value={entryId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : "";
                  setEntryId(id);
                  const entry = entries.find((en) => en.entry_id === id);
                  if (entry && !title) setTitle(entry.topic);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              >
                <option value="">No specific topic (blank note)</option>
                {entries.map((e) => (
                  <option key={e.entry_id} value={e.entry_id} disabled={coveredEntryIds.has(e.entry_id)}>
                    {e.week_number}: {e.topic}
                    {coveredEntryIds.has(e.entry_id) ? " — note already exists" : ""}
                  </option>
                ))}
              </select>
              {selectedEntry && (
                <p className="text-xs text-gray-400 mt-1.5">{selectedEntry.objective}</p>
              )}
              {coveredEntryIds.size > 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  {coveredEntryIds.size} week{coveredEntryIds.size === 1 ? "" : "s"} already {coveredEntryIds.size === 1 ? "has" : "have"} a note — manage them from the notes list.
                </p>
              )}
            </div>
          )}

          {showCurriculumFallback && (
            <div>
              <label className="flex text-xs font-medium text-gray-500 dark:text-gray-300 mb-1 items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                Curriculum element
                <span className="text-gray-400 font-normal">
                  (no Scheme of Work found for this class/term — grounds AI generation in the Curriculum instead)
                </span>
              </label>
              <select
                value={competencyId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : "";
                  setCompetencyId(id);
                  setSelectedCriteriaIds([]);
                  const competency = competencies.find((c) => c.competency_id === id);
                  if (competency && !title) setTitle(competency.title);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              >
                <option value="">No specific element (blank note)</option>
                {competencies.map((c) => (
                  <option key={c.competency_id} value={c.competency_id}>
                    {c.element_number}. {c.title}
                  </option>
                ))}
              </select>

              {selectedCompetency && (
                <div className="mt-2.5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1.5">
                    Performance criteria to prepare notes for
                    <span className="text-gray-400 font-normal"> (leave unchecked to cover all of them)</span>
                  </p>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/50 divide-y divide-gray-100 dark:divide-gray-700/40">
                    {selectedCompetency.criteria.map((c) => (
                      <label
                        key={c.criteria_id}
                        className="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedCriteriaIds.includes(c.criteria_id)}
                          onChange={(e) =>
                            setSelectedCriteriaIds((prev) =>
                              e.target.checked
                                ? [...prev, c.criteria_id]
                                : prev.filter((id) => id !== c.criteria_id),
                            )
                          }
                        />
                        <span className="text-gray-600 dark:text-gray-300">
                          <span className="font-medium text-gray-500 dark:text-gray-400">{c.criteria_number}:</span>{" "}
                          {c.description}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Graphic Design Basics"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">
              Additional instructions for the AI{" "}
              <span className="text-gray-400">(optional — only used by "Generate with AI")</span>
            </label>
            <textarea
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value.slice(0, 2000))}
              placeholder='e.g. "Include a short section on local Rwandan examples", "Keep it to shorter, simpler sentences for a P5 class", "Add a table comparing the two methods"'
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              These are extra constraints for the AI — they can't override the selected topic or its curriculum criteria.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={createBlank}
              disabled={creating || !subjectId || !title.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" /> Start blank &amp; write myself
            </button>
            <button
              onClick={generateWithAI}
              disabled={creating || !(entryId || competencyId)}
              title={
                !(entryId || competencyId)
                  ? showCurriculumFallback
                    ? "Pick a Curriculum element first"
                    : "Pick a Scheme of Work topic first"
                  : undefined
              }
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> Generate with AI
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default NewLessonNoteModal;
