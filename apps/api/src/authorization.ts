import type { UserRole } from "./db/schema";

export type Permission = "VIEW_SELF" | "VIEW_ATTENDANCE" | "VIEW_EMPLOYEES" | "MANAGE_MASTER_DATA";

const permissionsByRole: Record<UserRole, ReadonlySet<Permission>> = {
  EMPLOYEE: new Set(["VIEW_SELF", "VIEW_ATTENDANCE"]),
  SUPERVISOR: new Set(["VIEW_SELF", "VIEW_ATTENDANCE", "VIEW_EMPLOYEES"]),
  ADMIN: new Set(["VIEW_SELF", "VIEW_ATTENDANCE", "VIEW_EMPLOYEES", "MANAGE_MASTER_DATA"])
};

export function roleCan(role: UserRole, permission: Permission) {
  return permissionsByRole[role].has(permission);
}
