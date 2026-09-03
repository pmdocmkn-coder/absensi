import { Elysia, t } from "elysia";
import { requireAuth, requirePermission } from "../auth";
import { ValidationError } from "../errors";
import {
  bulkUpsertEmployeeWorkSetup,
  confirmDailyAttendance,
  deleteScheduleProfile,
  getAttendanceSettings,
  listEmployeeWorkModes,
  listDailyAttendance,
  listScheduleProfiles,
  upsertEmployeeWorkMode,
  upsertScheduleProfile,
  updateAttendanceSettings
} from "../repositories/attendance-rules";

const confirmedStatusSchema = t.Union([
  t.Literal("PRESENT"),
  t.Literal("LATE"),
  t.Literal("OVERTIME"),
  t.Literal("ON_CALL"),
  t.Literal("OFF"),
  t.Literal("LEAVE"),
  t.Literal("ABSENT"),
  t.Literal("NEEDS_REVIEW")
]);

function optionalEmployeeId(value: string | undefined) {
  if (!value) return undefined;
  const employeeId = Number(value);
  if (!Number.isInteger(employeeId) || employeeId < 1) throw new ValidationError("employeeId tidak valid");
  return employeeId;
}

export const attendanceRulesRoutes = new Elysia({ prefix: "/api" })
  .get("/attendance-settings", ({ request }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return getAttendanceSettings();
  })
  .put("/attendance-settings", ({ request, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateAttendanceSettings(body);
  }, {
    body: t.Object({
      lateToleranceMinutes: t.Integer({ minimum: 0, maximum: 240 }),
      earlyLeaveToleranceMinutes: t.Integer({ minimum: 0, maximum: 240 }),
      overtimeBufferMinutes: t.Integer({ minimum: 0, maximum: 240 })
    })
  })
  .get("/schedule-profiles", ({ request }) => {
    requirePermission(request, "VIEW_EMPLOYEES");
    return { records: listScheduleProfiles() };
  })
  .put("/schedule-profiles/:employeeId", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return upsertScheduleProfile({
      employeeId: Number(params.employeeId),
      scheduleTemplateId: body.scheduleTemplateId,
      workdays: body.workdays,
      weeklyTemplates: body.weeklyTemplates,
      autoWeekendOvertime: body.autoWeekendOvertime,
      overtimeBufferMinutes: body.overtimeBufferMinutes
    });
  }, {
    body: t.Object({
      scheduleTemplateId: t.String({ minLength: 1, maxLength: 80 }),
      workdays: t.Array(t.Integer({ minimum: 1, maximum: 7 }), { minItems: 1, maxItems: 7 }),
      weeklyTemplates: t.Optional(t.Array(t.Object({
        day: t.Integer({ minimum: 1, maximum: 7 }),
        scheduleTemplateId: t.String({ minLength: 1, maxLength: 80 })
      }), { minItems: 1, maxItems: 7 })),
      autoWeekendOvertime: t.Optional(t.Boolean()),
      overtimeBufferMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 240 }))
    })
  })
  .delete("/schedule-profiles/:employeeId", ({ request, params }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    const employeeId = Number(params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new ValidationError("employeeId tidak valid");
    return deleteScheduleProfile(employeeId);
  })
  .get("/employee-work-modes", ({ request }) => {
    requirePermission(request, "VIEW_EMPLOYEES");
    return { records: listEmployeeWorkModes() };
  })
  .put("/employee-work-modes/:employeeId", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    const employeeId = Number(params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new ValidationError("employeeId tidak valid");
    return upsertEmployeeWorkMode({ employeeId, mode: body.mode, rosterGroup: body.rosterGroup });
  }, {
    body: t.Object({
      mode: t.Union([t.Literal("FIXED"), t.Literal("ROSTER"), t.Literal("NONE")]),
      rosterGroup: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 80 })))
    })
  })
  .put("/employee-work-modes/bulk/setup", ({ request, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return bulkUpsertEmployeeWorkSetup(body);
  }, {
    body: t.Object({
      employeeIds: t.Array(t.Integer({ minimum: 1 }), { minItems: 1, maxItems: 500 }),
      mode: t.Union([t.Literal("FIXED"), t.Literal("ROSTER"), t.Literal("NONE")]),
      rosterGroup: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 80 }))),
      departmentId: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 80 }))),
      role: t.Optional(t.Union([t.Literal("EMPLOYEE"), t.Literal("SUPERVISOR"), t.Literal("ADMIN")])),
      profile: t.Optional(t.Nullable(t.Object({
        scheduleTemplateId: t.String({ minLength: 1, maxLength: 80 }),
        workdays: t.Array(t.Integer({ minimum: 1, maximum: 7 }), { minItems: 1, maxItems: 7 }),
        weeklyTemplates: t.Optional(t.Array(t.Object({
          day: t.Integer({ minimum: 1, maximum: 7 }),
          scheduleTemplateId: t.String({ minLength: 1, maxLength: 80 })
        }), { minItems: 1, maxItems: 7 })),
        autoWeekendOvertime: t.Optional(t.Boolean()),
        overtimeBufferMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 240 }))
      })))
    })
  })
  .get("/attendance/daily", ({ request, query }) => {
    const auth = requireAuth(request);
    const requestedEmployeeId = optionalEmployeeId(query.employeeId);
    const employeeId = requestedEmployeeId ?? (auth.role === "EMPLOYEE" ? auth.employeeId : undefined);
    if (employeeId !== undefined && employeeId !== auth.employeeId) requirePermission(request, "VIEW_EMPLOYEES");
    if (employeeId === undefined) requirePermission(request, "VIEW_EMPLOYEES");
    return { records: listDailyAttendance({ from: query.from, to: query.to, employeeId }) };
  }, {
    query: t.Object({
      from: t.String({ minLength: 10, maxLength: 10 }),
      to: t.String({ minLength: 10, maxLength: 10 }),
      employeeId: t.Optional(t.String({ minLength: 1, maxLength: 20 }))
    })
  })
  .patch("/attendance/daily/:employeeId/:date/confirm", ({ request, params, body }) => {
    const auth = requirePermission(request, "MANAGE_MASTER_DATA");
    const employeeId = Number(params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new ValidationError("employeeId tidak valid");
    return confirmDailyAttendance({
      employeeId,
      attendanceDate: params.date,
      status: body.status,
      note: body.note,
      confirmedByEmployeeId: auth.employeeId
    });
  }, {
    body: t.Object({
      status: confirmedStatusSchema,
      note: t.Optional(t.Nullable(t.String({ maxLength: 1000 })))
    })
  });
