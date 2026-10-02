import React from "react";
import type { OfficeHoursConfig } from "../../../api/officeHours";

/** Placeholder until this tab lands (plan §11). */
const EscalationsTab: React.FC<{ termId: number | null; config?: OfficeHoursConfig }> = () => (
  <p className="text-sm text-slate-600 dark:text-slate-300">Coming soon.</p>
);

export default EscalationsTab;
