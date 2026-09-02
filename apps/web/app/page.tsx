import Link from "next/link";
import { LiveAttendance } from "./components/live-attendance";
import { PageHeader } from "./components/page-header";
import { StatusBadge } from "./components/status-badge";
import { TodayAttendance } from "./components/today-attendance";

export default function EmployeeDashboardPage() {
  return (
    <>
      <PageHeader
        title="Selamat bekerja, Pandu."
        description="Ringkasan absensi dan jadwal kerja Anda hari ini."
        action={<StatusBadge tone="on-time">Evaluasi otomatis aktif</StatusBadge>}
      />
      <TodayAttendance />

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
            <strong>Roster mengalahkan profil</strong>
            <p>Jika ada roster harian, itu dipakai. Profil Steady Day menjadi aturan reguler Senin–Jumat.</p>
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
