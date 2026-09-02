import Link from "next/link";
import { LiveAttendance } from "./components/live-attendance";
import { Metric } from "./components/metric";
import { PageHeader } from "./components/page-header";
import { StatusBadge } from "./components/status-badge";

export default function EmployeeDashboardPage() {
  return (
    <>
      <PageHeader
        title="Selamat bekerja, Pandu."
        description="Ringkasan absensi dan jadwal kerja Anda hari ini."
        action={<StatusBadge tone="pending">Data jadwal belum aktif</StatusBadge>}
      />

      <section className="metric-grid" aria-label="Ringkasan hari ini">
        <Metric label="Status hari ini" value="Menunggu jadwal" note="Aturan absensi belum dikonfigurasi" emphasis />
        <Metric label="Waktu masuk" value="-" note="Belum dihitung" />
        <Metric label="Waktu keluar" value="-" note="Belum dihitung" />
        <Metric label="Jadwal" value="-" note="Steady day atau shift" />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-live">
          <div className="panel-heading">
            <div>
              <h2>Aktivitas scan terbaru</h2>
              <p>Data mentah dari X105. Status final dihitung setelah jadwal aktif.</p>
            </div>
            <Link className="text-link" href="/absensi">Lihat semua</Link>
          </div>
          <LiveAttendance compact limit={6} />
        </article>

        <aside className="panel today-panel">
          <div className="panel-heading">
            <div>
              <h2>Jadwal saya</h2>
              <p>Rabu, 2 September 2026</p>
            </div>
          </div>
          <div className="schedule-placeholder">
            <strong>Belum ada jadwal terbit</strong>
            <p>Admin perlu menerbitkan roster sebelum status kehadiran dapat dihitung.</p>
          </div>
          <dl className="definition-list">
            <div><dt>On-call</dt><dd>Tidak terjadwal</dd></div>
            <div><dt>Cuti</dt><dd>Tidak ada</dd></div>
            <div><dt>Lembur</dt><dd>Belum ditetapkan</dd></div>
          </dl>
        </aside>
      </section>
    </>
  );
}
