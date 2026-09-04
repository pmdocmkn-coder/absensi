import type { DeviceEvent } from "./types";
import { sqlite } from "./db/connection";

const insertAttendance = sqlite.prepare(`
  INSERT INTO attendance_logs (
    device_serial, employee_code, recorded_at, attendance_status,
    verification_type, work_code, raw_line, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_serial, employee_code, recorded_at) DO UPDATE SET
    attendance_status = COALESCE(excluded.attendance_status, attendance_logs.attendance_status),
    verification_type = COALESCE(excluded.verification_type, attendance_logs.verification_type),
    work_code = COALESCE(excluded.work_code, attendance_logs.work_code),
    raw_line = excluded.raw_line,
    received_at = excluded.received_at
`);

const findDeviceUser = sqlite.prepare<{ employeeId: number }, [string, string]>(`
  SELECT employee_id AS employeeId
  FROM device_users
  WHERE device_serial = ? AND device_user_code = ?
`);

const findEmployeeByCode = sqlite.prepare<{ id: number }, [string]>(`
  SELECT id FROM employees WHERE employee_code = ? COLLATE NOCASE
`);

const insertEmployee = sqlite.prepare(`
  INSERT INTO employees (
    employee_code, name, site_id, role, is_active, created_at, updated_at
  ) VALUES (?, ?, 'site-default', 'EMPLOYEE', 1, ?, ?)
`);

const updateEmployeeName = sqlite.prepare(`
  UPDATE employees SET name = ?, updated_at = ? WHERE id = ?
`);

const insertDeviceUser = sqlite.prepare(`
  INSERT INTO device_users (
    employee_id, device_serial, device_user_code, source, created_at, updated_at
  ) VALUES (?, ?, ?, 'ADMS', ?, ?)
  ON CONFLICT(device_serial, device_user_code) DO UPDATE SET
    employee_id = excluded.employee_id,
    updated_at = excluded.updated_at
`);

function upsertDeviceEmployee(deviceSerial: string, employeeCode: string, name: string, updatedAt: string) {
  const mapped = findDeviceUser.get(deviceSerial, employeeCode);
  if (mapped) {
    updateEmployeeName.run(name, updatedAt, mapped.employeeId);
    return mapped.employeeId;
  }

  const existing = findEmployeeByCode.get(employeeCode);
  const employeeId = existing?.id ?? Number(insertEmployee.run(employeeCode, name, updatedAt, updatedAt).lastInsertRowid);
  if (existing) updateEmployeeName.run(name, updatedAt, employeeId);
  insertDeviceUser.run(employeeId, deviceSerial, employeeCode, updatedAt, updatedAt);
  return employeeId;
}

const insertAttendanceBatch = sqlite.transaction((events: DeviceEvent[]) => {
  for (const event of events) {
    if (!event.deviceSerial || !event.employeeCode) continue;

    if (event.query.table === "ATTLOG" && event.recordedAt) {
      const columns = event.body.split("\t");
      insertAttendance.run(
        event.deviceSerial,
        event.employeeCode,
        event.recordedAt,
        event.attendanceStatus,
        event.verificationType,
        columns[4] || null,
        event.body,
        event.receivedAt
      );
    }

    if (event.query.table === "OPERLOG" && event.body.startsWith("USER ")) {
      const name = event.body.match(/(?:^|\t)Name=([^\t]*)/)?.[1]?.trim();
      if (name) upsertDeviceEmployee(event.deviceSerial, event.employeeCode, name, event.receivedAt);
    }
  }
});

export function persistDeviceEvents(events: DeviceEvent[]) {
  insertAttendanceBatch(events);
}

export function getAttendanceCount() {
  return sqlite.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM attendance_logs").get()?.count ?? 0;
}

const attendanceSelect = `
  SELECT
    attendance.id,
    attendance.device_serial AS deviceSerial,
    attendance.employee_code AS employeeCode,
    employee.name AS employeeName,
    department.name AS departmentName,
    site.name AS siteName,
    attendance.recorded_at AS recordedAt,
    attendance.attendance_status AS attendanceStatus,
    attendance.verification_type AS verificationType,
    attendance.work_code AS workCode,
    attendance.received_at AS receivedAt
  FROM attendance_logs AS attendance
  LEFT JOIN device_users AS device_user
    ON device_user.device_serial = attendance.device_serial
    AND device_user.device_user_code = attendance.employee_code
  LEFT JOIN employees AS employee ON employee.id = device_user.employee_id
  LEFT JOIN departments AS department ON department.id = employee.department_id
  LEFT JOIN sites AS site ON site.id = employee.site_id
`;

export function getRecentAttendance(limit = 100) {
  return sqlite.query(`
    ${attendanceSelect}
    ORDER BY attendance.recorded_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 500));
}

export function getAttendanceByRange(from: string, to: string, limit = 500) {
  return sqlite.query(`
    ${attendanceSelect}
    WHERE attendance.recorded_at >= ? AND attendance.recorded_at < ?
    ORDER BY attendance.recorded_at DESC
    LIMIT ?
  `).all(from, to, Math.min(Math.max(limit, 1), 5000));
}

type PublicAttendanceRecord = {
  employeeId: number;
  employeeName: string;
  departmentName: string | null;
  siteName: string | null;
  recordedAt: string;
};

type PublicAttendanceSummary = {
  totalScans: number;
  totalEmployees: number;
};

/**
 * Read model for the shared attendance screen. It deliberately leaves out
 * employee codes, device serials, log ids, and raw device payloads because
 * this endpoint is available without a login.
 */
export function getPublicAttendanceDisplay(from: string, to: string, limit = 10) {
  const records = sqlite.query<PublicAttendanceRecord, [string, string, number]>(`
    SELECT
      employee.id AS employeeId,
      employee.name AS employeeName,
      department.name AS departmentName,
      site.name AS siteName,
      attendance.recorded_at AS recordedAt
    FROM attendance_logs AS attendance
    INNER JOIN device_users AS device_user
      ON device_user.device_serial = attendance.device_serial
      AND device_user.device_user_code = attendance.employee_code
    INNER JOIN employees AS employee
      ON employee.id = device_user.employee_id
      AND employee.is_active = 1
    LEFT JOIN departments AS department ON department.id = employee.department_id
    LEFT JOIN sites AS site ON site.id = employee.site_id
    WHERE attendance.recorded_at >= ? AND attendance.recorded_at < ?
    ORDER BY attendance.recorded_at DESC
    LIMIT ?
  `).all(from, to, Math.min(Math.max(limit, 1), 12));

  const summary = sqlite.query<PublicAttendanceSummary, [string, string]>(`
    SELECT
      COUNT(*) AS totalScans,
      COUNT(DISTINCT employee.id) AS totalEmployees
    FROM attendance_logs AS attendance
    INNER JOIN device_users AS device_user
      ON device_user.device_serial = attendance.device_serial
      AND device_user.device_user_code = attendance.employee_code
    INNER JOIN employees AS employee
      ON employee.id = device_user.employee_id
      AND employee.is_active = 1
    WHERE attendance.recorded_at >= ? AND attendance.recorded_at < ?
  `).get(from, to) ?? { totalScans: 0, totalEmployees: 0 };

  return { records, summary };
}

export function getAttendanceCountByRange(from: string, to: string) {
  return sqlite.query<{ count: number }, [string, string]>(`
    SELECT COUNT(*) AS count FROM attendance_logs
    WHERE recorded_at >= ? AND recorded_at < ?
  `).get(from, to)?.count ?? 0;
}

const findEmployeeName = sqlite.prepare<{ name: string }, [string, string]>(`
  SELECT employee.name
  FROM device_users AS device_user
  JOIN employees AS employee ON employee.id = device_user.employee_id
  WHERE device_user.device_serial = ? AND device_user.device_user_code = ?
`);

export function enrichEventsWithEmployeeNames(events: DeviceEvent[]) {
  return events.map((event) => ({
    ...event,
    employeeName: event.deviceSerial && event.employeeCode
      ? findEmployeeName.get(event.deviceSerial, event.employeeCode)?.name ?? null
      : null
  }));
}

export function getAttendanceRange() {
  return sqlite.query<{ oldest: string | null; newest: string | null; count: number }, []>(`
    SELECT MIN(recorded_at) AS oldest, MAX(recorded_at) AS newest, COUNT(*) AS count
    FROM attendance_logs
  `).get() ?? { oldest: null, newest: null, count: 0 };
}
