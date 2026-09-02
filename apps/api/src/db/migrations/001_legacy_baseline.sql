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

CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_scan_identity
ON attendance_logs(device_serial, employee_code, recorded_at);

CREATE INDEX IF NOT EXISTS attendance_logs_recorded_at_idx
ON attendance_logs(recorded_at);
