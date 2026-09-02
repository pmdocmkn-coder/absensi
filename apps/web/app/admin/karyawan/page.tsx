import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

export const metadata = { title: "Data karyawan" };

const employees = [
  { pin: "1001", name: "Andi Prakoso", department: "Produksi", schedule: "Shift pagi", device: "X105-DEMO-01" },
  { pin: "1002", name: "Lestari Ayuningtyas", department: "Keuangan", schedule: "Steady day", device: "X105-DEMO-01" },
  { pin: "1003", name: "Bayu Firmansyah", department: "Produksi", schedule: "Shift malam", device: "X105-DEMO-01" },
  { pin: "1004", name: "Dimas Saputra", department: "Maintenance", schedule: "Shift malam", device: "X105-DEMO-01" },
  { pin: "1005", name: "Nadia Permata", department: "Maintenance", schedule: "On-call", device: "X105-DEMO-01" }
];

export default function EmployeesPage() {
  return (
    <>
      <PageHeader
        title="Data karyawan"
        description="Pemetaan identitas aplikasi, departemen, template kerja, dan PIN pada perangkat fingerprint."
      />
      <div className="notice">
        <strong>Master data belum aktif</strong>
        <span>Tabel ini adalah pratinjau struktur. Data nyata akan dimigrasikan dari tabel employees pada milestone database.</span>
      </div>
      <section className="panel">
        <div className="panel-heading"><div><h2>Direktori karyawan</h2><p>Contoh pemetaan PIN Solution X105.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>PIN mesin</th><th>Nama</th><th>Departemen</th><th>Template kerja</th><th>Perangkat</th><th>Pemetaan</th></tr></thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.pin}>
                  <td><code>{employee.pin}</code></td>
                  <td><strong className="table-primary">{employee.name}</strong></td>
                  <td>{employee.department}</td>
                  <td>{employee.schedule}</td>
                  <td><code>{employee.device}</code></td>
                  <td><StatusBadge tone="on-time">Terpetakan</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
