// Permission names are ACTION_OBJECT style (MANAGE_USERS, ASSIGN_SCHOOL_SYSTEMS)
// — the leading verb is a real, reusable category for grouping and filtering.
export const getPermissionCategory = (permName: string): string =>
  permName.split("_")[0] || "General";
