import { beforeAll, describe, expect, test } from "bun:test";

Bun.env.SQLITE_PATH = ":memory:";

let app: Awaited<typeof import("./app")>["app"];
let adminCookie = "";
let employeeCookie = "";
let employeeId = 0;
let steadyDayTemplateId = "";

function jsonRequest(path: string, method: string, body?: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function login(identifier: string, password: string) {
  const response = await app.handle(jsonRequest("/api/auth/login", "POST", { identifier, password }));
  return {
    response,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? ""
  };
}

beforeAll(async () => {
  const [{ app: importedApp }, { db }, { employees }] = await Promise.all([
    import("./app"),
    import("./db/connection"),
    import("./db/schema")
  ]);
  app = importedApp;

  const now = new Date().toISOString();
  const [adminHash, employeeHash] = await Promise.all([
    Bun.password.hash("AdminPassword123!"),
    Bun.password.hash("EmployeePassword123!")
  ]);

  db.insert(employees).values([
    {
      employeeCode: "ADMIN-001",
      name: "Administrator Uji",
      email: "admin@example.test",
      siteId: "site-default",
      role: "ADMIN",
      passwordHash: adminHash,
      isActive: true,
      createdAt: now,
      updatedAt: now
    },
    {
      employeeCode: "EMP-001",
      name: "Karyawan Uji",
      email: "employee@example.test",
      siteId: "site-default",
      role: "EMPLOYEE",
      passwordHash: employeeHash,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }
  ]).run();
});

describe("authentication and master-data API", () => {
  test("rejects an incorrect password", async () => {
    const { response } = await login("ADMIN-001", "WrongPassword123!");
    expect(response.status).toBe(401);
  });

  test("logs in admin and returns the current user", async () => {
    const loginResult = await login("admin@example.test", "AdminPassword123!");
    expect(loginResult.response.status).toBe(200);
    expect(loginResult.cookie).toStartWith("attendance_session=");
    adminCookie = loginResult.cookie;

    const response = await app.handle(jsonRequest("/api/auth/me", "GET", undefined, adminCookie));
    const payload = await response.json() as { user: { role: string; employeeCode: string } };
    expect(response.status).toBe(200);
    expect(payload.user.role).toBe("ADMIN");
    expect(payload.user.employeeCode).toBe("ADMIN-001");
  });

  test("allows admin to create a department and mapped employee", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "OPS",
      name: "Operasional"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };
    expect(departmentResponse.status).toBe(201);

    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-002",
      name: "Karyawan Mapping",
      siteId: "site-default",
      departmentId: department.id,
      deviceMappings: [{ deviceSerial: "X105-TEST", deviceUserCode: "2002" }]
    }, adminCookie));
    const employee = await employeeResponse.json() as {
      departmentName: string;
      deviceMappings: Array<{ deviceUserCode: string }>;
    };
    expect(employeeResponse.status).toBe(201);
    expect(employee.departmentName).toBe("Operasional");
    expect(employee.deviceMappings[0]?.deviceUserCode).toBe("2002");
  });

  test("allows admin to create a regular roster and an on-call overlay", async () => {
    const employeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const employeePayload = await employeesResponse.json() as { records: Array<{ id: number; employeeCode: string }> };
    employeeId = employeePayload.records.find((employee) => employee.employeeCode === "EMP-001")?.id ?? 0;
    expect(employeeId).toBeGreaterThan(0);

    const templateResponse = await app.handle(jsonRequest("/api/schedule-templates", "GET", undefined, adminCookie));
    const templatePayload = await templateResponse.json() as { records: Array<{ id: string; code: string }> };
    const template = templatePayload.records.find((record) => record.code === "STEADY_DAY")!;
    expect(templateResponse.status).toBe(200);
    expect(template.code).toBe("STEADY_DAY");
    steadyDayTemplateId = template.id;

    const regularResponse = await app.handle(jsonRequest("/api/roster", "POST", {
      employeeId,
      assignmentDate: "2026-09-03",
      assignmentType: "REGULAR",
      scheduleTemplateId: template.id
    }, adminCookie));
    expect(regularResponse.status).toBe(201);

    const onCallResponse = await app.handle(jsonRequest("/api/roster", "POST", {
      employeeId,
      assignmentDate: "2026-09-03",
      assignmentType: "ON_CALL",
      notes: "Cadangan setelah jam kerja"
    }, adminCookie));
    expect(onCallResponse.status).toBe(201);
  });

  test("pairs a night-shift check-out on the following day", async () => {
    const employeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const employeePayload = await employeesResponse.json() as { records: Array<{ id: number; employeeCode: string }> };
    const nightEmployeeId = employeePayload.records.find((employee) => employee.employeeCode === "EMP-002")?.id ?? 0;
    const templatesResponse = await app.handle(jsonRequest("/api/schedule-templates", "GET", undefined, adminCookie));
    const templatePayload = await templatesResponse.json() as { records: Array<{ id: string; code: string }> };
    const nightTemplate = templatePayload.records.find((template) => template.code === "SHIFT_MALAM")!;

    const rosterResponse = await app.handle(jsonRequest("/api/roster", "POST", {
      employeeId: nightEmployeeId,
      assignmentDate: "2026-09-01",
      assignmentType: "REGULAR",
      scheduleTemplateId: nightTemplate.id
    }, adminCookie));
    expect(rosterResponse.status).toBe(201);

    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-TEST&table=ATTLOG", {
      method: "POST",
      body: [
        "2002\t2026-09-01 17:55:00\t0\t1",
        "2002\t2026-09-02 06:20:00\t0\t1"
      ].join("\n")
    }));
    expect(uploadResponse.status).toBe(200);

    const dailyResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-09-01&to=2026-09-01&employeeId=${nightEmployeeId}`, "GET", undefined, adminCookie));
    const payload = await dailyResponse.json() as { records: Array<{ scheduleCode: string; checkOutAt: string | null; overtimeMinutes: number; autoStatus: string }> };
    expect(dailyResponse.status).toBe(200);
    expect(payload.records[0]?.scheduleCode).toBe("SHIFT_MALAM");
    expect(payload.records[0]?.checkOutAt).toBe("2026-09-02 06:20:00");
    expect(payload.records[0]?.overtimeMinutes).toBe(5);
    expect(payload.records[0]?.autoStatus).toBe("OVERTIME");
  });

  test("evaluates Steady Day and weekend scans automatically, then lets admin confirm", async () => {
    const profileResponse = await app.handle(jsonRequest(`/api/schedule-profiles/${employeeId}`, "PUT", {
      scheduleTemplateId: steadyDayTemplateId,
      workdays: [1, 2, 3, 4, 5],
      autoWeekendOvertime: true,
      overtimeBufferMinutes: 15
    }, adminCookie));
    expect(profileResponse.status).toBe(200);

    const mappingResponse = await app.handle(jsonRequest(`/api/employees/${employeeId}`, "PATCH", {
      deviceMappings: [{ deviceSerial: "X105-RULES", deviceUserCode: "EMP-001" }]
    }, adminCookie));
    expect(mappingResponse.status).toBe(200);

    const offResponse = await app.handle(jsonRequest("/api/roster", "POST", {
      employeeId,
      assignmentDate: "2026-09-01",
      assignmentType: "OFF"
    }, adminCookie));
    expect(offResponse.status).toBe(201);

    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-RULES&table=ATTLOG", {
      method: "POST",
      body: [
        "EMP-001\t2026-08-30 09:00:00\t0\t1",
        "EMP-001\t2026-08-30 17:00:00\t0\t1",
        "EMP-001\t2026-08-31 08:05:00\t0\t1",
        "EMP-001\t2026-08-31 17:45:00\t0\t1",
        "EMP-001\t2026-09-01 10:00:00\t0\t1"
      ].join("\n")
    }));
    expect(uploadResponse.status).toBe(200);

    const dailyResponse = await app.handle(jsonRequest(
      `/api/attendance/daily?from=2026-08-28&to=2026-09-01&employeeId=${employeeId}`,
      "GET",
      undefined,
      adminCookie
    ));
    const dailyPayload = await dailyResponse.json() as { records: Array<{ attendanceDate: string; autoStatus: string; overtimeMinutes: number }> };
    expect(dailyResponse.status).toBe(200);
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-30")?.autoStatus).toBe("OVERTIME");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-28")?.autoStatus).toBe("ABSENT");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-31")?.autoStatus).toBe("OVERTIME");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-31")?.overtimeMinutes).toBe(30);
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-09-01")?.autoStatus).toBe("NEEDS_REVIEW");

    const confirmationResponse = await app.handle(jsonRequest(`/api/attendance/daily/${employeeId}/2026-08-30/confirm`, "PATCH", {
      status: "OVERTIME",
      note: "Disetujui supervisor"
    }, adminCookie));
    const confirmation = await confirmationResponse.json() as { confirmationState: string; confirmationNote: string | null };
    expect(confirmationResponse.status).toBe(200);
    expect(confirmation.confirmationState).toBe("CONFIRMED");
    expect(confirmation.confirmationNote).toBe("Disetujui supervisor");
  });

  test("orders daily attendance by the most recent scan activity", async () => {
    const response = await app.handle(jsonRequest(
      "/api/attendance/daily?from=2026-09-01&to=2026-09-01",
      "GET",
      undefined,
      adminCookie
    ));
    const payload = await response.json() as { records: Array<{ employeeCode: string; checkInAt: string | null; checkOutAt: string | null }> };
    expect(response.status).toBe(200);
    expect(payload.records[0]?.employeeCode).toBe("EMP-002");
    expect(payload.records[1]?.employeeCode).toBe("EMP-001");
    expect(payload.records.at(-1)?.checkInAt).toBeNull();
  });

  test("reports duplicate employee code as conflict", async () => {
    const response = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-002",
      name: "Duplikat"
    }, adminCookie));
    expect(response.status).toBe(409);
  });

  test("forbids employee from managing or listing master data", async () => {
    const loginResult = await login("EMP-001", "EmployeePassword123!");
    expect(loginResult.response.status).toBe(200);
    employeeCookie = loginResult.cookie;

    const listResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, employeeCookie));
    const createResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "HR",
      name: "Human Resources"
    }, employeeCookie));
    expect(listResponse.status).toBe(403);
    expect(createResponse.status).toBe(403);
  });

  test("shows an employee only their own roster", async () => {
    const response = await app.handle(jsonRequest("/api/roster?from=2026-09-03&to=2026-09-03", "GET", undefined, employeeCookie));
    const payload = await response.json() as { records: Array<{ employeeId: number; assignmentType: string }> };
    expect(response.status).toBe(200);
    expect(payload.records).toHaveLength(2);
    expect(payload.records.every((record) => record.employeeId === employeeId)).toBe(true);
    expect(payload.records.map((record) => record.assignmentType)).toEqual(["ON_CALL", "REGULAR"]);
  });

  test("revokes the session on logout", async () => {
    const logoutResponse = await app.handle(jsonRequest("/api/auth/logout", "POST", undefined, employeeCookie));
    expect(logoutResponse.status).toBe(200);

    const meResponse = await app.handle(jsonRequest("/api/auth/me", "GET", undefined, employeeCookie));
    expect(meResponse.status).toBe(401);
  });

  test("protects attendance data and allows an authenticated employee", async () => {
    const anonymousResponse = await app.handle(jsonRequest("/api/attendance", "GET"));
    expect(anonymousResponse.status).toBe(401);

    const loginResult = await login("EMP-001", "EmployeePassword123!");
    const employeeResponse = await app.handle(jsonRequest("/api/attendance", "GET", undefined, loginResult.cookie));
    expect(employeeResponse.status).toBe(200);

    const deleteResponse = await app.handle(jsonRequest("/api/events", "DELETE", undefined, loginResult.cookie));
    expect(deleteResponse.status).toBe(403);
  });
});
