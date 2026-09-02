import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type UserRole = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
export type ScheduleTemplateKind = "REGULAR" | "ON_CALL" | "OVERTIME";
export type RosterAssignmentType = "REGULAR" | "OFF" | "LEAVE" | "ON_CALL" | "OVERTIME";

export const schemaMigrations = sqliteTable("schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull()
});

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Makassar"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [uniqueIndex("sites_code_unique").on(table.code)]);

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  uniqueIndex("departments_site_code_unique").on(table.siteId, table.code),
  index("departments_site_idx").on(table.siteId)
]);

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  siteId: text("site_id").references(() => sites.id),
  departmentId: text("department_id").references(() => departments.id),
  role: text("role").$type<UserRole>().notNull().default("EMPLOYEE"),
  passwordHash: text("password_hash"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  uniqueIndex("employees_code_unique").on(table.employeeCode),
  uniqueIndex("employees_email_unique").on(table.email),
  index("employees_site_idx").on(table.siteId),
  index("employees_department_idx").on(table.departmentId)
]);

export const deviceUsers = sqliteTable("device_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  deviceSerial: text("device_serial").notNull(),
  deviceUserCode: text("device_user_code").notNull(),
  source: text("source").notNull().default("ADMS"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  uniqueIndex("device_users_identity_unique").on(table.deviceSerial, table.deviceUserCode),
  index("device_users_employee_idx").on(table.employeeId)
]);

export const attendanceLogs = sqliteTable("attendance_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceSerial: text("device_serial").notNull(),
  employeeCode: text("employee_code").notNull(),
  recordedAt: text("recorded_at").notNull(),
  attendanceStatus: integer("attendance_status"),
  verificationType: integer("verification_type"),
  workCode: text("work_code"),
  rawLine: text("raw_line").notNull(),
  receivedAt: text("received_at").notNull()
}, (table) => [
  uniqueIndex("attendance_logs_scan_identity").on(table.deviceSerial, table.employeeCode, table.recordedAt),
  index("attendance_logs_recorded_at_idx").on(table.recordedAt)
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent")
}, (table) => [
  uniqueIndex("sessions_token_unique").on(table.tokenHash),
  index("sessions_employee_idx").on(table.employeeId),
  index("sessions_expires_at_idx").on(table.expiresAt)
]);

export const scheduleTemplates = sqliteTable("schedule_templates", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<ScheduleTemplateKind>().notNull().default("REGULAR"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  graceMinutes: integer("grace_minutes").notNull().default(0),
  crossesMidnight: integer("crosses_midnight", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [uniqueIndex("schedule_templates_code_unique").on(table.code)]);

export const rosterAssignments = sqliteTable("roster_assignments", {
  id: text("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  assignmentDate: text("assignment_date").notNull(),
  assignmentType: text("assignment_type").$type<RosterAssignmentType>().notNull(),
  scheduleTemplateId: text("schedule_template_id").references(() => scheduleTemplates.id),
  notes: text("notes"),
  createdByEmployeeId: integer("created_by_employee_id").references(() => employees.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  uniqueIndex("roster_assignments_employee_date_type_unique").on(table.employeeId, table.assignmentDate, table.assignmentType),
  index("roster_assignments_date_idx").on(table.assignmentDate),
  index("roster_assignments_employee_date_idx").on(table.employeeId, table.assignmentDate),
  index("roster_assignments_template_idx").on(table.scheduleTemplateId)
]);
