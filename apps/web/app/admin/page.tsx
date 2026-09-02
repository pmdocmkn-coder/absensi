import Link from "next/link";
import { Metric } from "../components/metric";
import { PageHeader } from "../components/page-header";
import { StatusBadge } from "../components/status-badge";

export const metadata = { title: "Dashboard admin" };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Pusat operasional"
        description="Pantau kesiapan perangkat, jadwal, dan data yang perlu ditinjau admin."
        action={<StatusBadge tone="on-time">Evaluasi otomatis siap</StatusBadge>}
      />

      <section className="metric-grid" aria-label="Ringkasan administrasi">
        <Metric label="Karyawan terdaftar" value="117" note="Data mesin Sangatta" emphasis />
        <Metric label="Perangkat" value="2" note="1 online, 1 perlu diperiksa" />
        <Metric label="Roster terbit" value="0" note="September 2026" />
        <Metric label="Perlu ditinjau" value="Buka verifikasi" note="Konfirmasi hanya untuk pengecualian" />
      </section>

      <section className="admin-action-grid">
        <Link className="action-block action-yellow" href="/admin/roster">
          <span>Kalender terpadu</span>
          <strong>Atur roster, cuti, on-call, dan reguler</strong>
          <small>Buka kalender roster</small>
        </Link>
        <Link className="action-block" href="/admin/karyawan">
          <span>Master data</span>
          <strong>Petakan PIN mesin ke karyawan</strong>
          <small>Buka data karyawan</small>
        </Link>
        <Link className="action-block action-yellow" href="/admin/kehadiran">
          <span>Aturan otomatis</span>
          <strong>Konfirmasi hasil absensi dan lembur</strong>
          <small>Buka verifikasi absensi</small>
        </Link>
        <Link className="action-block" href="/admin/pengaturan-jam">
          <span>Aturan waktu</span>
          <strong>Siapkan steady day dan shift</strong>
          <small>Buka pengaturan jam</small>
        </Link>
        <Link className="action-block action-blue" href="/admin/perangkat">
          <span>Sinkronisasi</span>
          <strong>Periksa receiver Solution X105</strong>
          <small>Buka monitor perangkat</small>
        </Link>
      </section>

      <section className="panel readiness-panel">
        <div className="panel-heading">
          <div><h2>Kesiapan sistem</h2><p>Urutan konfigurasi sebelum status absensi diaktifkan.</p></div>
        </div>
        <ol className="readiness-list">
          <li className="readiness-complete"><strong>Log X105 tersimpan</strong><span>Receiver dan SQLite sudah menerima scan.</span></li>
          <li><strong>Master karyawan</strong><span>Tambahkan departemen dan hubungan PIN perangkat.</span></li>
          <li><strong>Template jam kerja</strong><span>Buat steady day, shift pagi, dan shift malam.</span></li>
          <li><strong>Roster diterbitkan</strong><span>Tentukan jadwal harian setiap karyawan.</span></li>
          <li className="readiness-complete"><strong>Rules engine aktif</strong><span>Hitung masuk, keluar, terlambat, off, on-call, dan lembur.</span></li>
        </ol>
      </section>
    </>
  );
}
