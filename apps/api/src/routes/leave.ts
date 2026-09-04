import { Elysia, t } from "elysia";
import { requireAuth, requirePermission } from "../auth";
import { ValidationError } from "../errors";
import { createLeaveRequest, deleteLeaveRequest, listLeaveRequests, updateLeaveStatus } from "../repositories/leave";

const leaveTypeSchema = t.Union([
  t.Literal("ANNUAL"),
  t.Literal("SICK"),
  t.Literal("FAMILY"),
  t.Literal("MATERNITY"),
  t.Literal("SPECIAL")
]);

const leaveStatusSchema = t.Union([
  t.Literal("PENDING"),
  t.Literal("APPROVED"),
  t.Literal("REJECTED")
]);

export const leaveRoutes = new Elysia({ prefix: "/api" })
  .get("/leave", ({ request, query }) => {
    const auth = requireAuth(request);
    const requestedEmployeeId = query.employeeId ? Number(query.employeeId) : undefined;
    if (requestedEmployeeId !== undefined && (!Number.isInteger(requestedEmployeeId) || requestedEmployeeId < 1)) {
      throw new ValidationError("employeeId tidak valid");
    }
    const employeeId = requestedEmployeeId ?? (auth.role === "EMPLOYEE" ? auth.employeeId : undefined);
    if (employeeId !== undefined && employeeId !== auth.employeeId) requirePermission(request, "VIEW_EMPLOYEES");
    if (employeeId === undefined) requirePermission(request, "VIEW_EMPLOYEES");

    return { records: listLeaveRequests({ from: query.from, to: query.to, status: query.status, employeeId }) };
  }, {
    query: t.Object({
      from: t.Optional(t.String({ minLength: 10, maxLength: 10 })),
      to: t.Optional(t.String({ minLength: 10, maxLength: 10 })),
      status: t.Optional(t.String()),
      employeeId: t.Optional(t.String({ minLength: 1, maxLength: 20 }))
    })
  })
  .post("/leave", ({ request, body, set }) => {
    const auth = requireAuth(request);
    const employeeId = body.employeeId ?? auth.employeeId;
    if (auth.role === "EMPLOYEE" && employeeId !== auth.employeeId) {
      throw new ValidationError("Karyawan hanya dapat mengajukan cuti untuk diri sendiri");
    }
    if (auth.role !== "EMPLOYEE" && employeeId !== auth.employeeId) {
      requirePermission(request, "MANAGE_MASTER_DATA");
    }

    set.status = 201;
    return createLeaveRequest({
      employeeId,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      status: auth.role === "ADMIN" ? (body.status ?? "APPROVED") : "PENDING"
    }, auth.employeeId);
  }, {
    body: t.Object({
      employeeId: t.Optional(t.Integer({ minimum: 1 })),
      leaveType: leaveTypeSchema,
      startDate: t.String({ minLength: 10, maxLength: 10 }),
      endDate: t.String({ minLength: 10, maxLength: 10 }),
      reason: t.String({ minLength: 2, maxLength: 500 }),
      status: t.Optional(leaveStatusSchema)
    })
  })
  .patch("/leave/:id/status", ({ request, params, body }) => {
    const auth = requirePermission(request, "MANAGE_MASTER_DATA");
    return updateLeaveStatus(params.id, body.status, auth.employeeId);
  }, {
    body: t.Object({
      status: leaveStatusSchema
    })
  })
  .delete("/leave/:id", ({ request, params }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return deleteLeaveRequest(params.id);
  });
