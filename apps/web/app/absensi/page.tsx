import { LiveAttendance } from "../components/live-attendance";
import { DailyAttendanceTable } from "../components/daily-attendance-table";
import { PageHeader } from "../components/page-header";

export const metadata = { title: "Absensi" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Absensi karyawan"
        description="Rekap harian dari roster, profil kerja, dan scan Solution X105. Status diperbarui otomatis dan kasus khusus dapat dikonfirmasi admin."
      />
      <div className="notice">
        <strong>Status otomatis</strong>
        <span>Scan pertama menjadi waktu masuk, scan terakhir menjadi waktu keluar. Roster harian mengalahkan profil kerja reguler.</span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Absensi harian karyawan</h2>
            <p>Data evaluasi diperbarui setiap 30 detik.</p>
          </div>
        </div>
        <DailyAttendanceTable />
      </section>
      <section className="panel raw-log-panel">
        <details>
          <summary>BUKA LOG MENTAH X105</summary>
          <div className="panel-heading"><div><h2>Diagnostik scan</h2><p>Gunakan data ini ketika perlu memeriksa kiriman asli perangkat.</p></div><code>GET /api/attendance</code></div>
          <LiveAttendance limit={30} />
        </details>
      </section>
    </>
  );
}
