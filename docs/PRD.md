# PRD Sistem Absensi X105

Status: Draft v1  
Bahasa produk: Indonesia  
Platform: Web responsif  
Stack: Bun, ElysiaJS, Next.js, TypeScript, PostgreSQL

## 1. Ringkasan produk

Sistem menggabungkan log sidik jari Solution X105 dengan jadwal kerja yang dikonfigurasi melalui aplikasi. Perangkat hanya bertugas memverifikasi sidik jari dan mengirim log. Aplikasi menjadi sumber kebenaran untuk karyawan, departemen, steady day, shift pagi, shift malam, roster, cuti, on-call, lembur, koreksi, dan laporan.

## 2. Tujuan

1. Menampilkan kondisi kehadiran karyawan secara real-time.
2. Menghitung status dari jadwal dan scan tanpa bergantung pada tombol masuk atau pulang di perangkat.
3. Mengelola steady day, shift pagi, shift malam, off, cuti, on-call, dan lembur dari dashboard.
4. Menyediakan jejak audit untuk setiap koreksi manual.
5. Memastikan log perangkat tidak hilang, tidak ganda, dan dapat diproses ulang.
6. Mendukung site Sangatta dan Bengalon serta perangkat tambahan di masa depan.

## 3. Bukan tujuan versi pertama

- Penggajian penuh.
- Penyimpanan template sidik jari di aplikasi.
- Kontrol akses pintu.
- Aplikasi mobile native.
- Penggantian firmware X105.

## 4. Role dan hak akses

### Employee

- Melihat status kehadiran karyawan yang diizinkan sesuai kebijakan perusahaan.
- Melihat jadwal dan riwayat sendiri.
- Melihat daftar karyawan yang sedang cuti tanpa alasan medis pribadi.
- Mengajukan cuti, izin, koreksi, dan lembur bila fitur diaktifkan.

### Supervisor

- Semua akses Employee.
- Melihat departemen yang menjadi tanggung jawabnya.
- Meninjau koreksi, on-call, dan lembur tim.
- Menyetujui atau menolak sesuai alur persetujuan.

### Admin

- Mengelola seluruh master data, jadwal, aturan jam, cuti, on-call, lembur, perangkat, laporan, dan koreksi.
- Melihat audit log.

### System Device

- Identitas non-manusia untuk receiver ADMS.
- Hanya boleh mengirim heartbeat, user metadata yang aman, dan log absensi.

## 5. Model status

Status tidak disimpan sebagai satu label gabungan. Sistem menyimpan dimensi terpisah agar aturan tidak meledak menjadi puluhan status.

### Base status

- `PENDING`: Hari belum selesai dan scan belum lengkap.
- `PRESENT`: Ada kehadiran yang valid.
- `ABSENT`: Ada jadwal tetapi tidak ada scan setelah batas finalisasi.
- `OFF`: Tidak ada jadwal kerja.
- `LEAVE`: Cuti disetujui.
- `SICK`: Sakit disetujui.
- `PERMISSION`: Izin disetujui.

### Schedule kind

- `STEADY_DAY`: Pola kerja reguler tetap, bukan shift pagi.
- `SHIFT_MORNING`: Shift pagi dalam roster rotasi.
- `SHIFT_NIGHT`: Shift malam dalam roster rotasi dan dapat melewati tengah malam.
- `NONE`: Tidak memiliki jadwal.

### Work context

- `REGULAR`: Kerja sesuai jadwal.
- `ON_CALL`: Ditugaskan atau dikonfirmasi sebagai on-call.
- `OVERTIME`: Lembur disetujui.
- `REVIEW_REQUIRED`: Ada scan tanpa jadwal atau aturan tidak dapat menentukan konteks.

### Punctuality

- `ON_TIME`
- `LATE`
- `EARLY_LEAVE`
- `NOT_APPLICABLE`

### Label antarmuka

Label dibentuk dari kombinasi dimensi, contoh:

- Hadir tepat waktu, Steady Day
- Terlambat, Shift Pagi
- Hadir, Shift Malam
- Jadwal Off
- Sedang Cuti
- Sedang On Call
- Lembur
- Perlu Review: On Call atau Lembur

## 6. Aturan prioritas harian

Urutan keputusan:

1. Koreksi admin yang aktif.
2. Cuti, sakit, atau izin yang disetujui.
3. Penugasan on-call yang disetujui.
4. Jadwal steady day atau roster shift.
5. Hari libur perusahaan.
6. Scan tanpa jadwal menjadi `REVIEW_REQUIRED`.
7. Tidak ada jadwal dan tidak ada scan menjadi `OFF`.

Log mentah tidak pernah diedit. Perubahan jadwal atau approval memicu kalkulasi ulang ringkasan harian.

## 7. Information architecture

```text
Employee
  Dashboard
  Absensi Karyawan
  Karyawan Cuti
  Jadwal Saya
  Riwayat Saya
  Pengajuan
  Profil

Supervisor
  Semua menu Employee
  Persetujuan Tim
  Review On-call dan Lembur

Admin
  Ringkasan
  Kalender Roster Terpadu
  Absensi
  Data Karyawan
  Cuti dan Izin
  On-call dan Lembur
  Koreksi Absensi
  Pengaturan Jam
  Departemen dan Site
  Perangkat dan Sinkronisasi
  Laporan
  Audit Log
```

## 8. PRD fitur

### F01 Login dan RBAC

Tujuan: memastikan data dan tindakan hanya tersedia bagi role yang tepat.

Kebutuhan:

- Login email atau employee code dan password.
- Session aman, logout, reset password oleh admin.
- Middleware route untuk Employee, Supervisor, dan Admin.
- Setiap mutasi menyimpan actor, waktu, dan sumber.

Acceptance criteria:

- Employee tidak dapat membuka route admin, termasuk melalui API langsung.
- Admin dapat menonaktifkan akun tanpa menghapus histori.
- Session kedaluwarsa sesuai konfigurasi.
- Tes otorisasi tersedia untuk semua endpoint mutasi.

### F02 Halaman Absensi Karyawan

Tujuan: memberikan gambaran status karyawan hari ini.

Kolom minimum:

- Nama Karyawan
- Departemen
- Schedule Kind
- Waktu Masuk
- Waktu Keluar
- Status Terkini
- Keterangan

Fungsi:

- Filter tanggal, site, departemen, status, schedule kind, dan pencarian nama.
- Sorting dan pagination server-side.
- Refresh otomatis tanpa membuat posisi scroll berubah.
- Detail drawer berisi scan mentah, jadwal, hasil kalkulasi, dan koreksi.
- Employee hanya melihat scope yang diizinkan.

Acceptance criteria:

- Data 500 karyawan tetap responsif.
- Status real-time berubah maksimal 10 detik setelah receiver menyimpan scan.
- Shift malam menampilkan tanggal kerja yang benar.
- Empty, loading, error, dan stale state terlihat jelas.

### F03 Halaman Karyawan Cuti

Tujuan: menampilkan siapa yang sedang atau akan cuti.

Kebutuhan:

- Tab Hari Ini, Mendatang, dan Riwayat.
- Nama, departemen, jenis, tanggal mulai, tanggal selesai, dan status approval.
- Alasan sensitif hanya terlihat oleh role berwenang.
- Cuti yang disetujui langsung memengaruhi kalkulasi absensi.

Acceptance criteria:

- Cuti yang dibatalkan mengembalikan status harian melalui recalculation.
- Rentang lintas bulan ditampilkan benar.
- Employee biasa tidak melihat lampiran atau alasan medis.

### F04 Kalender Roster Terpadu

Tujuan: menjadi pusat penjadwalan Admin dan Supervisor.

Jenis event:

- Steady Day
- Shift Pagi
- Shift Malam
- Off
- On-call
- Cuti, sakit, izin
- Lembur disetujui

Kebutuhan:

- Tampilan bulan dan minggu.
- Baris karyawan, kolom tanggal untuk mode roster.
- Filter site dan departemen.
- Bulk assign dengan rentang tanggal.
- Copy roster minggu atau bulan sebelumnya.
- Deteksi konflik sebelum simpan.
- Perubahan jadwal masa lalu wajib alasan dan audit.

Konflik minimum:

- Shift tumpang tindih.
- Cuti beririsan dengan shift atau on-call.
- Dua assignment on-call pada waktu yang sama.
- Jeda antarshift kurang dari batas aman.

Acceptance criteria:

- Admin dapat mengisi roster satu departemen tanpa reload penuh.
- Konflik tidak dapat disimpan tanpa override dan alasan.
- Update jadwal memicu recalculation tanggal yang terdampak.
- 117 karyawan x 31 hari tetap dapat digunakan dengan virtualisasi.

### F05 Data Karyawan

Tujuan: master data identitas dan hubungan ke perangkat.

Field minimum:

- Employee code
- Nama
- Departemen
- Site
- Jabatan
- Work pattern: steady day atau rotating shift
- Status aktif
- Tanggal mulai dan selesai kerja
- User ID per perangkat

Fungsi:

- Import dari MDB atau CSV.
- Mapping employee code ke beberapa perangkat.
- Deteksi user perangkat yang belum dipetakan.
- Nonaktifkan tanpa menghapus histori.

Acceptance criteria:

- Satu employee internal dapat terhubung ke beberapa device user ID.
- Duplikasi employee code ditolak dalam organisasi.
- Nama dari perangkat tidak otomatis menimpa nama master tanpa review.

### F06 Pengaturan Jam dan Shift

Tujuan: seluruh aturan waktu dikonfigurasi dari aplikasi.

Konfigurasi:

- Template Steady Day.
- Template Shift Pagi.
- Template Shift Malam.
- Jam mulai dan selesai.
- Jendela scan masuk dan keluar.
- Toleransi terlambat.
- Batas pulang cepat.
- Minimum durasi kerja.
- Ambang lembur.
- Batas finalisasi alfa.
- Timezone per site.

Acceptance criteria:

- Shift malam dapat selesai pada hari berikutnya.
- Perubahan template tidak mengubah histori tanpa tindakan recalculation eksplisit.
- Preview aturan menampilkan contoh hasil sebelum disimpan.

### F07 On-call

Tujuan: mengelola penugasan on-call dan membedakannya dari lembur.

Kebutuhan:

- Assignment karyawan, rentang waktu, site, approver, dan catatan.
- Status `SCHEDULED`, `ACTIVATED`, `COMPLETED`, `CANCELLED`.
- Scan tanpa jadwal menjadi kandidat on-call atau lembur.
- Admin dapat memilih konteks dengan alasan.
- On-call standby tanpa aktivasi tidak dianggap alfa.

Acceptance criteria:

- Assignment yang aktif terlihat di kalender dan tabel kehadiran.
- Aktivasi dapat berasal dari admin atau review scan.
- Perubahan selalu memiliki audit trail.

### F08 Lembur

Tujuan: menghitung dan menyetujui kerja di luar jadwal.

Kebutuhan:

- Kandidat otomatis dari scan di luar jendela reguler.
- Pengajuan manual sebelum atau sesudah kerja.
- Durasi diajukan, aktual, dan disetujui disimpan terpisah.
- Approval Supervisor lalu Admin dapat dikonfigurasi.
- Tidak menghitung payroll pada MVP.

Acceptance criteria:

- Scan di luar jadwal tidak otomatis menjadi lembur final.
- Admin dapat mengubah kandidat menjadi on-call atau lembur.
- Durasi lintas tengah malam dihitung benar.

### F09 Koreksi Absensi

Tujuan: menangani lupa scan dan klasifikasi salah tanpa mengubah log mentah.

Kebutuhan:

- Koreksi check-in, check-out, schedule kind, context, dan keterangan.
- Alasan wajib.
- Simpan before dan after snapshot.
- Approval sesuai kebijakan.
- Tombol revert untuk Admin.

Acceptance criteria:

- Raw attendance log tidak pernah di-update atau di-delete dari UI.
- Setiap koreksi menampilkan actor dan waktu.
- Revert menghasilkan audit entry baru.

### F10 Laporan

Tujuan: rekap operasional yang dapat diperiksa dan diekspor.

Laporan minimum:

- Kehadiran harian.
- Rekap bulanan per karyawan.
- Terlambat dan pulang cepat.
- Alfa, cuti, sakit, izin, dan off.
- On-call dan lembur.
- Perangkat dan scan yang belum dipetakan.

Acceptance criteria:

- Filter laporan sama dengan filter dashboard.
- Export CSV menggunakan timezone site.
- Angka pada export sama dengan angka pada UI.

### F11 Perangkat dan Sinkronisasi X105

Tujuan: memastikan integrasi fingerprint dapat diaudit dan dipulihkan.

Kebutuhan:

- Registry device: serial, nama, site, IP terakhir, timezone, status aktif.
- `last_seen_at`, log terakhir, backlog state, clock drift, dan error terakhir.
- Allowlist serial number.
- Batch journal untuk setiap POST ADMS.
- ACK hanya setelah transaksi database commit.
- Dedup idempotent.
- Malformed payload masuk quarantine, bukan dibuang.
- Tidak menyimpan fingerprint template.
- Import MDB ditandai sebagai source berbeda dari ADMS.

Acceptance criteria:

- Retry payload yang sama tidak membuat duplikat.
- Database gagal berarti receiver tidak mengirim ACK sukses.
- Device yang tidak dikenal ditolak dan tercatat.
- Dashboard menampilkan online, stale, offline, clock drift, dan sync error.
- Scan baru tersedia untuk rules engine maksimal 10 detik setelah diterima.

### F12 Audit dan Notifikasi

Tujuan: membuat perubahan dapat dipertanggungjawabkan.

Kebutuhan:

- Audit untuk jadwal, approval, koreksi, user, dan pengaturan jam.
- Notifikasi untuk device offline, scan perlu review, approval, dan konflik roster.
- Preferensi notifikasi per role.

Acceptance criteria:

- Audit log tidak dapat diedit melalui aplikasi.
- Notifikasi mempunyai link ke objek yang tepat.
- Event berulang tidak menimbulkan spam tanpa cooldown.

## 9. Non-functional requirements

- Timezone default `Asia/Makassar`, disimpan eksplisit per site.
- Semua timestamp database disimpan UTC, tanggal kerja dihitung berdasarkan timezone site.
- P95 API read di bawah 500 ms untuk 500 karyawan.
- Aplikasi tetap dapat menerima ADMS saat frontend tidak aktif.
- Backup database harian dan uji restore berkala.
- Tidak menyimpan template biometrik.
- TLS atau VPN untuk koneksi antar-site.
- Akses admin dan export dicatat.
- Target browser: Chrome dan Edge dua versi terbaru.
- Mobile employee dashboard minimal 360 px.

## 10. Metrik sukses

- 99.9% log valid tersimpan tanpa duplikat.
- Scan tampil di dashboard kurang dari 10 detik.
- 100% koreksi memiliki actor dan alasan.
- Kurang dari 1% employee device ID berstatus belum dipetakan setelah onboarding.
- Roster satu bulan dapat disusun tanpa spreadsheet tambahan.
