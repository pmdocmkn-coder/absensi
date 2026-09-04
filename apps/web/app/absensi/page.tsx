import { LiveAttendance } from "../components/live-attendance";
import { DailyAttendanceTable } from "../components/daily-attendance-table";
import { PageHeader } from "../components/page-header";

export const metadata = { title: "Absensi" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Absensi Karyawan"
        description="Monitoring kehadiran real-time berbasis scan biometrik Solution X105, kalender roster operasional, dan status kerja terintegrasi."
      />
      <section className="panel" style={{ padding: "20px 24px" }}>
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
