// Day names - starting with Monday for European week format
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Daily schedule - each row in the calendar (based on institution timetable)
export const SCHEDULE_SLOTS = [
  { start: "07:30", end: "09:00", label: "Self Study/Devotion", type: "break" },
  { start: "09:00", end: "09:50", label: "Course", type: "course" },
  { start: "09:50", end: "10:40", label: "Course", type: "course" },
  { start: "10:40", end: "11:00", label: "Break", type: "break" },
  { start: "11:00", end: "11:50", label: "Course", type: "course" },
  { start: "11:50", end: "12:40", label: "Course", type: "course" },
  { start: "12:40", end: "13:40", label: "Lunch", type: "lunch" },
  { start: "13:40", end: "14:30", label: "Course", type: "course" },
  { start: "14:30", end: "15:20", label: "Course", type: "course" },
  { start: "15:20", end: "15:40", label: "Break", type: "break" },
  { start: "15:40", end: "16:30", label: "Course", type: "course" },
  { start: "16:30", end: "17:20", label: "Course", type: "course" },
] as const;

// Helper function to convert time string (HH:MM) to minutes since midnight
export const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

// Helper to count how many schedule slots a course spans
export const countScheduleSlots = (
  courseStart: string,
  courseEnd: string,
): number => {
  let count = 0;
  for (const slot of SCHEDULE_SLOTS) {
    // Check if this schedule slot overlaps with the course
    const scheduleStart = timeToMinutes(slot.start);
    const scheduleEnd = timeToMinutes(slot.end);
    const courseStartMin = timeToMinutes(courseStart);
    const courseEndMin = timeToMinutes(courseEnd);

    // If scheduleSlot overlaps with course, count it
    if (scheduleStart < courseEndMin && scheduleEnd > courseStartMin) {
      count++;
    }
  }
  return count;
};

// Helper function to convert display day index to backend day of week
// Display: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
// Backend: 0=Sun, 1=Mon, ..., 6=Sat
export const displayDayToBackend = (displayDay: number): number => {
  return (displayDay + 1) % 7;
};

// Helper function to convert backend day of week to display day index
// Backend: 0=Sun, 1=Mon, ..., 6=Sat
// Display: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
export const backendDayToDisplay = (backendDay: number): number => {
  return (backendDay + 6) % 7;
};

// Format date as "MMM DD"
export const formatDateShort = (date: Date) => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

// Get the start of the current week (Monday) normalized to midnight
export const getStartOfWeek = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const dayOfWeek = result.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  result.setDate(result.getDate() - daysFromMonday);
  return result;
};

// Get dates for a 7-day week starting from Monday (index 0)
export const getWeekDates = (currentWeekStart: Date): Date[] => {
  const dates: Date[] = [];
  const start = new Date(currentWeekStart);
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Get date range string for the current week
export const getDateRangeString = (weekDates: Date[]): string => {
  if (weekDates.length === 0) return "";
  const start = weekDates[0];
  const end = weekDates[6];
  return `${formatDateShort(start)} - ${formatDateShort(end)}, ${end.getFullYear()}`;
};
