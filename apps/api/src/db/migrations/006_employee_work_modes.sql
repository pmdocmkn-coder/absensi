CREATE TABLE employee_work_modes (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  mode TEXT NOT NULL DEFAULT 'NONE' CHECK (mode IN ('FIXED', 'ROSTER', 'NONE')),
  roster_group TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX employee_work_modes_mode_idx ON employee_work_modes(mode);
