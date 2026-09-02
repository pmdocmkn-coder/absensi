CREATE TABLE employee_schedule_profiles (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  schedule_template_id TEXT NOT NULL REFERENCES schedule_templates(id),
  workdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  auto_weekend_overtime INTEGER NOT NULL DEFAULT 1 CHECK (auto_weekend_overtime IN (0, 1)),
  overtime_buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (overtime_buffer_minutes >= 0 AND overtime_buffer_minutes <= 240),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attendance_evaluations (
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  auto_status TEXT NOT NULL CHECK (auto_status IN ('PRESENT', 'LATE', 'OVERTIME', 'ON_CALL', 'OFF', 'LEAVE', 'ABSENT', 'PENDING', 'NEEDS_REVIEW', 'NO_SCHEDULE')),
  confirmed_status TEXT CHECK (confirmed_status IN ('PRESENT', 'LATE', 'OVERTIME', 'ON_CALL', 'OFF', 'LEAVE', 'ABSENT', 'NEEDS_REVIEW')),
  check_in_at TEXT,
  check_out_at TEXT,
  scheduled_start_at TEXT,
  scheduled_end_at TEXT,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  confirmation_note TEXT,
  confirmed_by_employee_id INTEGER REFERENCES employees(id),
  confirmed_at TEXT,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (employee_id, attendance_date)
);

CREATE INDEX attendance_logs_device_user_time_idx
  ON attendance_logs(device_serial, employee_code, recorded_at);
CREATE INDEX attendance_evaluations_date_idx ON attendance_evaluations(attendance_date);
CREATE INDEX attendance_evaluations_status_idx ON attendance_evaluations(auto_status, confirmed_status);
