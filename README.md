# X105 Attendance

Starter full TypeScript untuk menguji integrasi real-time Solution X105 melalui ADMS.

## Isi proyek

- `apps/api`: receiver diagnostik ADMS berbasis Bun + Elysia.
- `apps/web`: dashboard Next.js yang membaca log setiap 2 detik.
- `apps/api/src/simulator.ts`: simulator scan untuk tes tanpa mesin.

Versi awal menyimpan maksimal 500 log di memori. Ini disengaja agar payload firmware X105 dapat diverifikasi sebelum database dan aturan presensi dibuat.

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
bun run dev
```

Buka dashboard di `http://localhost:3000` dan API di `http://localhost:8080/health`.

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

## Tahap berikutnya

Setelah payload nyata berhasil ditangkap:

1. Buat fixture payload dan parser khusus firmware.
2. Tambahkan PostgreSQL + Drizzle serta deduplikasi log.
3. Tambahkan karyawan, shift, check-in/check-out, autentikasi, dan role.
4. Ganti polling dashboard dengan Server-Sent Events bila diperlukan.
