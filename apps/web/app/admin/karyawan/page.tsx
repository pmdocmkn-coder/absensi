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

type Template = { id: string; code: string; name: string; kind: string; isActive: boolean };
type ScheduleProfile = { employeeId: number; scheduleTemplateId: string; scheduleTemplateCode: string; workdays: number[]; autoWeekendOvertime: boolean; overtimeBufferMinutes: number };

export default function EmployeesPage() {
  const [records, setRecords] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<Record<number, ScheduleProfile>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<Record<number, string>>({});
  const [savingProfile, setSavingProfile] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
      fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" }),
      fetch(`${API_URL}/api/schedule-profiles`, { credentials: "include", cache: "no-store" })
    ]).then(async ([employeesResponse, templatesResponse, profilesResponse]) => {
        const employeePayload = await employeesResponse.json() as { records?: Employee[]; error?: { message?: string } };
        const templatePayload = await templatesResponse.json() as { records?: Template[]; error?: { message?: string } };
        const profilePayload = await profilesResponse.json() as { records?: ScheduleProfile[]; error?: { message?: string } };
        if (!employeesResponse.ok) throw new Error(employeePayload.error?.message ?? "Gagal memuat karyawan");
        if (!templatesResponse.ok) throw new Error(templatePayload.error?.message ?? "Gagal memuat template kerja");
        if (!profilesResponse.ok) throw new Error(profilePayload.error?.message ?? "Gagal memuat profil kerja");
        setRecords(employeePayload.records ?? []);
        setTemplates((templatePayload.records ?? []).filter((template) => template.isActive && template.kind === "REGULAR"));
        const byEmployee = Object.fromEntries((profilePayload.records ?? []).map((profile) => [profile.employeeId, profile]));
        setProfiles(byEmployee);
        setSelectedTemplate(Object.fromEntries((profilePayload.records ?? []).map((profile) => [profile.employeeId, profile.scheduleTemplateId])));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Gagal memuat karyawan"));
  }, []);

  const saveProfile = async (employeeId: number) => {
    const scheduleTemplateId = selectedTemplate[employeeId];
    if (!scheduleTemplateId) {
      setError("Pilih template reguler terlebih dahulu.");
      return;
    }
    setSavingProfile(employeeId);
    try {
      const response = await fetch(`${API_URL}/api/schedule-profiles/${employeeId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleTemplateId,
          workdays: [1, 2, 3, 4, 5],
          autoWeekendOvertime: true,
          overtimeBufferMinutes: 15
        })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan profil kerja");
      const activeTemplate = templates.find((template) => template.id === scheduleTemplateId);
      if (activeTemplate) setProfiles((current) => ({ ...current, [employeeId]: {
        employeeId, scheduleTemplateId, scheduleTemplateCode: activeTemplate.code,
        workdays: [1, 2, 3, 4, 5], autoWeekendOvertime: true, overtimeBufferMinutes: 15
      } }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan profil kerja");
    } finally {
      setSavingProfile(null);
    }
  };

  return (
    <>
      <PageHeader title="Data karyawan" description="Identitas aplikasi dipetakan ke PIN pada perangkat fingerprint. Satu karyawan dapat memiliki mapping pada lebih dari satu perangkat." />
      {error ? <div className="notice notice-error"><strong>Data belum tersedia</strong><span>{error}</span></div> : null}
      <section className="panel">
        <div className="panel-heading"><div><h2>Direktori karyawan</h2><p>{records.length} karyawan ditemukan di database. Profil otomatis berlaku Senin–Jumat; scan Sabtu/Minggu otomatis ditandai lembur.</p></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Kode</th><th>Nama</th><th>Departemen</th><th>Role</th><th>PIN dan perangkat</th><th>Profil otomatis</th><th>Status</th></tr></thead>
          <tbody>{records.map((employee) => (
            <tr key={employee.id}>
              <td><code>{employee.employeeCode}</code></td>
              <td><strong className="table-primary">{employee.name}</strong></td>
              <td>{employee.departmentName ?? <span className="muted-value">Belum dipetakan</span>}</td>
              <td><code>{employee.role}</code></td>
              <td>{employee.deviceMappings.length ? employee.deviceMappings.map((mapping) => <span className="mapping-line" key={`${mapping.deviceSerial}-${mapping.deviceUserCode}`}><code>{mapping.deviceUserCode}</code> {mapping.deviceSerial}</span>) : <span className="muted-value">Belum ada mapping</span>}</td>
              <td>
                <select value={selectedTemplate[employee.id] ?? ""} onChange={(event) => setSelectedTemplate((current) => ({ ...current, [employee.id]: event.target.value }))} aria-label={`Profil kerja ${employee.name}`}>
                  <option value="">Tidak memakai profil</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.code} — {template.name}</option>)}
                </select>
                {profiles[employee.id] ? <small className="mapping-line">Sen–Jum · buffer {profiles[employee.id].overtimeBufferMinutes} menit · OT akhir pekan</small> : null}
                <button className="secondary-button" type="button" onClick={() => void saveProfile(employee.id)} disabled={savingProfile === employee.id}>{savingProfile === employee.id ? "Simpan..." : "Tetapkan"}</button>
              </td>
              <td><StatusBadge tone={employee.isActive ? "on-time" : "off"}>{employee.isActive ? "AKTIF" : "NONAKTIF"}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
