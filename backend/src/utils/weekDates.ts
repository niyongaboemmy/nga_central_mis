/** Same Mon-Fri, 7-day cadence algorithm used by the manual editor's date wizard (frontend SchemeManualEntry.applyWizard). */
export const computeWeekDates = (
  anchor: Date,
  count: number,
): { start_date: string; end_date: string }[] => {
  const cursor = new Date(anchor);
  const day = cursor.getDay();
  if (day !== 1) cursor.setDate(cursor.getDate() + ((1 - day + 7) % 7));

  const dates: { start_date: string; end_date: string }[] = [];
  for (let i = 0; i < count; i++) {
    const start_date = cursor.toISOString().split("T")[0];
    const end = new Date(cursor);
    end.setDate(end.getDate() + 4);
    const end_date = end.toISOString().split("T")[0];
    dates.push({ start_date, end_date });
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
};
