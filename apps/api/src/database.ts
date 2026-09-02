import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DeviceEvent } from "./types";

const defaultPath = resolve(import.meta.dir, "../../../data/attendance.sqlite");
const databasePath = Bun.env.SQLITE_PATH ?? defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath, { create: true });
database.exec("PRAGMA journal_mode = WAL;");
database.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_serial TEXT NOT NULL,
    employee_code TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(device_serial, employee_code)
  );

  CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_serial TEXT NOT NULL,
    employee_code TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    attendance_status INTEGER,
    verification_type INTEGER,
    work_code TEXT,
    raw_line TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE(device_serial, employee_code, recorded_at, attendance_status, verification_type)
  );
`);

// A desktop MDB import and an ADMS backlog can contain the same scan with
// different raw status encodings. Treat device + employee + timestamp as the
// stable identity and retain the most recently received representation.
database.exec(`
  DELETE FROM attendance_logs
  WHERE id NOT IN (
    SELECT MAX(id)
    FROM attendance_logs
    GROUP BY device_serial, employee_code, recorded_at
  );

  CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_scan_identity
  ON attendance_logs(device_serial, employee_code, recorded_at);
`);

const insertAttendance = database.prepare(`
  INSERT OR IGNORE INTO attendance_logs (
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

const upsertEmployee = database.prepare(`
  INSERT INTO employees (device_serial, employee_code, name, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(device_serial, employee_code) DO UPDATE SET
    name = excluded.name,
    updated_at = excluded.updated_at
`);

const insertAttendanceBatch = database.transaction((events: DeviceEvent[]) => {
  for (const event of events) {
    if (!event.deviceSerial || !event.employeeCode) continue;

    if (event.query.table === "ATTLOG" && event.recordedAt) {
      const columns = event.body.split("\t");
      insertAttendance.run(event.deviceSerial, event.employeeCode, event.recordedAt, event.attendanceStatus, event.verificationType, columns[4] || null, event.body, event.receivedAt);
    }

    if (event.query.table === "OPERLOG" && event.body.startsWith("USER ")) {
      const name = event.body.match(/(?:^|\t)Name=([^\t]*)/)?.[1]?.trim();
      if (name) upsertEmployee.run(event.deviceSerial, event.employeeCode, name, event.receivedAt);
    }
  }
});

export function persistDeviceEvents(events: DeviceEvent[]) {
  insertAttendanceBatch(events);
}

export function getAttendanceCount() {
  return database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM attendance_logs").get()?.count ?? 0;
}

export function getRecentAttendance(limit = 100) {
  return database.query(`
    SELECT
      attendance.id,
      attendance.device_serial AS deviceSerial,
      attendance.employee_code AS employeeCode,
      employee.name AS employeeName,
      attendance.recorded_at AS recordedAt,
      attendance.attendance_status AS attendanceStatus,
      attendance.verification_type AS verificationType,
      attendance.work_code AS workCode,
      attendance.received_at AS receivedAt
    FROM attendance_logs AS attendance
    LEFT JOIN employees AS employee
      ON employee.device_serial = attendance.device_serial
      AND employee.employee_code = attendance.employee_code
    ORDER BY attendance.recorded_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 500));
}

export function getAttendanceByRange(from: string, to: string, limit = 500) {
  return database.query(`
    SELECT
      attendance.id,
      attendance.device_serial AS deviceSerial,
      attendance.employee_code AS employeeCode,
      employee.name AS employeeName,
      attendance.recorded_at AS recordedAt,
      attendance.attendance_status AS attendanceStatus,
      attendance.verification_type AS verificationType,
      attendance.work_code AS workCode,
      attendance.received_at AS receivedAt
    FROM attendance_logs AS attendance
    LEFT JOIN employees AS employee
      ON employee.device_serial = attendance.device_serial
      AND employee.employee_code = attendance.employee_code
    WHERE attendance.recorded_at >= ? AND attendance.recorded_at < ?
    ORDER BY attendance.recorded_at DESC
    LIMIT ?
  `).all(from, to, Math.min(Math.max(limit, 1), 5000));
}

export function getAttendanceCountByRange(from: string, to: string) {
  return database.query<{ count: number }, [string, string]>(`
    SELECT COUNT(*) AS count FROM attendance_logs
    WHERE recorded_at >= ? AND recorded_at < ?
  `).get(from, to)?.count ?? 0;
}

const findEmployeeName = database.prepare<{ name: string }, [string, string]>(`
  SELECT name FROM employees WHERE device_serial = ? AND employee_code = ?
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
  return database.query<{ oldest: string | null; newest: string | null; count: number }, []>(`
    SELECT MIN(recorded_at) AS oldest, MAX(recorded_at) AS newest, COUNT(*) AS count
    FROM attendance_logs
  `).get() ?? { oldest: null, newest: null, count: 0 };
}
