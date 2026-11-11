/**
 * Local convenience wrapper: `npx ts-node scripts/tenant-provision.ts --tid=2`
 * (or --create --slug=... --name=...). Production uses the compiled
 * dist/scripts/tenantProvision.js -- see src/scripts/tenantProvision.ts.
 */
import "../src/scripts/tenantProvision";
