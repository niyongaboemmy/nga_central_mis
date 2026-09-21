import { db } from "../db";
import { eq, and, or, gt, isNull, asc, desc, inArray, sql } from "drizzle-orm";
import {
  LessonNote,
  LessonNoteVersion,
  LessonNoteShare,
  LessonNoteImage,
  LessonNotePromptPreset,
  SchemeOfWorkEntry,
  CompetencyPerformanceCriteria,
  SchemeEntryCriteria,
  Subject,
  ClassGroup,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  StudentClassGroup,
  UserProfile,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError, AuthorizationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeNoteHtml } from "../utils/sanitizeNoteHtml";
import storageService from "../utils/fileServer";
import logger from "../utils/logger";
import { renderLessonNotePdf } from "../services/pdfExport";
import { extractLessonNotePdf, looksLikePdf, sanitizeShortText } from "../utils/lessonNotePdf";

// ======================
// STATUS MANAGEMENT
// ======================
// Every note is created DRAFT (both manual "Start blank" and AI generation) — publishing
// is always a separate, explicit teacher action. The one rule enforced here: a note can't
// move into PUBLISHED with no real content, since PUBLISHED is what makes a note shareable
// and visible to students — an empty published note would just be a blank page for them.
export const NEW_NOTE_STATUS = "DRAFT" as const;

export const hasVisibleContent = (html: string | null | undefined): boolean =>
  !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

// A PDF-backed note is publishable as soon as its file is stored, even when text
// extraction found nothing (a scanned PDF) — students read the PDF itself, and the
// extracted text only feeds the AI tutor / excerpts, which degrade gracefully.
export const isPublishable = (note: {
  source: string | null;
  file_path?: string | null;
  content_html?: string | null;
}): boolean => (isPdfNote(note) ? !!note.file_path : hasVisibleContent(note.content_html));

// A stored file is the authoritative signal that a note is PDF-backed. `source` is
// checked too, but a note whose PDF is in storage must never fall back to the rich
// editor (which would show the extracted text as if it were editable content).
export const isPdfNote = (note: { source: string | null; file_path?: string | null }) =>
  note.source === "PDF_UPLOAD" || !!note.file_path;

const safePdfFilename = (title: string) =>
  `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "lesson-note"}.pdf`;

// ======================
// ACCESS HELPERS
// ======================

async function assertTeacherOwnsSubject(userId: number, subjectId: number) {
  const [assignment] = await db
    .select({ subject_id: TeacherSubjectAssignment.subject_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
      ),
    )
    .limit(1);
  if (!assignment) {
    throw new AuthorizationError("You are not assigned to teach this subject");
  }
}

// Lesson notes are a teacher's own authoring workspace — deliberately owner-only,
// not "anyone who can manage this subject's curriculum" (MANAGE_CURRICULUM is held
// broadly, by every TEACHER in this platform's role data, so using it as an
// ownership override here would let any teacher edit/delete/share another
// teacher's private notes).
async function loadOwnedNote(noteId: number, userId: number) {
  const [note] = await db
    .select()
    .from(LessonNote)
    .where(eq(LessonNote.note_id, noteId))
    .limit(1);
  if (!note) throw new NotFoundError("Lesson note not found");
  if (note.user_id !== userId) {
    throw new AuthorizationError("You do not have access to this lesson note");
  }
  return note;
}

// ======================
// CRUD
// ======================

export const listMyLessonNotes = asyncHandler(async (req: any, res: any) => {
  const { subject_id, class_group_id, academic_term_id, status } = req.query;

  const conditions = [eq(LessonNote.user_id, req.user.userId)];
  if (subject_id) conditions.push(eq(LessonNote.subject_id, parseInt(subject_id, 10)));
  if (class_group_id) conditions.push(eq(LessonNote.class_group_id, parseInt(class_group_id, 10)));
  if (academic_term_id) conditions.push(eq(LessonNote.academic_term_id, parseInt(academic_term_id, 10)));
  if (status) conditions.push(eq(LessonNote.status, status));

  const notes = await db
    .select({
      note_id: LessonNote.note_id,
      subject_id: LessonNote.subject_id,
      subject_name: Subject.name,
      class_group_id: LessonNote.class_group_id,
      class_group_name: ClassGroup.name,
      scheme_entry_id: LessonNote.scheme_entry_id,
      title: LessonNote.title,
      status: LessonNote.status,
      source: LessonNote.source,
      file_name: LessonNote.file_name,
      page_count: LessonNote.page_count,
      created_at: LessonNote.created_at,
      updated_at: LessonNote.updated_at,
      // Publishing a note does NOT make it visible to students -- it only makes it
      // shareable. Without this count the list gives a teacher no way to tell a note
      // students can actually read from one that is published but never shared, which
      // is exactly how notes ended up sitting published-but-invisible.
      share_count: sql<number>`(
        SELECT COUNT(*) FROM ${LessonNoteShare}
        WHERE ${LessonNoteShare.note_id} = ${LessonNote.note_id}
          AND (${LessonNoteShare.expires_at} IS NULL OR ${LessonNoteShare.expires_at} > NOW())
      )`,
    })
    .from(LessonNote)
    .innerJoin(Subject, eq(LessonNote.subject_id, Subject.subject_id))
    .leftJoin(ClassGroup, eq(LessonNote.class_group_id, ClassGroup.class_group_id))
    .leftJoin(SchemeOfWorkEntry, eq(LessonNote.scheme_entry_id, SchemeOfWorkEntry.entry_id))
    .where(and(...conditions))
    // Curriculum order: group by subject, then walk the Scheme of Work week-by-week
    // (start_date) rather than by whenever the note was last edited — a note with no
    // scheme entry (e.g. generated straight from the Curriculum, or a blank note)
    // sorts after every dated week, then alphabetically as a final tiebreaker.
    .orderBy(
      asc(Subject.name),
      sql`${SchemeOfWorkEntry.start_date} IS NULL`,
      asc(SchemeOfWorkEntry.start_date),
      asc(LessonNote.title),
    );

  successResponse(res, "Lesson notes", notes);
});

export const createLessonNote = asyncHandler(async (req: any, res: any) => {
  const { subject_id, class_group_id, scheme_entry_id, academic_term_id, title } = req.body;
  if (!subject_id || !title) {
    throw new ValidationError("subject_id and title are required");
  }

  await assertTeacherOwnsSubject(req.user.userId, parseInt(subject_id, 10));

  const [result] = await db.insert(LessonNote).values({
    user_id: req.user.userId,
    subject_id: parseInt(subject_id, 10),
    class_group_id: class_group_id ? parseInt(class_group_id, 10) : null,
    scheme_entry_id: scheme_entry_id ? parseInt(scheme_entry_id, 10) : null,
    academic_term_id: academic_term_id ? parseInt(academic_term_id, 10) : null,
    title,
    status: NEW_NOTE_STATUS,
    source: "MANUAL",
  });

  const noteId = (result as any).insertId as number;

  await recordActivity(
    req.user.userId,
    "LESSON_NOTE_CREATE",
    `Created lesson note "${title}"`,
    "LessonNote",
    noteId,
  );

  successResponse(res, "Lesson note created", { note_id: noteId }, 201);
});

// ======================
// PDF-BACKED NOTES — the third way to create a note: upload a PDF prepared elsewhere.
// The PDF is the note (read-only in the editor; students read the file itself), but it
// goes through the exact same DRAFT -> PUBLISHED -> share lifecycle. Text is extracted on
// upload into content_html so the student AI tutor and the library excerpt keep working
// without any special-casing downstream — it is never shown as the note itself.
// ======================

const pdfStoragePath = (noteId: number) => `/lesson-notes/${noteId}/source-${Date.now()}.pdf`;

async function readUploadedPdf(file: Express.Multer.File | undefined) {
  if (!file) throw new ValidationError("A PDF file is required");
  if (!looksLikePdf(file.buffer)) {
    throw new ValidationError("That file doesn't look like a PDF. Only PDF files can be uploaded as a lesson note.");
  }
  try {
    const extracted = await extractLessonNotePdf(file.buffer);
    if (extracted.pageCount < 1) throw new Error("no pages");
    return extracted;
  } catch (err) {
    logger.warn(`Lesson note PDF could not be parsed: ${err}`);
    throw new ValidationError("This PDF couldn't be read. It may be corrupted or password-protected.");
  }
}

export const createLessonNoteFromPdf = asyncHandler(async (req: any, res: any) => {
  const { subject_id, class_group_id, scheme_entry_id, academic_term_id } = req.body;
  const title = sanitizeShortText(
    (req.body.title || "").trim() || (req.file?.originalname || "").replace(/\.pdf$/i, ""),
    255,
  );
  if (!subject_id || !title) {
    throw new ValidationError("subject_id and title are required");
  }

  await assertTeacherOwnsSubject(req.user.userId, parseInt(subject_id, 10));
  const extracted = await readUploadedPdf(req.file);

  const [result] = await db.insert(LessonNote).values({
    user_id: req.user.userId,
    subject_id: parseInt(subject_id, 10),
    class_group_id: class_group_id ? parseInt(class_group_id, 10) : null,
    scheme_entry_id: scheme_entry_id ? parseInt(scheme_entry_id, 10) : null,
    academic_term_id: academic_term_id ? parseInt(academic_term_id, 10) : null,
    title,
    content_html: extracted.contentHtml,
    content_json: null,
    status: NEW_NOTE_STATUS,
    source: "PDF_UPLOAD",
    file_name: sanitizeShortText(req.file.originalname, 255) || "lesson-note.pdf",
    file_size: req.file.size,
    page_count: extracted.pageCount,
  });
  const noteId = (result as any).insertId as number;

  // The row is inserted first so the storage path can be keyed by note id (same layout
  // as embedded images). If the upload itself fails we roll the row back rather than
  // leave a PDF note that has no PDF.
  const remotePath = pdfStoragePath(noteId);
  try {
    await storageService.uploadFile(req.file.buffer, remotePath);
  } catch (err) {
    await db.delete(LessonNote).where(eq(LessonNote.note_id, noteId));
    logger.error(`Lesson note PDF upload failed for note ${noteId}: ${err}`);
    throw new ValidationError("The PDF could not be stored right now. Please try again.");
  }
  await db.update(LessonNote).set({ file_path: remotePath }).where(eq(LessonNote.note_id, noteId));

  await recordActivity(
    req.user.userId,
    "LESSON_NOTE_CREATE",
    `Uploaded lesson note "${title}" (PDF, ${extracted.pageCount} page${extracted.pageCount === 1 ? "" : "s"})`,
    "LessonNote",
    noteId,
  );

  successResponse(
    res,
    "Lesson note created from PDF",
    { note_id: noteId, page_count: extracted.pageCount, is_textless: extracted.isTextless },
    201,
  );
});

// Swap the PDF behind an existing PDF note (a corrected version, say) without losing its
// status, shares or place in the notes list.
export const replaceLessonNotePdf = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);
  if (!isPdfNote(note)) {
    throw new ValidationError("Only a note that was created from a PDF can have its PDF replaced");
  }
  const extracted = await readUploadedPdf(req.file);

  const remotePath = pdfStoragePath(noteId);
  await storageService.uploadFile(req.file.buffer, remotePath);

  await db
    .update(LessonNote)
    .set({
      file_path: remotePath,
      file_name: sanitizeShortText(req.file.originalname, 255) || "lesson-note.pdf",
      file_size: req.file.size,
      page_count: extracted.pageCount,
      content_html: extracted.contentHtml,
      updated_at: new Date(),
    })
    .where(eq(LessonNote.note_id, noteId));

  if (note.file_path) {
    storageService
      .deleteFile(note.file_path)
      .catch((err) => logger.warn(`Could not delete replaced PDF ${note.file_path}: ${err}`));
  }

  await recordActivity(
    req.user.userId,
    "LESSON_NOTE_UPDATE",
    `Replaced the PDF of lesson note "${note.title}"`,
    "LessonNote",
    noteId,
  );

  successResponse(res, "PDF replaced", { page_count: extracted.pageCount, is_textless: extracted.isTextless });
});

// Serves the stored PDF to its owner, or to a student the note reaches (published +
// natural audience / share — the same gate as reading the note). Registered ahead of
// the teacher-only gate in the router for that reason. Inline, not attachment: the
// frontend viewers fetch it as a blob and render pages themselves.
export const streamLessonNotePdf = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const [note] = await db
    .select({
      user_id: LessonNote.user_id,
      title: LessonNote.title,
      status: LessonNote.status,
      source: LessonNote.source,
      file_path: LessonNote.file_path,
    })
    .from(LessonNote)
    .where(eq(LessonNote.note_id, noteId))
    .limit(1);
  if (!note || !note.file_path) throw new NotFoundError("PDF not found");

  const isOwner = note.user_id === req.user.userId;
  if (!isOwner) {
    const allowed = note.status === "PUBLISHED" && (await hasSharedAccessToNote(noteId, req.user.userId));
    if (!allowed) throw new AuthorizationError("This lesson note has not been shared with you");
  }

  const buffer = await storageService.downloadToBuffer(note.file_path);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safePdfFilename(note.title)}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buffer);
});

export const getLessonNote = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);

  let schemeContext: any = null;
  if (note.scheme_entry_id) {
    const [entry] = await db
      .select()
      .from(SchemeOfWorkEntry)
      .where(eq(SchemeOfWorkEntry.entry_id, note.scheme_entry_id))
      .limit(1);
    if (entry) {
      const criteria = await db
        .select({
          criteria_id: CompetencyPerformanceCriteria.criteria_id,
          criteria_number: CompetencyPerformanceCriteria.criteria_number,
          description: CompetencyPerformanceCriteria.description,
        })
        .from(SchemeEntryCriteria)
        .innerJoin(
          CompetencyPerformanceCriteria,
          eq(SchemeEntryCriteria.criteria_id, CompetencyPerformanceCriteria.criteria_id),
        )
        .where(eq(SchemeEntryCriteria.entry_id, note.scheme_entry_id));
      schemeContext = { entry, criteria };
    }
  }

  // The editor uses this to tell "published" apart from "students can actually read it" --
  // publishing alone shares nothing.
  const activeShares = await db
    .select({ share_id: LessonNoteShare.share_id })
    .from(LessonNoteShare)
    .where(
      and(
        eq(LessonNoteShare.note_id, noteId),
        or(isNull(LessonNoteShare.expires_at), gt(LessonNoteShare.expires_at, new Date())),
      ),
    );

  successResponse(res, "Lesson note", {
    ...note,
    scheme_context: schemeContext,
    share_count: activeShares.length,
  });
});

export const exportLessonNotePdf = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);

  // A PDF note *is* a PDF already — hand back the teacher's original, byte for byte,
  // rather than re-rendering the extracted text into a worse-looking copy.
  if (isPdfNote(note) && note.file_path) {
    const buffer = await storageService.downloadToBuffer(note.file_path);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safePdfFilename(note.title)}"`);
    res.send(buffer);
    return;
  }

  if (!hasVisibleContent(note.content_html)) {
    throw new ValidationError("Add some content before exporting this note.");
  }

  const [subject] = await db
    .select({ name: Subject.name })
    .from(Subject)
    .where(eq(Subject.subject_id, note.subject_id))
    .limit(1);

  let classGroupName: string | null = null;
  if (note.class_group_id) {
    const [group] = await db
      .select({ name: ClassGroup.name })
      .from(ClassGroup)
      .where(eq(ClassGroup.class_group_id, note.class_group_id))
      .limit(1);
    classGroupName = group?.name ?? null;
  }

  let weekLabel: string | null = null;
  if (note.scheme_entry_id) {
    const [entry] = await db
      .select({ week_number: SchemeOfWorkEntry.week_number, topic: SchemeOfWorkEntry.topic })
      .from(SchemeOfWorkEntry)
      .where(eq(SchemeOfWorkEntry.entry_id, note.scheme_entry_id))
      .limit(1);
    if (entry) weekLabel = `${entry.week_number}: ${entry.topic}`;
  }

  const [profile] = await db
    .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, req.user.userId))
    .limit(1);
  const teacherName = profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "";

  const pdf = await renderLessonNotePdf({
    title: note.title,
    subjectName: subject?.name || "",
    classGroupName,
    weekLabel,
    teacherName: teacherName || "Teacher",
    contentHtml: note.content_html || "",
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safePdfFilename(note.title)}"`);
  res.send(pdf);
});

export const updateLessonNote = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);

  const { title, content_json, content_html, status, snapshot_prompt } = req.body;

  // The PDF is the note: its body can only change by replacing the file (POST /:id/pdf).
  // Title and status stay editable so publishing/renaming work exactly like any note.
  if (isPdfNote(note) && (content_json !== undefined || content_html !== undefined || snapshot_prompt !== undefined)) {
    throw new ValidationError("This note was created from a PDF and is read-only — replace the PDF to change its content.");
  }

  if (snapshot_prompt && note.content_json) {
    await db.insert(LessonNoteVersion).values({
      note_id: noteId,
      content_json: note.content_json,
      created_by: "AI",
      prompt_text: snapshot_prompt,
    });
  }

  const updates: Record<string, any> = { updated_at: new Date() };
  if (title !== undefined) updates.title = title;
  if (content_json !== undefined) updates.content_json = content_json;
  if (content_html !== undefined) updates.content_html = sanitizeNoteHtml(content_html);
  if (status !== undefined) {
    if (!["DRAFT", "PUBLISHED"].includes(status)) {
      throw new ValidationError("status must be DRAFT or PUBLISHED");
    }
    if (status === "PUBLISHED") {
      // Use the html this same request is setting, if any, else what's already saved —
      // covers "type then immediately hit Publish" in one call as well as publishing a
      // note that already has content from an earlier save.
      const effectiveHtml = content_html !== undefined ? updates.content_html : note.content_html;
      if (!isPublishable({ ...note, content_html: effectiveHtml })) {
        throw new ValidationError("Add some content before publishing this note.");
      }
    }
    updates.status = status;
  }
  if (snapshot_prompt !== undefined && note.source === "MANUAL") {
    updates.source = "AI_ASSISTED";
  }

  await db.update(LessonNote).set(updates).where(eq(LessonNote.note_id, noteId));

  if (status === "PUBLISHED" && note.status !== "PUBLISHED") {
    await recordActivity(
      req.user.userId,
      "LESSON_NOTE_PUBLISH",
      `Published lesson note "${note.title}"`,
      "LessonNote",
      noteId,
    );
  }

  successResponse(res, "Lesson note updated");
});

export const deleteLessonNote = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);

  const images = await db
    .select({ file_path: LessonNoteImage.file_path })
    .from(LessonNoteImage)
    .where(eq(LessonNoteImage.note_id, noteId));

  await db.delete(LessonNote).where(eq(LessonNote.note_id, noteId));

  if (note.file_path) {
    try {
      await storageService.deleteFile(note.file_path);
    } catch (err) {
      logger.warn(`Could not delete storage file ${note.file_path}: ${err}`);
    }
  }

  for (const img of images) {
    try {
      await storageService.deleteFile(img.file_path);
    } catch (err) {
      logger.warn(`Could not delete storage file ${img.file_path}: ${err}`);
    }
  }

  await recordActivity(
    req.user.userId,
    "LESSON_NOTE_DELETE",
    `Deleted lesson note "${note.title}"`,
    "LessonNote",
    noteId,
  );

  successResponse(res, "Lesson note deleted");
});

// ======================
// IMAGES
// ======================

export const uploadLessonNoteImage = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  await loadOwnedNote(noteId, req.user.userId);

  if (!req.file) {
    throw new ValidationError("An image file is required");
  }
  if (!req.file.mimetype.startsWith("image/")) {
    throw new ValidationError("Only image files can be embedded in a lesson note");
  }

  const ext = req.file.originalname.split(".").pop() || "png";
  const remoteFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const remoteFilePath = `/lesson-notes/${noteId}/${remoteFileName}`;

  await storageService.uploadFile(req.file.buffer, remoteFilePath);

  const [result] = await db.insert(LessonNoteImage).values({
    note_id: noteId,
    user_id: req.user.userId,
    file_path: remoteFilePath,
    mime_type: req.file.mimetype,
    original_name: req.file.originalname,
  });

  const imageId = (result as any).insertId as number;

  successResponse(
    res,
    "Image uploaded",
    { image_id: imageId, url: `/lesson-notes/images/${imageId}/raw` },
    201,
  );
});

export const streamLessonNoteImage = asyncHandler(async (req: any, res: any) => {
  const imageId = parseInt(req.params.imageId, 10);

  const [image] = await db
    .select()
    .from(LessonNoteImage)
    .where(eq(LessonNoteImage.image_id, imageId))
    .limit(1);
  if (!image) throw new NotFoundError("Image not found");

  await loadOwnedNote(image.note_id, req.user.userId).catch(async (err) => {
    // Fall back to share-based access for students viewing a shared note.
    const hasShareAccess = await hasSharedAccessToNote(image.note_id, req.user.userId);
    if (!hasShareAccess) throw err;
  });

  const buffer = await storageService.downloadToBuffer(image.file_path);
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(buffer);
});

// ======================
// VERSIONS
// ======================

export const listLessonNoteVersions = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  await loadOwnedNote(noteId, req.user.userId);

  const versions = await db
    .select({
      version_id: LessonNoteVersion.version_id,
      created_by: LessonNoteVersion.created_by,
      prompt_text: LessonNoteVersion.prompt_text,
      created_at: LessonNoteVersion.created_at,
    })
    .from(LessonNoteVersion)
    .where(eq(LessonNoteVersion.note_id, noteId))
    .orderBy(desc(LessonNoteVersion.created_at));

  successResponse(res, "Lesson note versions", versions);
});

export const restoreLessonNoteVersion = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const versionId = parseInt(req.params.versionId, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);
  if (isPdfNote(note)) {
    throw new ValidationError("A note created from a PDF has no editable versions to restore");
  }

  const [version] = await db
    .select()
    .from(LessonNoteVersion)
    .where(and(eq(LessonNoteVersion.version_id, versionId), eq(LessonNoteVersion.note_id, noteId)))
    .limit(1);
  if (!version) throw new NotFoundError("Version not found");

  // Snapshot current state before overwriting, so a restore is itself reversible.
  if (note.content_json) {
    await db.insert(LessonNoteVersion).values({
      note_id: noteId,
      content_json: note.content_json,
      created_by: "USER",
      prompt_text: `Replaced by restoring version #${versionId}`,
    });
  }

  await db
    .update(LessonNote)
    .set({ content_json: version.content_json, updated_at: new Date() })
    .where(eq(LessonNote.note_id, noteId));

  successResponse(res, "Version restored", { content_json: version.content_json });
});

// ======================
// SHARING
// ======================

export const shareLessonNote = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const note = await loadOwnedNote(noteId, req.user.userId);

  const { filter_type, filter_ids, expires_at } = req.body;
  if (!["class_group", "subject_enrolled", "specific_students"].includes(filter_type)) {
    throw new ValidationError(
      "filter_type must be class_group, subject_enrolled, or specific_students",
    );
  }
  if (!Array.isArray(filter_ids) || filter_ids.length === 0) {
    throw new ValidationError("filter_ids must be a non-empty array");
  }
  if (note.status !== "PUBLISHED") {
    throw new ValidationError("Publish the note before sharing it with students");
  }
  let expiresAtDate: Date | null = null;
  if (expires_at) {
    expiresAtDate = new Date(expires_at);
    if (isNaN(expiresAtDate.getTime())) {
      throw new ValidationError("expires_at must be a valid date");
    }
  }

  const [result] = await db.insert(LessonNoteShare).values({
    note_id: noteId,
    shared_by: req.user.userId,
    filter_type,
    filter_ids,
    expires_at: expiresAtDate,
  });

  await recordActivity(
    req.user.userId,
    "LESSON_NOTE_SHARE",
    `Shared lesson note "${note.title}" (${filter_type})`,
    "LessonNote",
    noteId,
  );

  successResponse(res, "Lesson note shared", { share_id: (result as any).insertId }, 201);
});

export const listLessonNoteShares = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  await loadOwnedNote(noteId, req.user.userId);

  const shares = await db
    .select()
    .from(LessonNoteShare)
    .where(eq(LessonNoteShare.note_id, noteId))
    .orderBy(desc(LessonNoteShare.created_at));

  successResponse(res, "Lesson note shares", shares);
});

export const revokeLessonNoteShare = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const shareId = parseInt(req.params.shareId, 10);
  await loadOwnedNote(noteId, req.user.userId);

  await db
    .delete(LessonNoteShare)
    .where(and(eq(LessonNoteShare.share_id, shareId), eq(LessonNoteShare.note_id, noteId)));

  successResponse(res, "Share revoked");
});

/**
 * A PUBLISHED note is readable by its natural audience -- the students in the class group it was
 * written for, and everyone enrolled in its subject -- without any further action by the teacher.
 * Publishing used to only make a note *shareable*, so notes sat published-but-invisible while the
 * class saw an empty "Notes Shared With Me" and nothing in the UI explained the missing step.
 *
 * LessonNoteShare rows still widen that audience (hand-picked students, a second class group, an
 * expiry window) -- they are additive on top of the default, never a gate in front of it.
 */
async function hasNaturalAudienceAccess(
  note: { subject_id: number; class_group_id: number | null },
  studentUserId: number,
): Promise<boolean> {
  if (note.class_group_id) {
    const [membership] = await db
      .select({ user_id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.user_id, studentUserId),
          eq(StudentClassGroup.class_group_id, note.class_group_id),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (membership) return true;
  }

  const [enrollment] = await db
    .select({ user_id: StudentSubjectEnrollment.user_id })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.user_id, studentUserId),
        eq(StudentSubjectEnrollment.subject_id, note.subject_id),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return !!enrollment;
}

export async function hasSharedAccessToNote(noteId: number, studentUserId: number): Promise<boolean> {
  const [note] = await db
    .select({ subject_id: LessonNote.subject_id, class_group_id: LessonNote.class_group_id })
    .from(LessonNote)
    .where(eq(LessonNote.note_id, noteId))
    .limit(1);
  if (!note) return false;

  if (await hasNaturalAudienceAccess(note, studentUserId)) return true;

  const shares = await db
    .select()
    .from(LessonNoteShare)
    .where(eq(LessonNoteShare.note_id, noteId));

  for (const share of shares) {
    if (share.expires_at && new Date(share.expires_at) < new Date()) continue;
    const ids = (share.filter_ids as number[]) || [];

    if (share.filter_type === "specific_students" && ids.includes(studentUserId)) {
      return true;
    }
    if (share.filter_type === "class_group") {
      const [membership] = await db
        .select({ user_id: StudentClassGroup.user_id })
        .from(StudentClassGroup)
        .where(
          and(
            eq(StudentClassGroup.user_id, studentUserId),
            eq(StudentClassGroup.status, "ACTIVE"),
            inArray(StudentClassGroup.class_group_id, ids),
          ),
        )
        .limit(1);
      if (membership) return true;
    }
    if (share.filter_type === "subject_enrolled") {
      const [enrollment] = await db
        .select({ user_id: StudentSubjectEnrollment.user_id })
        .from(StudentSubjectEnrollment)
        .where(
          and(
            eq(StudentSubjectEnrollment.user_id, studentUserId),
            eq(StudentSubjectEnrollment.subject_id, note.subject_id),
            eq(StudentSubjectEnrollment.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (enrollment) return true;
    }
  }
  return false;
}

// Used by listSharedWithMe — resolves which published
// notes this student can read: every note written for a class group they're in or a subject
// they're enrolled in (publication alone grants that — see hasNaturalAudienceAccess), plus
// anything a teacher additionally shared with them through the three share filters. Deduped
// by note, since a note can qualify several ways at once, with teacher names attached.
async function resolveVisibleSharedNotes(studentId: number) {
  const [classGroups, enrollments] = await Promise.all([
    db
      .select({ class_group_id: StudentClassGroup.class_group_id })
      .from(StudentClassGroup)
      .where(and(eq(StudentClassGroup.user_id, studentId), eq(StudentClassGroup.status, "ACTIVE"))),
    db
      .select({ subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      ),
  ]);
  const classGroupIds = classGroups.map((c) => c.class_group_id);
  const subjectIds = enrollments.map((e) => e.subject_id);

  // Every published note, with the shares (if any) that widen its audience. A left join, not
  // an inner one: a note with no share row at all is still readable by its own class/subject.
  const rows = await db
    .select({
      note_id: LessonNote.note_id,
      note_title: LessonNote.title,
      note_subject_id: LessonNote.subject_id,
      note_class_group_id: LessonNote.class_group_id,
      subject_name: Subject.name,
      content_html: LessonNote.content_html,
      source: LessonNote.source,
      page_count: LessonNote.page_count,
      updated_at: LessonNote.updated_at,
      teacher_id: LessonNote.user_id,
      scheme_start_date: SchemeOfWorkEntry.start_date,
      filter_type: LessonNoteShare.filter_type,
      filter_ids: LessonNoteShare.filter_ids,
      expires_at: LessonNoteShare.expires_at,
    })
    .from(LessonNote)
    .innerJoin(Subject, eq(LessonNote.subject_id, Subject.subject_id))
    .leftJoin(LessonNoteShare, eq(LessonNoteShare.note_id, LessonNote.note_id))
    .leftJoin(SchemeOfWorkEntry, eq(LessonNote.scheme_entry_id, SchemeOfWorkEntry.entry_id))
    .where(eq(LessonNote.status, "PUBLISHED"));

  const now = new Date();
  const visible = rows.filter((r) => {
    // The note's own audience: the class it was written for, or its enrolled students.
    if (r.note_class_group_id && classGroupIds.includes(r.note_class_group_id)) return true;
    if (subjectIds.includes(r.note_subject_id)) return true;

    // Otherwise this row only counts if it carries a share that reaches this student.
    if (!r.filter_type) return false;
    if (r.expires_at && new Date(r.expires_at) < now) return false;
    const ids = (r.filter_ids as number[]) || [];
    if (r.filter_type === "specific_students") return ids.includes(studentId);
    if (r.filter_type === "class_group") return ids.some((id) => classGroupIds.includes(id));
    if (r.filter_type === "subject_enrolled") return subjectIds.includes(r.note_subject_id);
    return false;
  });

  const byNote = new Map<number, (typeof visible)[number]>();
  for (const v of visible) byNote.set(v.note_id, v);

  const teacherIds = [...new Set([...byNote.values()].map((v) => v.teacher_id))];
  const teachers = teacherIds.length
    ? await db
        .select({
          user_id: UserProfile.user_id,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(UserProfile)
        .where(inArray(UserProfile.user_id, teacherIds))
    : [];
  const teacherName = new Map(teachers.map((t) => [t.user_id, `${t.first_name || ""} ${t.last_name || ""}`.trim()]));

  return [...byNote.values()]
    .map((v) => ({
      note_id: v.note_id,
      title: v.note_title,
      subject_name: v.subject_name,
      content_html: v.content_html,
      source: v.source,
      page_count: v.page_count,
      teacher_name: teacherName.get(v.teacher_id) || "",
      updated_at: v.updated_at,
      scheme_start_date: v.scheme_start_date,
    }))
    // Same curriculum ordering as the teacher's own notes list: subject, then Scheme
    // of Work week order (notes with no scheme entry sort after every dated week).
    .sort((a, b) => {
      const subjectCmp = a.subject_name.localeCompare(b.subject_name);
      if (subjectCmp !== 0) return subjectCmp;
      if (!a.scheme_start_date && !b.scheme_start_date) return a.title.localeCompare(b.title);
      if (!a.scheme_start_date) return 1;
      if (!b.scheme_start_date) return -1;
      const dateCmp = new Date(a.scheme_start_date).getTime() - new Date(b.scheme_start_date).getTime();
      return dateCmp !== 0 ? dateCmp : a.title.localeCompare(b.title);
    })
    .map(({ scheme_start_date, ...rest }) => rest);
}

// The reader's library cards show a preview line and a "x min read" estimate. Both are
// derived from content_html, which resolveVisibleSharedNotes already has in memory — doing
// it here avoids shipping every note's full body to the client just to compute them.
const PLAIN_TEXT_EXCERPT_LENGTH = 220;
const WORDS_PER_MINUTE = 200;

const htmlToPlainText = (html: string | null): string =>
  (html || "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

export const listSharedWithMe = asyncHandler(async (req: any, res: any) => {
  const notes = await resolveVisibleSharedNotes(req.user.userId);
  successResponse(
    res,
    "Notes shared with me",
    notes.map(({ content_html, ...rest }) => {
      const text = htmlToPlainText(content_html);
      const wordCount = text ? text.split(" ").length : 0;
      return {
        ...rest,
        word_count: wordCount,
        reading_minutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
        excerpt:
          text.length > PLAIN_TEXT_EXCERPT_LENGTH
            ? `${text.slice(0, PLAIN_TEXT_EXCERPT_LENGTH).trimEnd()}...`
            : text,
      };
    }),
  );
});

export const getSharedLessonNote = asyncHandler(async (req: any, res: any) => {
  const noteId = parseInt(req.params.id, 10);
  const allowed = await hasSharedAccessToNote(noteId, req.user.userId);
  if (!allowed) {
    throw new AuthorizationError("This lesson note has not been shared with you");
  }

  const [note] = await db
    .select({
      note_id: LessonNote.note_id,
      title: LessonNote.title,
      content_html: LessonNote.content_html,
      status: LessonNote.status,
      source: LessonNote.source,
      file_name: LessonNote.file_name,
      page_count: LessonNote.page_count,
      subject_id: LessonNote.subject_id,
      subject_name: Subject.name,
      updated_at: LessonNote.updated_at,
    })
    .from(LessonNote)
    .innerJoin(Subject, eq(LessonNote.subject_id, Subject.subject_id))
    .where(and(eq(LessonNote.note_id, noteId), eq(LessonNote.status, "PUBLISHED")))
    .limit(1);
  if (!note) throw new NotFoundError("Lesson note not found");

  successResponse(res, "Lesson note", note);
});

// ======================
// SAVED AI PROMPTS — a teacher's own reusable "Ask AI" instructions, shown as quick-pick
// chips next to the built-in prompt library in the editor.
// ======================

export const listPromptPresets = asyncHandler(async (req: any, res: any) => {
  const presets = await db
    .select()
    .from(LessonNotePromptPreset)
    .where(eq(LessonNotePromptPreset.user_id, req.user.userId))
    .orderBy(desc(LessonNotePromptPreset.created_at));
  successResponse(res, "Saved prompts", presets);
});

export const createPromptPreset = asyncHandler(async (req: any, res: any) => {
  const { label, prompt_text } = req.body;
  if (!label || !label.trim()) throw new ValidationError("label is required");
  if (!prompt_text || !prompt_text.trim()) throw new ValidationError("prompt_text is required");

  // A teacher scrolling through dozens of saved prompts defeats the point of a quick-pick
  // list — cap it generously but firmly rather than letting it grow unbounded.
  const count = await db
    .select({ preset_id: LessonNotePromptPreset.preset_id })
    .from(LessonNotePromptPreset)
    .where(eq(LessonNotePromptPreset.user_id, req.user.userId));
  if (count.length >= 30) {
    throw new ValidationError("You've saved the maximum of 30 prompts — delete one to save another.");
  }

  const [result] = await db.insert(LessonNotePromptPreset).values({
    user_id: req.user.userId,
    label: label.trim().slice(0, 80),
    prompt_text: prompt_text.trim(),
  });

  const [preset] = await db
    .select()
    .from(LessonNotePromptPreset)
    .where(eq(LessonNotePromptPreset.preset_id, (result as any).insertId))
    .limit(1);

  successResponse(res, "Prompt saved", preset, 201);
});

export const deletePromptPreset = asyncHandler(async (req: any, res: any) => {
  const presetId = parseInt(req.params.presetId, 10);
  const [preset] = await db
    .select()
    .from(LessonNotePromptPreset)
    .where(eq(LessonNotePromptPreset.preset_id, presetId))
    .limit(1);
  if (!preset) throw new NotFoundError("Saved prompt not found");
  if (preset.user_id !== req.user.userId) {
    throw new AuthorizationError("You do not have access to this saved prompt");
  }
  await db.delete(LessonNotePromptPreset).where(eq(LessonNotePromptPreset.preset_id, presetId));
  successResponse(res, "Prompt deleted", null);
});
