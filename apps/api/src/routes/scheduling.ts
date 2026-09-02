import { Elysia, t } from "elysia";
import { requireAuth, requirePermission } from "../auth";
import {
  createRosterAssignment,
  createScheduleTemplate,
  deleteRosterAssignment,
  listRoster,
  listScheduleTemplates,
  updateRosterAssignment,
  updateScheduleTemplate
} from "../repositories/scheduling";
import { ValidationError } from "../errors";

const templateKindSchema = t.Union([t.Literal("REGULAR"), t.Literal("ON_CALL"), t.Literal("OVERTIME")]);
const assignmentTypeSchema = t.Union([
  t.Literal("REGULAR"),
  t.Literal("OFF"),
  t.Literal("LEAVE"),
  t.Literal("ON_CALL"),
  t.Literal("OVERTIME")
]);

const templateBody = {
  code: t.String({ minLength: 1, maxLength: 40 }),
  name: t.String({ minLength: 1, maxLength: 120 }),
  kind: t.Optional(templateKindSchema),
  startTime: t.String({ minLength: 5, maxLength: 5 }),
  endTime: t.String({ minLength: 5, maxLength: 5 }),
  graceMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 240 })),
  crossesMidnight: t.Optional(t.Boolean())
};

export const schedulingRoutes = new Elysia({ prefix: "/api" })
  .get("/schedule-templates", ({ request, query }) => {
    requireAuth(request);
    return { records: listScheduleTemplates(query.includeInactive === "true") };
  })
  .post("/schedule-templates", ({ request, body, set }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    set.status = 201;
    return createScheduleTemplate(body);
  }, { body: t.Object(templateBody) })
  .patch("/schedule-templates/:id", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateScheduleTemplate(params.id, body);
  }, {
    body: t.Object({
      code: t.Optional(templateBody.code),
      name: t.Optional(templateBody.name),
      kind: templateBody.kind,
      startTime: t.Optional(templateBody.startTime),
      endTime: t.Optional(templateBody.endTime),
      graceMinutes: templateBody.graceMinutes,
      crossesMidnight: templateBody.crossesMidnight,
      isActive: t.Optional(t.Boolean())
    })
  })
  .get("/roster", ({ request, query }) => {
    const auth = requireAuth(request);
    const requestedEmployeeId = query.employeeId ? Number(query.employeeId) : undefined;
    if (requestedEmployeeId !== undefined && (!Number.isInteger(requestedEmployeeId) || requestedEmployeeId < 1)) {
      throw new ValidationError("employeeId tidak valid");
    }
    const employeeId = requestedEmployeeId ?? (auth.role === "EMPLOYEE" ? auth.employeeId : undefined);
    if (employeeId !== undefined && employeeId !== auth.employeeId) requirePermission(request, "VIEW_EMPLOYEES");
    return { records: listRoster({ from: query.from, to: query.to, employeeId }) };
  }, {
    query: t.Object({
      from: t.String({ minLength: 10, maxLength: 10 }),
      to: t.String({ minLength: 10, maxLength: 10 }),
      employeeId: t.Optional(t.String({ minLength: 1, maxLength: 20 }))
    })
  })
  .post("/roster", ({ request, body, set }) => {
    const auth = requirePermission(request, "MANAGE_MASTER_DATA");
    set.status = 201;
    return createRosterAssignment(body, auth.employeeId);
  }, {
    body: t.Object({
      employeeId: t.Integer({ minimum: 1 }),
      assignmentDate: t.String({ minLength: 10, maxLength: 10 }),
      assignmentType: assignmentTypeSchema,
      scheduleTemplateId: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 80 }))),
      notes: t.Optional(t.Nullable(t.String({ maxLength: 1000 })))
    })
  })
  .patch("/roster/:id", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateRosterAssignment(params.id, body);
  }, {
    body: t.Object({
      assignmentDate: t.Optional(t.String({ minLength: 10, maxLength: 10 })),
      assignmentType: t.Optional(assignmentTypeSchema),
      scheduleTemplateId: t.Optional(t.Nullable(t.String({ minLength: 1, maxLength: 80 }))),
      notes: t.Optional(t.Nullable(t.String({ maxLength: 1000 })))
    })
  })
  .delete("/roster/:id", ({ request, params }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return deleteRosterAssignment(params.id);
  });
