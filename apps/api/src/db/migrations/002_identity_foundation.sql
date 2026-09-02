CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO sites (id, code, name, timezone, is_active, created_at, updated_at)
VALUES (
  'site-default',
  'SGT',
  'Site Sangatta',
  'Asia/Makassar',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  code TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(site_id, code)
);

ALTER TABLE employees RENAME TO employees_legacy;

CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT UNIQUE COLLATE NOCASE,
  site_id TEXT REFERENCES sites(id),
  department_id TEXT REFERENCES departments(id),
  role TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'SUPERVISOR', 'ADMIN')),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO employees (
  employee_code, name, site_id, role, is_active, created_at, updated_at
)
SELECT
  employee_code,
  MAX(name),
  'site-default',
  'EMPLOYEE',
  1,
  MIN(updated_at),
  MAX(updated_at)
FROM employees_legacy
GROUP BY employee_code;

CREATE TABLE device_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  device_serial TEXT NOT NULL,
  device_user_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ADMS',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(device_serial, device_user_code)
);

INSERT INTO device_users (
  employee_id, device_serial, device_user_code, source, created_at, updated_at
)
SELECT
  employee.id,
  legacy.device_serial,
  legacy.employee_code,
  'MIGRATION',
  legacy.updated_at,
  legacy.updated_at
FROM employees_legacy AS legacy
JOIN employees AS employee ON employee.employee_code = legacy.employee_code;

DROP TABLE employees_legacy;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX employees_site_idx ON employees(site_id);
CREATE INDEX employees_department_idx ON employees(department_id);
CREATE INDEX device_users_employee_idx ON device_users(employee_id);
CREATE INDEX sessions_employee_idx ON sessions(employee_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
