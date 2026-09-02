import { PageHeader } from "../components/page-header";
import { StatusBadge } from "../components/status-badge";

export const metadata = { title: "Daftar cuti" };

const leavePreview = [
  { name: "Andi Prakoso", department: "Produksi", period: "7-9 Sep 2026", type: "Cuti tahunan", status: "Disetujui" },
  { name: "Lestari Ayuningtyas", department: "Keuangan", period: "14 Sep 2026", type: "Izin keluarga", status: "Menunggu" },
  { name: "Bayu Firmansyah", department: "Maintenance", period: "21-22 Sep 2026", type: "Cuti tahunan", status: "Disetujui" }
];

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Daftar karyawan cuti"
        description="Pratinjau tampilan cuti tim. Data ini masih contoh sampai modul cuti tersambung ke database."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Cuti September</h2>
            <p>Data contoh untuk validasi desain.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Departemen</th><th>Periode</th><th>Jenis</th><th>Status</th></tr></thead>
            <tbody>
              {leavePreview.map((item) => (
                <tr key={`${item.name}-${item.period}`}>
                  <td><strong className="table-primary">{item.name}</strong></td>
                  <td>{item.department}</td>
                  <td className="numeric-cell">{item.period}</td>
                  <td>{item.type}</td>
                  <td><StatusBadge tone={item.status === "Disetujui" ? "leave" : "pending"}>{item.status}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
