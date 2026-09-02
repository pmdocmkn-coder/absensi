import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "./migrate";

function temporaryDatabase() {
  return new Database(":memory:");
}

describe("database migrations", () => {
  test("migrates an empty database and can run twice", () => {
    const database = temporaryDatabase();
    const firstRun = runMigrations(database);
    const secondRun = runMigrations(database);

    expect(firstRun.map((migration) => migration.version)).toEqual([1, 2, 3, 4]);
    expect(secondRun).toEqual([]);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM sites").get()?.count).toBe(1);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM schema_migrations").get()?.count).toBe(4);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM schedule_templates").get()?.count).toBe(0);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM roster_assignments").get()?.count).toBe(0);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM employee_schedule_profiles").get()?.count).toBe(0);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM attendance_evaluations").get()?.count).toBe(0);
    database.close();
  });

  test("preserves legacy employees, device mappings, and attendance logs", () => {
    const database = temporaryDatabase();
    database.exec(`
      CREATE TABLE employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_serial TEXT NOT NULL,
        employee_code TEXT NOT NULL,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(device_serial, employee_code)
      );
      CREATE TABLE attendance_logs (
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
      INSERT INTO employees (device_serial, employee_code, name, updated_at)
      VALUES ('X105-TEST-01', '1001', 'Karyawan Uji', '2026-09-02T00:00:00.000Z');
      INSERT INTO attendance_logs (
        device_serial, employee_code, recorded_at, attendance_status,
        verification_type, work_code, raw_line, received_at
      ) VALUES (
        'X105-TEST-01', '1001', '2026-09-02 08:00:00', 0,
        1, NULL, 'fixture', '2026-09-02T00:00:01.000Z'
      );
    `);

    runMigrations(database);

    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM employees").get()?.count).toBe(1);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM device_users").get()?.count).toBe(1);
    expect(database.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM attendance_logs").get()?.count).toBe(1);
    expect(database.query<{ role: string }, []>("SELECT role FROM employees").get()?.role).toBe("EMPLOYEE");
    database.close();
  });
});
