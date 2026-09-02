# Sistem Desain Neo-Brutalism

## Design read

Aplikasi operasional untuk karyawan, supervisor, HR, dan admin site. Bahasa visual Neo-Brutalism harus terasa tegas, cepat, dan sedikit playful, tetapi tidak mengorbankan keterbacaan tabel dan kalender.

## Dials

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 2`
- `VISUAL_DENSITY: 7`

Neo-Brutalism dipakai sebagai material visual, bukan alasan membuat layout berantakan.

## Fondasi UI

- Next.js App Router.
- Native CSS atau Tailwind v4 untuk token dan layout.
- Radix primitives untuk dialog, popover, tabs, tooltip, dropdown, dan accessibility.
- TanStack Table untuk tabel data.
- TanStack Virtual untuk roster grid besar.
- TanStack Query untuk server state.
- Phosphor Icons sebagai satu-satunya keluarga ikon.
- `next/font` dengan Space Grotesk untuk UI dan IBM Plex Mono untuk data waktu atau kode.

## Theme lock

Versi pertama memakai light theme. Dark theme ditunda sampai semua status dan tabel lulus contrast audit.

## Token warna

```css
--paper: #f5f2e8;
--surface: #fffdf6;
--ink: #111111;
--muted: #5f5a50;
--accent: #ffd84d;
--focus: #1457ff;

--success: #9ee6a0;
--warning: #ffbf69;
--danger: #ff6b6b;
--info: #8ec5ff;
--neutral: #ded8cb;
```

`accent` adalah warna dekoratif tunggal. Warna semantic hanya digunakan untuk status, alert, dan validasi.

## Material

- Border utama: 2 px solid ink.
- Border tabel: 1 px solid ink.
- Radius: 4 px untuk semua surface dan input.
- Hard shadow: `4px 4px 0 #111` hanya untuk dialog, CTA utama, dan panel penting.
- Tidak memakai gradient, blur, glassmorphism, atau soft shadow.
- Active state: translate 2 px dan shadow menjadi 2 px.

## Typography

- Page title: 32 sampai 40 px, weight 700.
- Section title: 20 sampai 24 px, weight 700.
- Body: 14 sampai 16 px.
- Table: 13 sampai 14 px.
- Data numerik dan timestamp: IBM Plex Mono 12 sampai 13 px.
- Uppercase hanya untuk label pendek, bukan semua heading.

## Layout shell

```text
Desktop
┌──────────────┬────────────────────────────────────┐
│ Sidebar      │ Topbar                             │
│              ├────────────────────────────────────┤
│ Navigation   │ Page header + actions              │
│              ├────────────────────────────────────┤
│              │ Filters                            │
│              ├────────────────────────────────────┤
│              │ Main content                       │
└──────────────┴────────────────────────────────────┘

Mobile
┌─────────────────────────────┐
│ Topbar + menu               │
├─────────────────────────────┤
│ Page header                 │
├─────────────────────────────┤
│ Horizontal filter controls  │
├─────────────────────────────┤
│ Cards or scrollable table   │
└─────────────────────────────┘
```

Desktop content max width 1600 px. Admin roster boleh memakai full width.

## Navigation

- Sidebar 248 px.
- Item aktif memakai accent background, border 2 px, dan hard offset 2 px.
- Badge notifikasi hanya untuk data nyata.
- Employee dan Admin mendapatkan menu berbeda dari permission server.

## Komponen inti

### Button

- Primary: accent background, ink text, border 2 px, hard shadow.
- Secondary: surface background, border 2 px.
- Destructive: danger background, dipakai sangat terbatas.
- Disabled: neutral background, tanpa shadow.

### Input dan select

- Tinggi minimum 40 px.
- Border 2 px.
- Focus ring biru 3 px dengan offset 2 px.
- Error inline di bawah field.

### Status badge

Badge tidak selalu berbentuk pill. Gunakan rectangular tag radius 4 px.

- Hadir tepat waktu: success.
- Terlambat: warning.
- Alfa atau error: danger.
- Off: neutral.
- Cuti atau izin: info.
- On-call: accent.
- Review required: warning dengan icon.

### Table

- Sticky header.
- Baris 44 sampai 52 px.
- Zebra stripe sangat ringan, bukan warna dekoratif.
- Sort, filter, pagination server-side.
- Kolom nama tetap terlihat ketika horizontal scroll di desktop besar.
- Action memakai dropdown, bukan deretan banyak icon.

### Calendar roster

- Baris karyawan tervirtualisasi.
- Kolom tanggal fixed width.
- Header tanggal sticky.
- Kode sel ringkas: SD, P, M, O, OC, CT, IZ, SK.
- Klik sel membuka editor terstruktur.
- Drag selection boleh ditambahkan setelah MVP, bukan pada iterasi pertama.

### Dialog

- Judul jelas, ringkasan perubahan, action primer tunggal.
- Aksi destructive memerlukan konfirmasi target dan dampak.
- Tidak memakai dialog untuk read-only detail jika drawer lebih sesuai.

### Feedback states

- Loading: skeleton berbentuk tabel atau kalender.
- Empty: jelaskan mengapa kosong dan tindakan yang relevan.
- Error: tampilkan penyebab, request ID, dan retry.
- Stale: banner ketika data terakhir diperbarui terlalu lama.
- Offline device: state semantic, bukan sekadar warna.

## Page specifications

### Employee Dashboard

Urutan:

1. Status saya hari ini.
2. Jadwal saya.
3. Check-in dan check-out.
4. Pengajuan aktif.
5. Ringkasan tujuh hari.

### Absensi Karyawan

Urutan:

1. Judul dan timestamp refresh.
2. Filter site, departemen, tanggal, status, dan pencarian.
3. Tabel absensi.
4. Drawer detail.

### Karyawan Cuti

Urutan:

1. Tab Hari Ini, Mendatang, Riwayat.
2. Filter departemen.
3. List atau tabel sesuai viewport.

### Admin Roster

Urutan:

1. Site dan periode.
2. Toolbar bulk assignment.
3. Legend.
4. Roster grid.
5. Conflict panel.

### Device Sync

Urutan:

1. Health summary.
2. Device list.
3. Last seen dan clock drift.
4. Sync batch journal.
5. Quarantine payload.

## Responsive rules

- Employee pages mobile-first.
- Admin roster desktop-first dan menampilkan pesan minimum-width bila editor kompleks dibuka di layar kecil.
- Tabel desktop menjadi cards hanya pada halaman user, bukan admin.
- Semua action dapat diakses keyboard.
- Tidak mengandalkan hover untuk informasi penting.

## Accessibility

- WCAG AA untuk teks dan kontrol.
- Status selalu memakai label dan icon, bukan warna saja.
- Focus visible di semua elemen interaktif.
- Header tabel memiliki `scope` dan sort state.
- Dialog mengunci fokus dan mengembalikan fokus saat ditutup.
- `prefers-reduced-motion` menghapus transform non-esensial.

## Pre-flight sebelum halaman dianggap selesai

- Satu accent konsisten.
- Radius konsisten 4 px.
- Tidak ada soft shadow atau gradient.
- Semua state loading, empty, error, stale tersedia.
- Tabel dapat dipakai dengan keyboard.
- Mobile 360 px tidak overflow kecuali table container yang memang scrollable.
- Button contrast lulus.
- Tidak ada data dummy pada production route.
- Timestamp menampilkan timezone site.
