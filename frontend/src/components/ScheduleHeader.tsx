import React from "react";

const greetingFor = (hour: number) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

/** The heading on Schedule (`/dashboard`), shared by the student and teacher versions. */
export const ScheduleHeader: React.FC<{
  firstName?: string | null;
  termName?: string | null;
  yearName?: string | null;
  actions?: React.ReactNode;
}> = ({ firstName, termName, yearName, actions }) => {
  const now = new Date();
  const today = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const period = [termName, yearName].filter(Boolean).join(" · ");

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
          {greetingFor(now.getHours())}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-text-primary-light dark:text-text-primary-dark">Schedule</h1>
        <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
          <time dateTime={now.toISOString().slice(0, 10)}>{today}</time>
          {period && <span> · {period}</span>}
        </p>
      </div>
      {actions}
    </div>
  );
};

export default ScheduleHeader;
