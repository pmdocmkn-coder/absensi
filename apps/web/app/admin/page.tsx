import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { SystemReadiness } from "../components/system-readiness";

export const metadata = { title: "Dashboard admin" };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Pusat operasional"
        description="Pantau kesiapan perangkat, data karyawan, pola kerja, dan roster periode aktif."
      />

      <SystemReadiness />

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

    </>
  );
}
