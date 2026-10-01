import { useCallback } from "react";
import { useUser } from "../../contexts/UserContext";

/** Does the signed-in user hold any of these v1 (role → permission) permissions? */
export function useLegacyPermission() {
  const { user } = useUser();
  return useCallback(
    (perms?: string[]) =>
      !!perms?.length && !!user?.roles?.some((r: any) => r.permissions?.some((p: any) => perms.includes(p.name))),
    [user],
  );
}
