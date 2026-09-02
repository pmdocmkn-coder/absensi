# Rencana Implementasi

Dokumen ini ditulis agar satu junior programmer atau agen dapat mengambil satu task tanpa perlu menebak domain.

## Prinsip pengerjaan

1. Jangan mengubah `attendance_logs` mentah dari UI.
2. Semua mutasi domain mempunyai audit log.
3. Semua endpoint list memakai pagination dan filter server-side.
4. Semua tanggal kerja dihitung berdasarkan timezone site.
5. ACK ADMS hanya dikirim setelah database commit.
6. Satu pull request hanya mengerjakan satu vertical slice atau satu fondasi.
7. Setiap task harus menyertakan migration, API, UI bila relevan, test, dan dokumentasi.

## Arsitektur target

```text
Solution X105
  -> Elysia ADMS Receiver
  -> device_sync_batches
  -> raw_attendance_logs
  -> Attendance Rules Worker
  -> daily_attendance
  -> Elysia Application API
  -> Next.js Employee dan Admin UI
```

Database development dapat memakai SQLite untuk sementara. Semua schema baru harus dibuat melalui Drizzle migration dan kompatibel dengan PostgreSQL. Produksi memakai PostgreSQL.

## Schema target

### Organization

- `sites`
- `departments`
- `holidays`

### Identity

- `users`
- `sessions`
- `roles`
- `employees`
- `employee_device_mappings`

### Device ingestion

- `devices`
- `device_sync_batches`
- `raw_attendance_logs`
- `device_user_updates`
- `quarantined_device_payloads`

### Scheduling

- `work_patterns`
- `shift_templates`
- `employee_schedules`
- `oncall_assignments`
- `overtime_requests`
- `leave_requests`

### Attendance result

- `daily_attendance`
- `attendance_calculation_runs`
- `attendance_corrections`
- `audit_logs`
- `notifications`

## Milestone 0: Product dan design foundation

Tujuan: menyepakati UI dan domain sebelum membuat banyak route.

### M0.1 Design tokens

Task:

- Tambahkan token dari `DESIGN_SYSTEM.md`.
- Pasang font dengan `next/font`.
- Buat Button, Input, Select, Badge, Dialog, Drawer, Table shell, Skeleton, EmptyState, ErrorState.
- Buat Storybook hanya jika tim memang akan memeliharanya. Jika tidak, buat route `/dev/ui` yang hanya aktif di development.

Definition of done:

- Semua komponen mempunyai keyboard state.
- Tidak ada gradient atau soft shadow.
- Mobile 360 px dan desktop 1440 px diuji.

### M0.2 App shell dan routing

Task:

- Buat layout Employee dan Admin terpisah.
- Sidebar permission-aware.
- Breadcrumb, page header, topbar, user menu.
- Route placeholder memakai state nyata, bukan lorem ipsum.

Routes awal:

```text
/login
/app
/app/attendance
/app/leave
/app/schedule
/admin
/admin/roster
/admin/employees
/admin/time-settings
/admin/devices
```

## Milestone 1: Database dan identity foundation

### M1.1 Drizzle dan migration

Task:

- Pindahkan DDL inline dari `database.ts` ke migration.
- Tambahkan Drizzle schema.
- Buat migration dari SQLite proof of concept ke schema target.
- Jangan menjalankan `DELETE` dedup otomatis saat startup.

Tests:

- Fresh migration pada database kosong.
- Migration pada copy database yang sudah memiliki log.
- Roll-forward dijalankan dua kali tanpa error.

### M1.2 Employee, site, department

Task:

- CRUD site dan department.
- CRUD employee dengan soft-deactivate.
- Mapping employee ke device user.
- Import MDB menjadi command idempotent dengan report.

Endpoints minimum:

```text
GET    /api/employees
POST   /api/employees
GET    /api/employees/:id
PATCH  /api/employees/:id
POST   /api/employees/import
GET    /api/departments
GET    /api/sites
```

Tests:

- Duplicate employee code ditolak.
- Device mapping dapat lebih dari satu per employee.
- Employee nonaktif tetap muncul pada histori lama.

### M1.3 Authentication dan RBAC

Task:

- Login dan session.
- Role Employee, Supervisor, Admin.
- API policy middleware.
- Seed admin pertama melalui CLI, bukan public signup.

Tests:

- Matrix akses setiap role.
- Session expiry.
- Disabled user tidak dapat membuat session baru.

## Milestone 2: Hardening sinkronisasi fingerprint

Milestone ini prioritas tinggi dan harus selesai sebelum produksi.

### M2.1 Device registry

Task:

- Buat tabel `devices`.
- Seed perangkat memakai placeholder `X105-SITE-01`; serial asli dimasukkan melalui konfigurasi privat saat deployment.
- Tolak serial yang tidak terdaftar.
- Simpan `last_seen_at`, IP, firmware hints, timezone, dan status.

Acceptance:

- Unknown device menerima response aman dan masuk security log.
- Known device memperbarui heartbeat tanpa membuat attendance row.

### M2.2 Batch journal dan idempotency

Task:

- Setiap request POST mendapat batch ID dan body hash.
- Simpan metadata request tanpa menyimpan template biometrik.
- Parse attendance per row dalam transaction.
- Dedup key: organization, device, employee code, recorded time, dan event discriminator yang terbukti diperlukan.
- ACK jumlah row hanya setelah commit.

Tests:

- Payload sama dikirim 10 kali menghasilkan satu scan.
- Crash sebelum commit menyebabkan retry aman.
- Row rusak tidak menghilangkan row valid dalam batch yang sama sesuai kebijakan parser.

### M2.3 Quarantine dan observability

Task:

- Payload malformed masuk quarantine.
- Tambahkan structured logs tanpa fingerprint template.
- Metrics: request count, rows committed, duplicates, parse errors, ACK latency.
- API device health.

Endpoints:

```text
GET /api/admin/devices
GET /api/admin/devices/:id
GET /api/admin/devices/:id/batches
GET /api/admin/device-quarantine
```

### M2.4 Clock drift dan realtime proof

Task:

- Bandingkan recorded time dan received time hanya untuk scan baru, bukan backlog.
- Alert jika drift melewati threshold konfigurasi.
- Buat integration test simulator untuk heartbeat, backlog, duplicate, live scan, dan malformed batch.

Definition of done:

- Scan nyata muncul di raw log kurang dari 10 detik.
- Device offline terdeteksi dari `last_seen_at`.
- Tidak ada template sidik jari dalam log, database, atau error tracker.

## Milestone 3: Scheduling domain

### M3.1 Shift templates

Task:

- Template `STEADY_DAY`, `SHIFT_MORNING`, `SHIFT_NIGHT`.
- Jendela scan dan toleransi.
- Preview hasil aturan.
- Versioning template agar histori tidak berubah diam-diam.

Tests:

- Shift malam lintas tanggal.
- Toleransi terlambat.
- Scan terlalu awal atau terlalu akhir.

### M3.2 Employee schedules dan roster

Task:

- CRUD schedule per tanggal.
- Bulk assign.
- Conflict detection.
- Copy period.
- Recalculation queue untuk tanggal terdampak.

### M3.3 Leave, on-call, overtime

Task terpisah:

- Leave request dan approval.
- On-call assignment dan activation.
- Overtime candidate dan approval.
- Semua mempunyai state machine eksplisit dan audit.

## Milestone 4: Attendance rules engine

### M4.1 Daily calculator

Input:

- Employee
- Site timezone
- Schedule assignment
- Approved leave
- On-call assignment
- Overtime approval
- Raw scans dalam jendela tanggal kerja
- Active correction

Output:

- Base status
- Schedule kind
- Work context
- Punctuality
- Check-in
- Check-out
- Work minutes
- Late minutes
- Early leave minutes
- Overtime candidate minutes
- Explanation code

Algorithm minimum:

1. Resolve tanggal kerja dan timezone.
2. Resolve correction dan approved absence.
3. Resolve schedule.
4. Select eligible scans.
5. Determine first valid check-in dan last valid check-out.
6. Apply punctuality.
7. Detect on-call atau overtime candidate.
8. Store calculation version dan input fingerprint hash.

Tests wajib:

- Steady Day tepat waktu dan terlambat.
- Shift pagi.
- Shift malam lintas tanggal.
- Jadwal off tanpa scan.
- Jadwal off dengan scan.
- Cuti dengan scan anomali.
- On-call standby dan activated.
- Lupa check-out.
- Multiple scans.
- Schedule diubah setelah calculation.

### M4.2 Recalculation worker

Task:

- Queue per employee dan work date.
- Idempotent.
- Retry dengan backoff.
- Batch recalculation untuk perubahan roster massal.
- Progress dan error dapat dilihat Admin.

## Milestone 5: Employee UI

### M5.1 Employee dashboard

- Status hari ini.
- Jadwal hari ini.
- Waktu masuk dan keluar.
- Riwayat tujuh hari.
- Pengajuan aktif.

### M5.2 Absensi karyawan

- Table sesuai F02.
- Filter server-side.
- Detail drawer.
- Auto-refresh yang tidak mengganggu scroll.

### M5.3 Karyawan cuti

- Hari ini, mendatang, riwayat.
- Privacy filter.

## Milestone 6: Admin UI

### M6.1 Admin overview

- Hadir, terlambat, belum scan, off, cuti, on-call, review required.
- Device health.
- Approval queue.

### M6.2 Kalender roster terpadu

- Virtualized grid.
- Bulk assign.
- Conflict panel.
- Keyboard navigation.

### M6.3 Employee data dan time settings

- CRUD, import report, mapping device.
- Shift template editor dan preview.

### M6.4 Review queues

- On-call atau overtime review.
- Attendance correction.
- Unmapped device users.
- Quarantined device rows.

## Milestone 7: Reporting dan production readiness

### M7.1 Reports

- Daily dan monthly summary.
- CSV export.
- Filter parity dengan UI.

### M7.2 PostgreSQL migration

- Provision PostgreSQL.
- Dual-run import pada staging.
- Row count dan checksum verification.
- Cutover plan dan rollback plan.

### M7.3 Deployment

- API dijalankan sebagai Windows service, container, atau server Linux yang selalu aktif.
- Health check dan restart policy.
- Backup dan restore test.
- VPN antar-site atau TLS reverse proxy.
- Secrets di environment, tidak di Git.

## Urutan pull request yang disarankan

1. `chore/design-tokens-and-app-shell`
2. `refactor/drizzle-migrations`
3. `feat/sites-departments-employees`
4. `feat/auth-rbac`
5. `feat/device-registry`
6. `feat/adms-batch-journal`
7. `feat/device-observability`
8. `feat/shift-templates`
9. `feat/roster-scheduling`
10. `feat/leave-oncall-overtime-domain`
11. `feat/attendance-rules-engine`
12. `feat/employee-dashboard`
13. `feat/admin-roster`
14. `feat/review-queues`
15. `feat/reports-and-export`
16. `ops/postgres-and-deployment`

## Template task untuk junior atau agen

Gunakan format berikut untuk setiap task:

```text
Objective:
Satu hasil konkret.

Context:
File dan PRD section yang relevan.

Inputs:
Schema, endpoint, dan contoh data.

Required changes:
Daftar perubahan eksplisit.

Do not change:
Raw attendance semantics, unrelated routes, existing import behavior.

Acceptance criteria:
Daftar hasil yang dapat diuji.

Tests:
Unit, integration, dan manual verification.

Deliverables:
Migration, code, tests, dan docs.
```

## Definition of done global

- TypeScript strict lulus.
- Migration lulus pada database kosong dan database copy.
- Unit dan integration tests relevan lulus.
- Loading, empty, error, stale state tersedia.
- Authorization diuji di API, bukan hanya menyembunyikan tombol.
- Audit log dibuat untuk mutasi domain.
- Dokumentasi endpoint diperbarui.
- Tidak ada biometric template tersimpan.
- Tidak ada data dummy pada route production.
- Reviewer dapat memverifikasi acceptance criteria dari README task.
