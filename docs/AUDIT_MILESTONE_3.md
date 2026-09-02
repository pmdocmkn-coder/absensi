# Audit Milestone 3: X105, Roster, dan Evaluasi Absensi

Tanggal audit: 2 September 2026

## Kesimpulan

Fondasi aplikasi sudah layak untuk tahap konfigurasi operasional. Receiver ADMS menyimpan log X105, identitas karyawan dipetakan melalui PIN perangkat, login dan role berjalan, template jam serta roster tersedia, dan mesin evaluasi dapat menghasilkan status harian.

Sistem belum siap dipakai sebagai sumber final payroll karena data organisasi, profil kerja, dan roster riil belum diisi. Modul cuti juga masih berupa pratinjau dan belum memiliki workflow persetujuan.

## Kondisi database saat audit

| Item | Jumlah | Penilaian |
| --- | ---: | --- |
| Karyawan | 108 | Tersedia |
| Mapping PIN dan perangkat | 109 | Tersedia, 1 karyawan belum memiliki mapping |
| Log presensi | 196.849 | Tersedia, rentang 23 Nov 2021 sampai 2 Sep 2026 |
| Departemen terpasang ke karyawan | 0 | Wajib dilengkapi |
| Template kerja sebelum perbaikan | 0 | Diperbaiki dengan 7 preset Sangatta |
| Roster harian | 0 | Wajib diisi atau diimpor |
| Profil kerja otomatis | 0 | Wajib ditetapkan untuk Steady Day dan pola reguler lain |

## Yang sudah sesuai

- Endpoint ADMS `/iclock/*` dan fallback `/device/*` tetap terbuka untuk mesin di LAN.
- Log mentah tidak dihapus atau diubah oleh migrasi baru.
- Mapping perangkat memakai kombinasi nomor seri dan PIN sehingga satu karyawan dapat terhubung ke beberapa alat.
- Role `EMPLOYEE`, `SUPERVISOR`, dan `ADMIN` memiliki pembatasan akses.
- Shift lintas tengah malam didukung melalui `crossesMidnight` dan diuji dengan scan keluar pada hari berikutnya.
- Roster reguler dapat ditumpuk dengan on-call atau lembur.
- Hasil otomatis dapat dikoreksi admin dan menyimpan catatan konfirmasi.
- Rentang evaluasi dibatasi maksimal 31 hari untuk mencegah beban query yang berlebihan.

## Perbaikan dalam audit ini

- Halaman Absensi menggunakan evaluasi harian dan menampilkan jadwal, masuk, keluar, status, keterlambatan, pulang cepat, lembur, jumlah scan, serta sumber keputusan.
- Raw log tetap tersedia sebagai panel diagnostik terpisah.
- Kalender Roster mendapat pencarian, filter departemen, navigasi minggu, penanda akhir pekan, jam template, tambah cepat, dan hapus penugasan.
- Data Karyawan mendapat ringkasan kelengkapan, pencarian, filter, pembuatan dan pemetaan departemen, pengaturan akses, serta panel profil kerja per karyawan.
- Preset dibuat dari roster contoh: Steady Day, Shift Pagi, Shift Malam, Drill, MCR, Administrasi hari kerja, dan Administrasi Sabtu.
- Lembur akhir pekan dihitung dari selisih scan pertama dan terakhir. Satu scan saja masuk antrean tinjau.
- Satu scan setelah jadwal selesai masuk antrean tinjau karena waktu keluar belum diketahui.

## Risiko dan pekerjaan berikutnya

1. Lengkapi departemen seluruh karyawan.
2. Tetapkan profil kerja bagi karyawan Steady Day dan pola reguler lain.
3. Masukkan atau impor roster aktual untuk crew shift.
4. Bangun workflow cuti riil. Halaman cuti saat ini masih data contoh.
5. Tambahkan kalender hari libur perusahaan dan cuti bersama.
6. Tambahkan pemantauan cursor backlog ADMS agar status sinkronisasi perangkat dapat dinyatakan selesai secara pasti.
7. Tambahkan laporan periode, koreksi massal, ekspor payroll, dan audit trail yang dapat dicari.
8. Tambahkan pengujian lanjutan untuk on-call tanpa roster reguler serta konflik beberapa penugasan pada tanggal yang sama.

## Kriteria sebelum produksi

- Seluruh karyawan memiliki departemen, mapping perangkat, dan jenis pola kerja.
- Roster satu periode sudah ditinjau supervisor.
- Jam pada X105 dan server sama-sama WITA dan disinkronkan.
- Aturan toleransi, buffer lembur, pulang cepat, on-call, dan persetujuan lembur disahkan perusahaan.
- Uji paralel terhadap laporan aplikasi desktop lama dilakukan minimal satu periode penggajian.
