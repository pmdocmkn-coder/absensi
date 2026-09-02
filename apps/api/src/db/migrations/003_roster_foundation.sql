CREATE TABLE schedule_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'REGULAR' CHECK (kind IN ('REGULAR', 'ON_CALL', 'OVERTIME')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0 AND grace_minutes <= 240),
  crosses_midnight INTEGER NOT NULL DEFAULT 0 CHECK (crosses_midnight IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE roster_assignments (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  assignment_date TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('REGULAR', 'OFF', 'LEAVE', 'ON_CALL', 'OVERTIME')),
  schedule_template_id TEXT REFERENCES schedule_templates(id),
  notes TEXT,
  created_by_employee_id INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(employee_id, assignment_date, assignment_type)
);

CREATE INDEX roster_assignments_date_idx ON roster_assignments(assignment_date);
CREATE INDEX roster_assignments_employee_date_idx ON roster_assignments(employee_id, assignment_date);
CREATE INDEX roster_assignments_template_idx ON roster_assignments(schedule_template_id);
