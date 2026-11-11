/**
 * Capabilities introduced by access control v2 (MIS ones, plus every
 * satellite capability "<app>:<KEY>").
 *
 * They are stored in the same Permission/RolePermission tables as the legacy
 * MIS permissions, but the legacy outputs -- req.user.permissions, GET
 * /users/me and the SSO token (utils/auth.ts) -- never include them. So
 * adding one to a role people already hold changes nothing about their
 * current access, and the spoke apps' keyword heuristics never see them.
 * v2 features read them through the access snapshot instead.
 */
export const V2_ONLY_CAPABILITIES = new Set([
  "ACCESS_STUDIO_VIEW",
  "ACCESS_ROLES_MANAGE",
  "ACCESS_RULES_MANAGE",
  "ACCESS_GRANTS_MANAGE",
  "ACCESS_GRANTS_RESTRICTED",
  "ACCESS_PREVIEW_AS",
  "ACCESS_AUDIT_VIEW",
  "VIEW_LEADERSHIP_STRUCTURE",
  "MANAGE_DEPARTMENTS",
  "ANALYTICS_VIEW",
  "ANALYTICS_LIVE_VIEW",
  "ANALYTICS_USER_VIEW",
  "ANALYTICS_LOCATION_VIEW",
  "ANALYTICS_USER_CONTROL",
  "ANALYTICS_CONFIGURE",
  "USAGE_INSIGHTS_VIEW",
  // Tenant management (services/tenantMgmt/catalog.ts)
  "PLATFORM_TENANTS_VIEW",
  "PLATFORM_APPLICATIONS_REVIEW",
  "PLATFORM_APPLICATIONS_DECIDE",
  "PLATFORM_BILLING_INVOICE",
  "PLATFORM_BILLING_CONFIRM",
  "PLATFORM_BILLING_WAIVE",
  "PLATFORM_TENANTS_LIFECYCLE",
  "PLATFORM_TENANTS_ENTITLEMENTS",
  "PLATFORM_PACKAGES_MANAGE",
  "PLATFORM_SUPPORT_ACCESS",
  "PLATFORM_AUDIT_VIEW",
  "SCHOOL_SETTINGS_MANAGE",
  "SCHOOL_BILLING_MANAGE",
]);

export const isV2OnlyCapability = (name: string) =>
  name.includes(":") || V2_ONLY_CAPABILITIES.has(name);

