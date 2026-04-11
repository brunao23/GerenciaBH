import { getTenantFromRequest } from "./api-tenant"
import { normalizeTenant } from "./normalize-tenant"
import { normalizeTenantAlias, resolveTenantDataPrefix } from "./tenant-resolution"

/**
 * Resolve tenant from JWT (preferred) with header fallback.
 * Throws if neither is available or valid.
 */
export async function resolveTenant(req: Request): Promise<string> {
  try {
    const tenantInfo = await getTenantFromRequest()
    return tenantInfo.tenant
  } catch {
    const rawTenant = normalizeTenant(req.headers.get("x-tenant-prefix") || "")
    if (rawTenant && /^[a-z0-9_]+$/.test(rawTenant)) {
      const logicalTenant = normalizeTenantAlias(rawTenant)
      try {
        return await resolveTenantDataPrefix(logicalTenant)
      } catch {
        return logicalTenant
      }
    }
    throw new Error("Session not found. Please login again.")
  }
}
