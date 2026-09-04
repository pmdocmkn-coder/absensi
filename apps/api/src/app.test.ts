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

  test("imports employee setup by PIN and configures roster crew atomically", async () => {
    const rawEmployeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "9090",
      name: "9090",
      email: "import-preserved@example.test",
      role: "SUPERVISOR",
      siteId: "site-default",
      deviceMappings: [{ deviceSerial: "X105-IMPORT", deviceUserCode: "9090" }]
    }, adminCookie));
    expect(rawEmployeeResponse.status).toBe(201);

    const importResponse = await app.handle(jsonRequest("/api/employees/import-setup", "POST", {
      records: [{
        employeeCode: "PIT-9090",
        name: "Nama Mapping Diperbarui",
        departmentCode: "PIT",
        departmentName: "Pit Crew",
        deviceSerial: "X105-IMPORT",
        deviceUserCode: "9090",
        rosterGroup: "Crew A"
      }]
    }, adminCookie));
    const report = await importResponse.json() as { created: number; updated: number; rosterConfigured: number };
    expect(importResponse.status).toBe(200);
    expect(report.created).toBe(0);
    expect(report.updated).toBe(1);
    expect(report.rosterConfigured).toBe(1);

    const employeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const employeePayload = await employeesResponse.json() as { records: Array<{ id: number; employeeCode: string; name: string; departmentName: string; email: string; role: string }> };
    const imported = employeePayload.records.find((employee) => employee.employeeCode === "PIT-9090");
    expect(imported?.name).toBe("Nama Mapping Diperbarui");
    expect(imported?.departmentName).toBe("Pit Crew");
    expect(imported?.email).toBe("import-preserved@example.test");
    expect(imported?.role).toBe("SUPERVISOR");

    const modesResponse = await app.handle(jsonRequest("/api/employee-work-modes", "GET", undefined, adminCookie));
    const modesPayload = await modesResponse.json() as { records: Array<{ employeeId: number; mode: string; rosterGroup: string }> };
    expect(modesPayload.records.find((mode) => mode.employeeId === imported?.id)).toMatchObject({ mode: "ROSTER", rosterGroup: "Crew A" });
  });

  test("rolls back the entire employee setup import when one row conflicts", async () => {
    const response = await app.handle(jsonRequest("/api/employees/import-setup", "POST", {
      records: [
        { employeeCode: "ROLLBACK-IMPORT", name: "Tidak Boleh Tersimpan" },
        { employeeCode: "PIT-9090", name: "Konflik", deviceSerial: "X105-TEST", deviceUserCode: "2002" }
      ]
    }, adminCookie));
    expect(response.status).toBe(409);

    const employeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const payload = await employeesResponse.json() as { records: Array<{ employeeCode: string }> };
    expect(payload.records.some((employee) => employee.employeeCode === "ROLLBACK-IMPORT")).toBe(false);
  });

  test("applies one work profile to multiple employees atomically", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "BULK-PIT",
      name: "Pit Crew Bulk"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };
    expect(departmentResponse.status).toBe(201);
    const created = await Promise.all(["A", "B"].map(async (suffix) => {
      const response = await app.handle(jsonRequest("/api/employees", "POST", {
        employeeCode: `BULK-PROFILE-${suffix}`,
        name: `Karyawan Profil Massal ${suffix}`,
        siteId: "site-default"
      }, adminCookie));
      return response.json() as Promise<{ id: number }>;
    }));
    const templateResponse = await app.handle(jsonRequest("/api/schedule-templates", "GET", undefined, adminCookie));
    const templatePayload = await templateResponse.json() as { records: Array<{ id: string; code: string }> };
    const template = templatePayload.records.find((item) => item.code === "STEADY_DAY")!;

    const response = await app.handle(jsonRequest("/api/employee-work-modes/bulk/setup", "PUT", {
      employeeIds: created.map((employee) => employee.id),
      mode: "FIXED",
      departmentId: department.id,
      role: "SUPERVISOR",
      profile: { scheduleTemplateId: template.id, workdays: [1, 2, 3, 4, 5], autoWeekendOvertime: true, overtimeBufferMinutes: 15 }
    }, adminCookie));
    const report = await response.json() as { total: number };
    expect(response.status).toBe(200);
    expect(report.total).toBe(2);

    const employeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const employeesPayload = await employeesResponse.json() as { records: Array<{ id: number; departmentId: string | null; role: string }> };
    expect(created.every((employee) => employeesPayload.records.some((record) => record.id === employee.id && record.departmentId === department.id && record.role === "SUPERVISOR"))).toBe(true);

    const failedResponse = await app.handle(jsonRequest("/api/employee-work-modes/bulk/setup", "PUT", {
      employeeIds: [created[0]!.id, 999999],
      mode: "NONE"
    }, adminCookie));
    expect(failedResponse.status).toBe(404);

    const profilesResponse = await app.handle(jsonRequest("/api/schedule-profiles", "GET", undefined, adminCookie));
    const profilesPayload = await profilesResponse.json() as { records: Array<{ employeeId: number }> };
    expect(created.every((employee) => profilesPayload.records.some((profile) => profile.employeeId === employee.id))).toBe(true);
  });

  test("applies Steady Day automatically to a non-PIT department without an individual profile", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "AUTO-OPS",
      name: "Operasional Otomatis"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };
    expect(departmentResponse.status).toBe(201);

    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-AUTO-STEADY",
      name: "Karyawan Steady Otomatis",
      siteId: "site-default",
      departmentId: department.id,
      deviceMappings: [{ deviceSerial: "X105-AUTO-STEADY", deviceUserCode: "auto-steady" }]
    }, adminCookie));
    const employee = await employeeResponse.json() as { id: number };
    expect(employeeResponse.status).toBe(201);
    expect(employee.id).toBeGreaterThan(0);

    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-AUTO-STEADY&table=ATTLOG", {
      method: "POST",
      body: "auto-steady\t2026-08-28 08:05:00\t0\t1"
    }));
    expect(uploadResponse.status).toBe(200);

    const dailyResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-08-28&to=2026-08-28&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const payload = await dailyResponse.json() as { records: Array<{ scheduleCode: string | null; autoStatus: string; notes: string[] }> };
    expect(dailyResponse.status).toBe(200);
    expect(payload.records[0]?.scheduleCode).toBe("STEADY_DAY");
    expect(payload.records[0]?.autoStatus).toBe("NEEDS_REVIEW");
    expect(payload.records[0]?.notes).toContain("Steady Day otomatis berdasarkan departemen");
  });

  test("applies a Crew A/B/C rotation automatically across departments and lets a manual roster override it", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "HELP-DESK-ROSTER",
      name: "Help Desk Roster"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };

    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-HELP-CREW-B",
      name: "Karyawan Help Desk Crew B",
      siteId: "site-default",
      departmentId: department.id
    }, adminCookie));
    const employee = await employeeResponse.json() as { id: number };

    const modeResponse = await app.handle(jsonRequest(`/api/employee-work-modes/${employee.id}`, "PUT", {
      mode: "ROSTER",
      rosterGroup: "Crew B"
    }, adminCookie));
    expect(modeResponse.status).toBe(200);

    const automaticResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-08-17&to=2026-08-17&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const automatic = await automaticResponse.json() as { records: Array<{ scheduleCode: string | null; notes: string[] }> };
    expect(automatic.records[0]?.scheduleCode).toBe("SHIFT_PAGI");
    expect(automatic.records[0]?.notes).toContain("Pola Crew B otomatis");

    const templatesResponse = await app.handle(jsonRequest("/api/schedule-templates", "GET", undefined, adminCookie));
    const templatesPayload = await templatesResponse.json() as { records: Array<{ id: string; code: string }> };
    const nightTemplate = templatesPayload.records.find((template) => template.code === "SHIFT_MALAM")!;
    const overrideResponse = await app.handle(jsonRequest("/api/roster", "POST", {
      employeeId: employee.id,
      assignmentDate: "2026-08-17",
      assignmentType: "REGULAR",
      scheduleTemplateId: nightTemplate.id,
      notes: "Perubahan shift khusus"
    }, adminCookie));
    expect(overrideResponse.status).toBe(201);

    const overriddenResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-08-17&to=2026-08-17&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const overridden = await overriddenResponse.json() as { records: Array<{ scheduleCode: string | null; notes: string[] }> };
    expect(overridden.records[0]?.scheduleCode).toBe("SHIFT_MALAM");
    expect(overridden.records[0]?.notes).not.toContain("Pola Crew B otomatis");
  });

  test("distinguishes a lone check-out from a forgotten check-in and explains both single-scan cases", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "SINGLE-SCAN",
      name: "Single Scan Test"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };

    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-SINGLE-SCAN",
      name: "Karyawan Scan Tunggal",
      siteId: "site-default",
      departmentId: department.id,
      deviceMappings: [{ deviceSerial: "X105-SINGLE-SCAN", deviceUserCode: "single-scan" }]
    }, adminCookie));
    const employee = await employeeResponse.json() as { id: number };

    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-SINGLE-SCAN&table=ATTLOG", {
      method: "POST",
      body: [
        "single-scan\t2026-08-31 16:58:27\t0\t1",
        "single-scan\t2026-09-01 07:58:27\t0\t1"
      ].join("\n")
    }));
    expect(uploadResponse.status).toBe(200);

    const missingInResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-08-31&to=2026-08-31&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const missingIn = await missingInResponse.json() as { records: Array<{ autoStatus: string; checkInAt: string | null; checkOutAt: string | null; notes: string[] }> };
    expect(missingIn.records[0]).toMatchObject({
      autoStatus: "NEEDS_REVIEW",
      checkInAt: null,
      checkOutAt: "2026-08-31 16:58:27"
    });
    expect(missingIn.records[0]?.notes[0]).toBe("Tidak absen masuk");

    const missingOutResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-09-01&to=2026-09-01&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const missingOut = await missingOutResponse.json() as { records: Array<{ autoStatus: string; checkInAt: string | null; checkOutAt: string | null; notes: string[] }> };
    expect(missingOut.records[0]).toMatchObject({
      autoStatus: "NEEDS_REVIEW",
      checkInAt: "2026-09-01 07:58:27",
      checkOutAt: null
    });
    expect(missingOut.records[0]?.notes[0]).toBe("Tidak absen pulang");
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

  test("saves and clears bulk roster atomically", async () => {
    const createResponse = await app.handle(jsonRequest("/api/roster/bulk", "POST", {
      assignments: [
        { employeeId, assignmentDate: "2026-09-04", assignmentType: "REGULAR", scheduleTemplateId: steadyDayTemplateId },
        { employeeId, assignmentDate: "2026-09-05", assignmentType: "OFF" }
      ]
    }, adminCookie));
    const created = await createResponse.json() as { count: number; created: number; updated: number; records: Array<{ id: string }> };
    expect(createResponse.status).toBe(200);
    expect(created.count).toBe(2);
    expect(created.created).toBe(2);

    const updateResponse = await app.handle(jsonRequest("/api/roster/bulk", "POST", {
      assignments: [{ employeeId, assignmentDate: "2026-09-04", assignmentType: "REGULAR", scheduleTemplateId: steadyDayTemplateId, notes: "Diperbarui massal" }]
    }, adminCookie));
    const updated = await updateResponse.json() as { created: number; updated: number };
    expect(updateResponse.status).toBe(200);
    expect(updated.created).toBe(0);
    expect(updated.updated).toBe(1);

    const failedCreateResponse = await app.handle(jsonRequest("/api/roster/bulk", "POST", {
      assignments: [
        { employeeId, assignmentDate: "2026-09-06", assignmentType: "OFF" },
        { employeeId: 999999, assignmentDate: "2026-09-06", assignmentType: "OFF" }
      ]
    }, adminCookie));
    expect(failedCreateResponse.status).toBe(400);
    const afterFailedCreate = await app.handle(jsonRequest(`/api/roster?from=2026-09-06&to=2026-09-06&employeeId=${employeeId}`, "GET", undefined, adminCookie));
    const afterFailedCreatePayload = await afterFailedCreate.json() as { records: unknown[] };
    expect(afterFailedCreatePayload.records).toHaveLength(0);

    const failedDeleteResponse = await app.handle(jsonRequest("/api/roster/bulk", "DELETE", {
      ids: [created.records[0]!.id, "roster-does-not-exist"]
    }, adminCookie));
    expect(failedDeleteResponse.status).toBe(404);
    const afterFailedDelete = await app.handle(jsonRequest(`/api/roster?from=2026-09-04&to=2026-09-05&employeeId=${employeeId}`, "GET", undefined, adminCookie));
    const afterFailedDeletePayload = await afterFailedDelete.json() as { records: unknown[] };
    expect(afterFailedDeletePayload.records).toHaveLength(2);

    const deleteResponse = await app.handle(jsonRequest("/api/roster/bulk", "DELETE", {
      ids: created.records.map((record) => record.id)
    }, adminCookie));
    const deleted = await deleteResponse.json() as { count: number };
    expect(deleteResponse.status).toBe(200);
    expect(deleted.count).toBe(2);

    const baseResponse = await app.handle(jsonRequest("/api/roster/bulk", "POST", {
      assignments: [{ employeeId, assignmentDate: "2026-09-07", assignmentType: "REGULAR", scheduleTemplateId: steadyDayTemplateId }],
      replaceBaseSchedule: true
    }, adminCookie));
    expect(baseResponse.status).toBe(200);
    const replacementResponse = await app.handle(jsonRequest("/api/roster/bulk", "POST", {
      assignments: [{ employeeId, assignmentDate: "2026-09-07", assignmentType: "OFF" }],
      replaceBaseSchedule: true
    }, adminCookie));
    const replacement = await replacementResponse.json() as { records: Array<{ id: string }> };
    expect(replacementResponse.status).toBe(200);
    const replacedRosterResponse = await app.handle(jsonRequest(`/api/roster?from=2026-09-07&to=2026-09-07&employeeId=${employeeId}`, "GET", undefined, adminCookie));
    const replacedRoster = await replacedRosterResponse.json() as { records: Array<{ assignmentType: string }> };
    expect(replacedRoster.records).toHaveLength(1);
    expect(replacedRoster.records[0]?.assignmentType).toBe("OFF");
    await app.handle(jsonRequest("/api/roster/bulk", "DELETE", { ids: [replacement.records[0]!.id] }, adminCookie));
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
    const payload = await dailyResponse.json() as { records: Array<{ scheduleCode: string; checkInAt: string | null; checkOutAt: string | null; scanCount: number; overtimeMinutes: number; autoStatus: string }> };
    expect(dailyResponse.status).toBe(200);
    expect(payload.records[0]?.scheduleCode).toBe("SHIFT_MALAM");
    expect(payload.records[0]?.checkInAt).toBe("2026-09-01 17:55:00");
    expect(payload.records[0]?.checkOutAt).toBe("2026-09-02 06:20:00");
    expect(payload.records[0]?.scanCount).toBe(2);
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
    const dailyPayload = await dailyResponse.json() as { records: Array<{ attendanceDate: string; autoStatus: string; overtimeMinutes: number; notes: string[] }> };
    expect(dailyResponse.status).toBe(200);
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-30")?.autoStatus).toBe("OVERTIME");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-28")?.autoStatus).toBe("ABSENT");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-31")?.autoStatus).toBe("OVERTIME");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-31")?.overtimeMinutes).toBe(30);
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-09-01")?.autoStatus).toBe("NEEDS_REVIEW");
    expect(dailyPayload.records.find((record) => record.attendanceDate === "2026-08-28")?.notes[0]).toBe("Tidak absen masuk dan pulang");
    expect(dailyPayload.records.every((record) => Boolean(record.notes[0]))).toBe(true);

    const confirmationResponse = await app.handle(jsonRequest(`/api/attendance/daily/${employeeId}/2026-08-30/confirm`, "PATCH", {
      status: "OVERTIME",
      note: "Disetujui supervisor"
    }, adminCookie));
    const confirmation = await confirmationResponse.json() as { confirmationState: string; confirmationNote: string | null; confirmedByName: string | null; confirmedAt: string | null };
    expect(confirmationResponse.status).toBe(200);
    expect(confirmation.confirmationState).toBe("CONFIRMED");
    expect(confirmation.confirmationNote).toBe("Disetujui supervisor");
    expect(confirmation.confirmedByName).toBe("Administrator Uji");
    expect(Boolean(confirmation.confirmedAt)).toBe(true);

    const batchResponse = await app.handle(jsonRequest("/api/attendance/daily/batch-confirm", "POST", {
      items: [{
        employeeId,
        attendanceDate: "2026-08-31",
        status: "PRESENT",
        note: "Konfirmasi masal admin"
      }]
    }, adminCookie));
    expect(batchResponse.status).toBe(200);
    const batchData = await batchResponse.json() as { success: boolean; count: number };
    expect(batchData.success).toBe(true);
    expect(batchData.count).toBe(1);
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

  test("serves a sanitized attendance display without requiring login", async () => {
    const response = await app.handle(jsonRequest("/api/public/attendance-display", "GET"));
    const payload = await response.json() as {
      date: string;
      timeZone: string;
      summary: { totalScans: number; totalEmployees: number };
      records: Array<{ eventType: string; departmentName: string | null }>;
    };
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(payload.timeZone).toBe("Asia/Makassar");
    expect(payload.summary.totalScans).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.records)).toBe(true);
    expect(payload.records.every((record) => ["IN", "OUT", "SCAN"].includes(record.eventType))).toBe(true);
    expect(serialized).not.toContain("deviceSerial");
    expect(serialized).not.toContain("employeeCode");
    expect(serialized).not.toContain("rawLine");
  });

  test("labels public display scans as masuk and keluar from the evaluated work schedule", async () => {
    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "PUBLIC-DISPLAY-001",
      name: "Karyawan Layar Publik",
      siteId: "site-default",
      deviceMappings: [{ deviceSerial: "X105-PUBLIC-DISPLAY", deviceUserCode: "8801" }]
    }, adminCookie));
    const employee = await employeeResponse.json() as { id: number };
    expect(employeeResponse.status).toBe(201);

    const profileResponse = await app.handle(jsonRequest(`/api/schedule-profiles/${employee.id}`, "PUT", {
      scheduleTemplateId: steadyDayTemplateId,
      workdays: [1, 2, 3, 4, 5, 6, 7],
      autoWeekendOvertime: true,
      overtimeBufferMinutes: 15
    }, adminCookie));
    expect(profileResponse.status).toBe(200);

    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Makassar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-PUBLIC-DISPLAY&table=ATTLOG", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: `8801\t${date} 07:55:00\t0\t1\n8801\t${date} 17:05:00\t0\t1`
    }));
    expect(uploadResponse.status).toBe(200);

    const displayResponse = await app.handle(jsonRequest("/api/public/attendance-display", "GET"));
    const display = await displayResponse.json() as {
      records: Array<{ employeeName: string; departmentName: string | null; eventType: string; note: string }>;
    };
    const employeeScans = display.records.filter((record) => record.employeeName === "Karyawan Layar Publik");
    expect(employeeScans.map((record) => record.eventType)).toEqual(["OUT", "IN"]);
    expect(employeeScans.map((record) => record.note)).toEqual(["Pulang sesuai jadwal", "Masuk tepat waktu"]);
    expect(employeeScans.every((record) => Object.hasOwn(record, "departmentName"))).toBe(true);
  });

  test("creates, lists, and approves leave requests while synchronizing roster", async () => {
    const listEmployeesResponse = await app.handle(jsonRequest("/api/employees", "GET", undefined, adminCookie));
    const employeePayload = await listEmployeesResponse.json() as { records: Array<{ id: number; employeeCode: string }> };
    const emp = employeePayload.records[0]!;

    const createLeaveResponse = await app.handle(jsonRequest("/api/leave", "POST", {
      employeeId: emp.id,
      leaveType: "ANNUAL",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
      reason: "Cuti tahunan keluarga",
      status: "APPROVED"
    }, adminCookie));
    expect(createLeaveResponse.status).toBe(201);
    const leaveData = await createLeaveResponse.json() as { id: string; totalDays: number; status: string };
    expect(leaveData.totalDays).toBe(3);
    expect(leaveData.status).toBe("APPROVED");

    const listLeaveResponse = await app.handle(jsonRequest("/api/leave", "GET", undefined, adminCookie));
    const leaveList = await listLeaveResponse.json() as { records: Array<{ id: string; reason: string }> };
    expect(listLeaveResponse.status).toBe(200);
    expect(leaveList.records.some((r) => r.id === leaveData.id)).toBe(true);

    const rosterResponse = await app.handle(jsonRequest(`/api/roster?from=2026-09-10&to=2026-09-12&employeeId=${emp.id}`, "GET", undefined, adminCookie));
    const rosterList = await rosterResponse.json() as { records: Array<{ assignmentDate: string; assignmentType: string }> };
    expect(rosterList.records.filter((r) => r.assignmentType === "LEAVE").length).toBe(3);
  });

  test("treats morning checkout scan from previous night shift as checkout and keeps current OFF day as OFF without false check-in", async () => {
    const departmentResponse = await app.handle(jsonRequest("/api/departments", "POST", {
      siteId: "site-default",
      code: "NIGHT-OFF",
      name: "Night Shift Roster"
    }, adminCookie));
    const department = await departmentResponse.json() as { id: string };

    const employeeResponse = await app.handle(jsonRequest("/api/employees", "POST", {
      employeeCode: "EMP-CREW-A-NIGHT",
      name: "Crew A Night Worker",
      siteId: "site-default",
      departmentId: department.id,
      deviceMappings: [{ deviceSerial: "X105-NIGHT-TEST", deviceUserCode: "crew-a-pin" }]
    }, adminCookie));
    const employee = await employeeResponse.json() as { id: number };

    // Set work mode to Crew A roster (2026-09-03 is Shift Malam, 2026-09-04 is OFF)
    await app.handle(jsonRequest(`/api/employee-work-modes/${employee.id}`, "PUT", {
      mode: "ROSTER",
      rosterGroup: "Crew A"
    }, adminCookie));

    // Upload check-in on 2026-09-03 at 18:00 and check-out on 2026-09-04 at 06:06
    const uploadResponse = await app.handle(new Request("http://localhost/iclock/cdata?SN=X105-NIGHT-TEST&table=ATTLOG", {
      method: "POST",
      body: [
        "crew-a-pin\t2026-09-03 18:00:00\t0\t1",
        "crew-a-pin\t2026-09-04 06:06:00\t0\t1"
      ].join("\n")
    }));
    expect(uploadResponse.status).toBe(200);

    // Check attendance for 2026-09-03 (Night shift)
    const nightShiftResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-09-03&to=2026-09-03&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const nightPayload = await nightShiftResponse.json() as { records: Array<{ autoStatus: string; checkInAt: string | null; checkOutAt: string | null }> };
    expect(nightPayload.records[0]?.autoStatus).toBe("PRESENT");
    expect(nightPayload.records[0]?.checkInAt).toBe("2026-09-03 18:00:00");
    expect(nightPayload.records[0]?.checkOutAt).toBe("2026-09-04 06:06:00");

    // Check attendance for 2026-09-04 (OFF day)
    const offDayResponse = await app.handle(jsonRequest(`/api/attendance/daily?from=2026-09-04&to=2026-09-04&employeeId=${employee.id}`, "GET", undefined, adminCookie));
    const offPayload = await offDayResponse.json() as { records: Array<{ autoStatus: string; checkInAt: string | null; checkOutAt: string | null }> };
    expect(offPayload.records[0]?.autoStatus).toBe("OFF");
    expect(offPayload.records[0]?.checkInAt).toBeNull();
    expect(offPayload.records[0]?.checkOutAt).toBeNull();
  });
});
