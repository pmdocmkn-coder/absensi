INSERT OR IGNORE INTO schedule_templates (
  id, code, name, kind, start_time, end_time, grace_minutes,
  crosses_midnight, is_active, created_at, updated_at
) VALUES
  ('preset-steady-day', 'STEADY_DAY', 'Steady Day', 'REGULAR', '08:00', '17:00', 15, 0, 1, datetime('now'), datetime('now')),
  ('preset-shift-pagi', 'SHIFT_PAGI', 'Shift Pagi', 'REGULAR', '06:00', '18:00', 15, 0, 1, datetime('now'), datetime('now')),
  ('preset-shift-malam', 'SHIFT_MALAM', 'Shift Malam', 'REGULAR', '18:00', '06:00', 15, 1, 1, datetime('now'), datetime('now')),
  ('preset-drill', 'DRILL', 'Drill', 'REGULAR', '08:00', '17:00', 15, 0, 1, datetime('now'), datetime('now')),
  ('preset-mcr', 'MCR', 'MCR', 'REGULAR', '06:00', '17:00', 15, 0, 1, datetime('now'), datetime('now')),
  ('preset-adm-weekday', 'ADM_WEEKDAY', 'Administrasi Senin-Jumat', 'REGULAR', '08:00', '18:00', 15, 0, 1, datetime('now'), datetime('now')),
  ('preset-adm-saturday', 'ADM_SATURDAY', 'Administrasi Sabtu', 'REGULAR', '08:00', '12:00', 15, 0, 1, datetime('now'), datetime('now'));
