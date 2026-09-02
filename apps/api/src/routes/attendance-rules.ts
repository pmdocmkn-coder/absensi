import { Elysia, t } from "elysia";
import { requireAuth, requirePermission } from "../auth";
import { ValidationError } from "../errors";
import {
  confirmDailyAttendance,
  deleteScheduleProfile,
  listDailyAttendance,
  listScheduleProfiles,
  upsertScheduleProfile
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
      autoWeekendOvertime: body.autoWeekendOvertime,
      overtimeBufferMinutes: body.overtimeBufferMinutes
    });
  }, {
    body: t.Object({
      scheduleTemplateId: t.String({ minLength: 1, maxLength: 80 }),
      workdays: t.Array(t.Integer({ minimum: 1, maximum: 7 }), { minItems: 1, maxItems: 7 }),
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
