import React from "react";
import type { StudentSessionView } from "../../api/officeHours";

/** Placeholder until students can send an "I can't attend" notice (plan §10.1, phase 6). */
const AbsenceNoticeButton: React.FC<{ session: StudentSessionView; onSent?: () => void }> = () => null;

export default AbsenceNoticeButton;
