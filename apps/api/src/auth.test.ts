import { describe, expect, test } from "bun:test";
import { roleCan, type Permission } from "./authorization";
import type { UserRole } from "./db/schema";

const matrix: Array<{ role: UserRole; permission: Permission; allowed: boolean }> = [
  { role: "EMPLOYEE", permission: "VIEW_SELF", allowed: true },
  { role: "EMPLOYEE", permission: "VIEW_ATTENDANCE", allowed: true },
  { role: "EMPLOYEE", permission: "VIEW_EMPLOYEES", allowed: false },
  { role: "EMPLOYEE", permission: "MANAGE_MASTER_DATA", allowed: false },
  { role: "SUPERVISOR", permission: "VIEW_SELF", allowed: true },
  { role: "SUPERVISOR", permission: "VIEW_ATTENDANCE", allowed: true },
  { role: "SUPERVISOR", permission: "VIEW_EMPLOYEES", allowed: true },
  { role: "SUPERVISOR", permission: "MANAGE_MASTER_DATA", allowed: false },
  { role: "ADMIN", permission: "VIEW_SELF", allowed: true },
  { role: "ADMIN", permission: "VIEW_ATTENDANCE", allowed: true },
  { role: "ADMIN", permission: "VIEW_EMPLOYEES", allowed: true },
  { role: "ADMIN", permission: "MANAGE_MASTER_DATA", allowed: true }
];

describe("RBAC matrix", () => {
  for (const entry of matrix) {
    test(`${entry.role} ${entry.permission}`, () => {
      expect(roleCan(entry.role, entry.permission)).toBe(entry.allowed);
    });
  }
});
