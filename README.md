# AbsenKita - Solution X105 Attendance

Aplikasi absensi full TypeScript untuk menerima scan Solution X105 melalui ADMS, memetakan PIN perangkat ke karyawan, serta menyiapkan pengolahan roster dan status kehadiran.

## Isi proyek

- `apps/api`: receiver ADMS, REST API, autentikasi, dan SQLite berbasis Bun + Elysia + Drizzle.
- `apps/web`: dashboard Next.js bertema Neo-Brutalism.
- Mesin evaluasi harian: mengubah roster, profil kerja, dan scan X105 menjadi status otomatis yang tetap dapat dikonfirmasi admin.
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
- `GET/POST/PATCH /api/schedule-templates`
- `GET/POST/PATCH/DELETE /api/roster`
- `GET /api/attendance`
- `GET /api/attendance/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`: hasil status harian. Karyawan hanya melihat miliknya sendiri.
- `GET /api/schedule-profiles`, `PUT /api/schedule-profiles/:employeeId`: profil kerja reguler untuk Steady Day.
- `PATCH /api/attendance/daily/:employeeId/:date/confirm`: konfirmasi atau koreksi status oleh admin.

## Urutan konfigurasi admin pertama

1. Jalankan `seed:admin`, kemudian masuk melalui `/login`.
2. Buka **Pengaturan jam** dan buat template sesuai kebijakan perusahaan, misalnya `STEADY_DAY`, `SHIFT_PAGI`, dan `SHIFT_MALAM`. Jam tidak diisi otomatis agar tidak salah dengan aturan perusahaan Anda.
3. Buka **Data karyawan** untuk memeriksa mapping PIN dan alat X105. Lengkapi departemen serta mapping melalui API atau impor master data.
4. Untuk karyawan **Steady Day**, buka **Data karyawan**, pilih template regulernya, lalu tekan **Tetapkan**. Nilai awalnya Senin–Jumat, buffer lembur 15 menit, dan scan Sabtu/Minggu otomatis ditandai lembur. Roster harian selalu mengalahkan profil ini.
5. Buka **Kalender roster** untuk menambahkan jadwal reguler. Tambahkan `ON_CALL` atau `OVERTIME` sebagai overlay bila diperlukan. Untuk `OFF` dan `LEAVE`, pilih tanpa template.
6. Buka **Verifikasi absensi**. Sistem menampilkan hasil otomatis; admin cukup mengonfirmasi atau mengubah kasus seperti scan saat cuti/off, scan tanpa jadwal, dan lembur/on-call khusus.

### Aturan otomatis saat ini

- Shift Pagi, Shift Malam, dan Steady Day memakai template jam yang dipilih di roster. Shift malam dapat diberi tanda **selesai hari berikutnya**.
- Scan pertama adalah kandidat masuk; scan terakhir adalah kandidat keluar. Kedatangan melewati `toleransi terlambat` dihitung dalam menit.
- Scan sebelum atau sesudah jam template lebih dari `buffer lembur` menjadi `OVERTIME` otomatis.
- Roster `OFF`/`LEAVE` tanpa scan menjadi status tersebut. Jika tetap ada scan, hasilnya `NEEDS_REVIEW` agar admin tidak kehilangan kasus penting.
- `ON_CALL` merupakan overlay: layar menampilkan badge on-call bersama hasil hadir/terlambat/lembur. Jika hanya ada on-call tanpa jadwal reguler dan terdapat scan, hasil utamanya `ON_CALL`.

## Pemeriksaan proyek

```powershell
bun run typecheck
bun --filter @attendance/api test
```

## Roadmap berikutnya

1. Layar edit master karyawan dan impor data massal dari dashboard.
2. Pengajuan dan persetujuan cuti.
3. Monitoring perangkat, cursor ADMS, serta rekonsiliasi backlog.
4. Laporan periode dan ekspor payroll.
