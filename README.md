# AbsenKita - Solution X105 Attendance

Aplikasi absensi full TypeScript untuk menerima scan Solution X105 melalui ADMS, memetakan PIN perangkat ke karyawan, serta menyiapkan pengolahan roster dan status kehadiran.

## Isi proyek

- `apps/api`: receiver ADMS, REST API, autentikasi, dan SQLite berbasis Bun + Elysia + Drizzle.
- `apps/web`: dashboard Next.js bertema Neo-Brutalism.
- `apps/api/src/simulator.ts`: simulator scan untuk tes tanpa mesin.
- `apps/api/src/db/migrations`: migrasi database yang berurutan dan aman dijalankan ulang.

## Persiapan

Instal Bun di Windows:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Tutup dan buka terminal, lalu verifikasi dengan `bun --version`.

## Menjalankan lokal

```powershell
cd attendance-app
Copy-Item .env.example .env
bun install
bun --filter @attendance/api db:migrate
bun run dev
```

API menerima scan X105 tanpa login, tetapi dashboard dan data karyawan dilindungi sesi. Buat akun admin pertama dari PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@perusahaan.com"
$env:ADMIN_PASSWORD="GantiDenganPasswordKuat123!"
$env:ADMIN_NAME="Administrator"
$env:ADMIN_CODE="ADMIN001"
bun --filter @attendance/api seed:admin
```

Buka `http://localhost:3000/login`, lalu masuk dengan email dan password tersebut. API health tersedia di `http://localhost:8080/health`.

Kirim scan simulasi dari terminal lain:

```powershell
bun run simulate
```

Gunakan ID tertentu:

```powershell
bun --filter @attendance/api simulate 1002
```

## Menguji dengan X105 di LAN

1. Cari IPv4 komputer dengan `ipconfig`.
2. Pastikan `http://IP-KOMPUTER:8080/health` bisa dibuka dari perangkat lain.
3. Izinkan TCP port 8080 di Windows Firewall.
4. Pada X105 buka `M/OK > Comm. > Cloud Server Setting / ADMS`.
5. Aktifkan server, isi IP komputer dan port `8080`, lalu matikan Proxy dan HTTPS untuk uji LAN.
6. Lakukan satu scan dan lihat terminal API serta dashboard.

Perintah firewall, dijalankan pada PowerShell Administrator:

```powershell
New-NetFirewallRule -DisplayName "X105 ADMS Receiver" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

## Catatan firmware

Endpoint `/iclock/*` menangkap keluarga protokol push/ADMS yang umum. Endpoint `/device/*` menjadi fallback diagnostik. Respons atau rute mungkin perlu disesuaikan setelah request asli firmware X105 diterima.

## Data dan keamanan

- Database lokal berada di `data/attendance.sqlite` dan tidak masuk Git.
- Migrasi tidak menghapus log presensi lama. Sebelum perubahan besar, tetap salin folder `data` sebagai backup.
- PIN karyawan dapat berbeda di setiap alat. Relasinya disimpan di tabel `device_users`.
- Role yang tersedia: `EMPLOYEE`, `SUPERVISOR`, dan `ADMIN`.
- Password disimpan sebagai hash. Token sesi disimpan sebagai hash dan cookie browser bersifat HttpOnly.
- Endpoint ADMS tetap terbuka di LAN agar X105 dapat mengirim data. Batasi port 8080 melalui firewall hanya ke jaringan/perangkat yang diperlukan saat deployment.

## Endpoint fondasi

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET/POST/PATCH /api/sites`
- `GET/POST/PATCH /api/departments`
- `GET/POST/PATCH /api/employees`
- `POST /api/employees/import`
- `GET /api/attendance`

## Pemeriksaan proyek

```powershell
bun run typecheck
bun --filter @attendance/api test
```

## Roadmap berikutnya

1. CRUD karyawan pada dashboard admin dan impor data massal.
2. Template jam `SHIFT_PAGI`, `SHIFT_MALAM`, dan `STEADY_DAY`.
3. Kalender roster terpadu untuk reguler, on-call, cuti, lembur, dan off.
4. Mesin aturan harian untuk menentukan check-in, check-out, terlambat, hadir, alfa, dan konflik jadwal.
5. Monitoring perangkat, cursor ADMS, serta rekonsiliasi backlog.
