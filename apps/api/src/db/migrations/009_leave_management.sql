CREATE TABLE leave_requests (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'FAMILY', 'MATERNITY', 'SPECIAL')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by_employee_id INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX leave_requests_employee_idx ON leave_requests(employee_id);
CREATE INDEX leave_requests_dates_idx ON leave_requests(start_date, end_date);
CREATE INDEX leave_requests_status_idx ON leave_requests(status);
