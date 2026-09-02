"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Employee = {
  id: number;
  employeeCode: string;
  name: string;
  departmentName: string | null;
  role: string;
  isActive: boolean;
  deviceMappings: Array<{ deviceSerial: string; deviceUserCode: string }>;
};

export default function EmployeesPage() {
  const [records, setRecords] = useState<Employee[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { records?: Employee[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat karyawan");
        setRecords(payload.records ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Gagal memuat karyawan"));
  }, []);

  return (
    <>
      <PageHeader title="Data karyawan" description="Identitas aplikasi dipetakan ke PIN pada perangkat fingerprint. Satu karyawan dapat memiliki mapping pada lebih dari satu perangkat." />
      {error ? <div className="notice notice-error"><strong>Data belum tersedia</strong><span>{error}</span></div> : null}
      <section className="panel">
        <div className="panel-heading"><div><h2>Direktori karyawan</h2><p>{records.length} karyawan ditemukan di database.</p></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Kode</th><th>Nama</th><th>Departemen</th><th>Role</th><th>PIN dan perangkat</th><th>Status</th></tr></thead>
          <tbody>{records.map((employee) => (
            <tr key={employee.id}>
              <td><code>{employee.employeeCode}</code></td>
              <td><strong className="table-primary">{employee.name}</strong></td>
              <td>{employee.departmentName ?? <span className="muted-value">Belum dipetakan</span>}</td>
              <td><code>{employee.role}</code></td>
              <td>{employee.deviceMappings.length ? employee.deviceMappings.map((mapping) => <span className="mapping-line" key={`${mapping.deviceSerial}-${mapping.deviceUserCode}`}><code>{mapping.deviceUserCode}</code> {mapping.deviceSerial}</span>) : <span className="muted-value">Belum ada mapping</span>}</td>
              <td><StatusBadge tone={employee.isActive ? "on-time" : "off"}>{employee.isActive ? "AKTIF" : "NONAKTIF"}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
