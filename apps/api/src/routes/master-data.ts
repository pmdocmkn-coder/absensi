import { Elysia, t } from "elysia";
import { requireAuth, requirePermission } from "../auth";
import {
  createDepartment,
  createEmployee,
  createSite,
  getEmployeeById,
  importEmployees,
  listDepartments,
  listEmployees,
  listSites,
  updateDepartment,
  updateEmployee,
  updateSite
} from "../repositories/master-data";

const roleSchema = t.Union([t.Literal("EMPLOYEE"), t.Literal("SUPERVISOR"), t.Literal("ADMIN")]);
const deviceMappingSchema = t.Object({
  deviceSerial: t.String({ minLength: 1, maxLength: 80 }),
  deviceUserCode: t.String({ minLength: 1, maxLength: 80 })
});

export const masterDataRoutes = new Elysia({ prefix: "/api" })
  .get("/sites", ({ request, query }) => {
    requireAuth(request);
    return { records: listSites(query.includeInactive === "true") };
  })
  .post("/sites", ({ request, body, set }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    set.status = 201;
    return createSite(body);
  }, {
    body: t.Object({
      code: t.String({ minLength: 1, maxLength: 20 }),
      name: t.String({ minLength: 1, maxLength: 120 }),
      timezone: t.Optional(t.String({ minLength: 1, maxLength: 80 }))
    })
  })
  .patch("/sites/:id", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateSite(params.id, body);
  }, {
    body: t.Object({
      code: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
      name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
      timezone: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
      isActive: t.Optional(t.Boolean())
    })
  })
  .get("/departments", ({ request, query }) => {
    requireAuth(request);
    return { records: listDepartments(query.siteId, query.includeInactive === "true") };
  })
  .post("/departments", ({ request, body, set }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    set.status = 201;
    return createDepartment(body);
  }, {
    body: t.Object({
      siteId: t.String({ minLength: 1, maxLength: 80 }),
      code: t.String({ minLength: 1, maxLength: 20 }),
      name: t.String({ minLength: 1, maxLength: 120 })
    })
  })
  .patch("/departments/:id", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateDepartment(params.id, body);
  }, {
    body: t.Object({
      siteId: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
      code: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
      name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
      isActive: t.Optional(t.Boolean())
    })
  })
  .get("/employees", ({ request, query }) => {
    requirePermission(request, "VIEW_EMPLOYEES");
    return {
      records: listEmployees({
        includeInactive: query.includeInactive === "true",
        search: query.search
      })
    };
  })
  .post("/employees", ({ request, body, set }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    set.status = 201;
    return createEmployee(body);
  }, {
    body: t.Object({
      employeeCode: t.String({ minLength: 1, maxLength: 80 }),
      name: t.String({ minLength: 1, maxLength: 160 }),
      email: t.Optional(t.Nullable(t.String({ format: "email", maxLength: 160 }))),
      siteId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
      departmentId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
      role: t.Optional(roleSchema),
      deviceMappings: t.Optional(t.Array(deviceMappingSchema, { maxItems: 20 }))
    })
  })
  .post("/employees/import", ({ request, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return importEmployees(body.records);
  }, {
    body: t.Object({
      records: t.Array(t.Object({
        employeeCode: t.String({ minLength: 1, maxLength: 80 }),
        name: t.String({ minLength: 1, maxLength: 160 }),
        email: t.Optional(t.Nullable(t.String({ format: "email", maxLength: 160 }))),
        siteId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
        departmentId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
        role: t.Optional(roleSchema),
        deviceMappings: t.Optional(t.Array(deviceMappingSchema, { maxItems: 20 }))
      }), { minItems: 1, maxItems: 500 })
    })
  })
  .get("/employees/:id", ({ request, params }) => {
    const auth = requireAuth(request);
    const id = Number(params.id);
    if (auth.employeeId !== id) requirePermission(request, "VIEW_EMPLOYEES");
    return getEmployeeById(id);
  })
  .patch("/employees/:id", ({ request, params, body }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    return updateEmployee(Number(params.id), body);
  }, {
    body: t.Object({
      employeeCode: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
      name: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
      email: t.Optional(t.Nullable(t.String({ format: "email", maxLength: 160 }))),
      siteId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
      departmentId: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
      role: t.Optional(roleSchema),
      isActive: t.Optional(t.Boolean()),
      deviceMappings: t.Optional(t.Array(deviceMappingSchema, { maxItems: 20 }))
    })
  });
