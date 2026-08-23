import type { Role } from "@/lib/types";

export const roleDashboardPath: Record<Role, string> = {
  OWNER: "/dashboard/owner",
  ADMIN: "/dashboard/admin",
  EMPLOYEE: "/dashboard/employee",
  RETAILER: "/dashboard/retailer",
};

export function isRole(value: unknown): value is Role {
  return value === "OWNER" || value === "ADMIN" || value === "EMPLOYEE" || value === "RETAILER";
}
