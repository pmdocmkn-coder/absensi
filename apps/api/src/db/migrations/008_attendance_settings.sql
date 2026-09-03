CREATE TABLE attendance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  late_tolerance_minutes INTEGER NOT NULL DEFAULT 15 CHECK (late_tolerance_minutes BETWEEN 0 AND 240),
  early_leave_tolerance_minutes INTEGER NOT NULL DEFAULT 0 CHECK (early_leave_tolerance_minutes BETWEEN 0 AND 240),
  overtime_buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (overtime_buffer_minutes BETWEEN 0 AND 240),
  updated_at TEXT NOT NULL
);

INSERT INTO attendance_settings (
  id, late_tolerance_minutes, early_leave_tolerance_minutes, overtime_buffer_minutes, updated_at
) VALUES (1, 15, 0, 15, datetime('now'));
