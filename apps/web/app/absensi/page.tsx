import { LiveAttendance } from "../components/live-attendance";
import { PageHeader } from "../components/page-header";

export const metadata = { title: "Absensi" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Absensi karyawan"
        description="Log scan terbaru dari perangkat. Pengolahan masuk, keluar, terlambat, dan lembur menyusul setelah modul jadwal aktif."
      />
      <div className="notice">
        <strong>Mode raw log</strong>
        <span>Nama dan waktu berasal dari perangkat, sedangkan departemen dan status masih menunggu database aplikasi.</span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Riwayat scan</h2>
            <p>Data diperbarui setiap 10 detik.</p>
          </div>
          <code>GET /api/attendance</code>
        </div>
        <LiveAttendance limit={50} />
      </section>
    </>
  );
}
