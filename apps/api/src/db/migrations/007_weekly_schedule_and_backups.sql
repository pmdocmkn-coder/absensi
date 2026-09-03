ALTER TABLE employee_schedule_profiles
  ADD COLUMN weekly_template_ids_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE roster_backup_assignments (
  id TEXT PRIMARY KEY,
  covered_employee_id INTEGER NOT NULL REFERENCES employees(id),
  backup_employee_id INTEGER NOT NULL REFERENCES employees(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('LEAVE', 'SICK', 'PERMISSION', 'TRAINING', 'OUT_OF_OFFICE', 'STAFFING', 'OTHER')),
  reason_details TEXT,
  notes TEXT,
  created_by_employee_id INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (covered_employee_id <> backup_employee_id),
  CHECK (start_date <= end_date)
);

CREATE INDEX roster_backup_assignments_covered_idx ON roster_backup_assignments(covered_employee_id);
CREATE INDEX roster_backup_assignments_backup_idx ON roster_backup_assignments(backup_employee_id);
CREATE INDEX roster_backup_assignments_dates_idx ON roster_backup_assignments(start_date, end_date);
