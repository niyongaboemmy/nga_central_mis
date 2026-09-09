import { useEffect, useState } from "react";
import { dateToMinutes } from "./calendarConstants";

/**
 * Minutes since midnight, re-rendering as the clock moves.
 *
 * Ticks aligned to the next whole minute rather than every `intervalMs`, so
 * the "now" marker moves when the displayed minute actually changes instead of
 * drifting a little further behind the wall clock on every tick.
 */
export const useCurrentTime = (): { minutes: number; date: Date } => {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const now = new Date();
      setDate(now);
      const msToNextMinute =
        60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timer = setTimeout(schedule, msToNextMinute);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  return { minutes: dateToMinutes(date), date };
};
