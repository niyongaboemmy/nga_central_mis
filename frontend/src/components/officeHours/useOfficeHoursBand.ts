import { useEffect, useState } from "react";
import { officeHoursApi, type BandEntry } from "../../api/officeHours";
import { useUser } from "../../contexts/UserContext";
import { Permissions } from "../../constants/permissions";

const OFFICE_HOURS_PERMS: string[] = [
  Permissions.OFFICE_HOURS_MANAGE_OWN,
  Permissions.OFFICE_HOURS_MANAGE_ANY,
  Permissions.OFFICE_HOURS_VIEW,
  Permissions.OFFICE_HOURS_VIEW_SELF,
];

/** Whether the signed-in user takes part in office hours at all. */
export const useHasOfficeHours = () => {
  const { user } = useUser();
  return Boolean(user?.roles?.some((r) => r.permissions?.some((p) => OFFICE_HOURS_PERMS.includes(p.name))));
};

/**
 * Entries for the 16:20 band of a weekly grid: the viewer's own office hours,
 * or a class group's per-day summary. Silent on failure -- the band then just
 * renders as it always did.
 */
export const useOfficeHoursBand = (params: { termId: number | null | undefined; classGroupId?: number | null; enabled?: boolean }) => {
  const has = useHasOfficeHours();
  const enabled = (params.enabled ?? true) && has && Boolean(params.termId);
  const [entries, setEntries] = useState<BandEntry[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      return;
    }
    let alive = true;
    officeHoursApi
      .band({ term_id: params.termId, class_group_id: params.classGroupId ?? null })
      .then((r) => alive && setEntries(r.data.data.entries))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [enabled, params.termId, params.classGroupId, version]);

  return { entries, enabled, reload: () => setVersion((v) => v + 1) };
};
