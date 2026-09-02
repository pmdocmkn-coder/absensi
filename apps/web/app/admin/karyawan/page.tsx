"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const weekdays = [{ value: 1, label: "Sen" }, { value: 2, label: "Sel" }, { value: 3, label: "Rab" }, { value: 4, label: "Kam" }, { value: 5, label: "Jum" }, { value: 6, label: "Sab" }, { value: 7, label: "Min" }];

type Employee = {
  id: number; employeeCode: string; name: string; email: string | null; departmentName: string | null;
  siteId: string | null; siteName: string | null; departmentId: string | null; role: string; isActive: boolean;
  deviceMappings: Array<{ deviceSerial: string; deviceUserCode: string }>;
};
type Department = { id: string; siteId: string; code: string; name: string; isActive: boolean };
type Template = { id: string; code: string; name: string; kind: string; isActive: boolean; startTime: string; endTime: string };
type ScheduleProfile = { employeeId: number; scheduleTemplateId: string; scheduleTemplateCode: string; scheduleTemplateName: string; workdays: number[]; autoWeekendOvertime: boolean; overtimeBufferMinutes: number };

export default function EmployeesPage() {
  const [records, setRecords] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<Record<number, ScheduleProfile>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weekendOvertime, setWeekendOvertime] = useState(true);
  const [overtimeBuffer, setOvertimeBuffer] = useState(15);
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [newDepartmentCode, setNewDepartmentCode] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/departments`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-profiles`, { credentials: "include", cache: "no-store" })
      ]);
      const [employeePayload, departmentPayload, templatePayload, profilePayload] = await Promise.all(responses.map((response) => response.json())) as [
        { records?: Employee[]; error?: { message?: string } },
        { records?: Department[]; error?: { message?: string } },
        { records?: Template[]; error?: { message?: string } },
        { records?: ScheduleProfile[]; error?: { message?: string } }
      ];
      if (!responses[0].ok) throw new Error(employeePayload.error?.message ?? "Gagal memuat karyawan");
      if (!responses[1].ok) throw new Error(departmentPayload.error?.message ?? "Gagal memuat departemen");
      if (!responses[2].ok) throw new Error(templatePayload.error?.message ?? "Gagal memuat template kerja");
      if (!responses[3].ok) throw new Error(profilePayload.error?.message ?? "Gagal memuat profil kerja");
      setRecords(employeePayload.records ?? []);
      setDepartments(departmentPayload.records ?? []);
      setTemplates((templatePayload.records ?? []).filter((template) => template.isActive && template.kind === "REGULAR"));
      setProfiles(Object.fromEntries((profilePayload.records ?? []).map((profile) => [profile.employeeId, profile])));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat karyawan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedEmployee = records.find((employee) => employee.id === selectedId) ?? null;
  const openProfile = (employee: Employee) => {
    const profile = profiles[employee.id];
    setSelectedId(employee.id);
    setTemplateId(profile?.scheduleTemplateId ?? "");
    setWorkdays(profile?.workdays ?? [1, 2, 3, 4, 5]);
    setWeekendOvertime(profile?.autoWeekendOvertime ?? true);
    setOvertimeBuffer(profile?.overtimeBufferMinutes ?? 15);
    setDepartmentId(employee.departmentId ?? "");
    setRole(employee.role);
    setError("");
  };

  const saveEmployee = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/employees/${selectedEmployee.id}`, {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId: departmentId || null, role })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan data karyawan");
      await load();
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menyimpan data karyawan"); }
    finally { setSaving(false); }
  };

  const addDepartment = async () => {
    const code = newDepartmentCode.trim();
    const name = newDepartmentName.trim();
    if (!code || !name) { setError("Kode dan nama departemen wajib diisi."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/departments`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: selectedEmployee?.siteId ?? "site-default", code, name })
      });
      const payload = await response.json() as Department & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menambah departemen");
      setNewDepartmentCode("");
      setNewDepartmentName("");
      setDepartmentId(payload.id);
      await load();
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menambah departemen"); }
    finally { setSaving(false); }
  };

  const saveProfile = async () => {
    if (!selectedEmployee || !templateId || workdays.length === 0) { setError("Pilih template dan minimal satu hari kerja."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/schedule-profiles/${selectedEmployee.id}`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleTemplateId: templateId, workdays, autoWeekendOvertime: weekendOvertime, overtimeBufferMinutes: overtimeBuffer })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan profil kerja");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menyimpan profil kerja"); }
    finally { setSaving(false); }
  };

  const removeProfile = async () => {
    if (!selectedEmployee || !profiles[selectedEmployee.id] || !window.confirm(`Nonaktifkan profil otomatis ${selectedEmployee.name}?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/schedule-profiles/${selectedEmployee.id}`, { method: "DELETE", credentials: "include" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menonaktifkan profil");
      setSelectedId(null);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menonaktifkan profil"); }
    finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((employee) => {
      const matchesTerm = !term || `${employee.name} ${employee.employeeCode} ${employee.departmentName ?? ""} ${employee.deviceMappings.map((item) => item.deviceUserCode).join(" ")}`.toLowerCase().includes(term);
      const matchesFilter = filter === "ALL" || (filter === "PROFILED" && profiles[employee.id]) || (filter === "NO_PROFILE" && !profiles[employee.id]) || (filter === "NO_DEPARTMENT" && !employee.departmentName) || (filter === "NO_MAPPING" && employee.deviceMappings.length === 0);
      return matchesTerm && matchesFilter;
    });
  }, [records, profiles, search, filter]);

  const missingDepartment = records.filter((employee) => !employee.departmentName).length;
  const missingMapping = records.filter((employee) => employee.deviceMappings.length === 0).length;

  return <>
    <PageHeader title="Data karyawan" description="Kelola identitas, mapping PIN X105, dan profil jadwal otomatis dari satu direktori." />
    <div className="attendance-summary employee-summary">
      <div><span>Karyawan aktif</span><strong>{records.filter((employee) => employee.isActive).length}</strong></div>
      <div><span>Profil kerja aktif</span><strong>{Object.keys(profiles).length}</strong></div>
      <div><span>Tanpa departemen</span><strong>{missingDepartment}</strong></div>
      <div><span>Tanpa mapping X105</span><strong>{missingMapping}</strong></div>
    </div>
    {error ? <div className="notice notice-error"><strong>Perlu diperiksa</strong><span>{error}</span></div> : null}
    {selectedEmployee ? <section className="panel employee-config-panel">
      <div className="panel-heading"><div><h2>Profil kerja: {selectedEmployee.name}</h2><p><code>{selectedEmployee.employeeCode}</code> Profil ini dipakai jika tidak ada roster harian.</p></div><button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>TUTUP</button></div>
      <div className="employee-config-grid">
        <div className="employee-config-section">
          <h3>Data organisasi</h3>
          <div className="employee-config-fields">
            <label className="form-field"><span>Departemen</span><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Belum dipetakan</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code} | {department.name}</option>)}</select></label>
            <label className="form-field"><span>Akses aplikasi</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="EMPLOYEE">Karyawan</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Admin</option></select></label>
          </div>
          <button className="secondary-button" type="button" onClick={() => void saveEmployee()} disabled={saving}>SIMPAN DATA KARYAWAN</button>
          <div className="department-quick-add">
            <strong>Departemen belum ada?</strong>
            <input value={newDepartmentCode} onChange={(event) => setNewDepartmentCode(event.target.value.toUpperCase())} placeholder="Kode, mis. OPS" maxLength={20} />
            <input value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="Nama departemen" maxLength={120} />
            <button className="secondary-button compact-button" type="button" onClick={() => void addDepartment()} disabled={saving}>TAMBAH</button>
          </div>
        </div>
        <div className="employee-config-section">
          <h3>Aturan jadwal otomatis</h3>
        <label className="form-field"><span>Template reguler</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Pilih template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.code} | {template.startTime} - {template.endTime}</option>)}</select></label>
        <fieldset className="weekday-field"><legend>Hari kerja reguler</legend><div>{weekdays.map((day) => <label key={day.value}><input type="checkbox" checked={workdays.includes(day.value)} onChange={(event) => setWorkdays((current) => event.target.checked ? [...current, day.value].sort() : current.filter((value) => value !== day.value))} /><span>{day.label}</span></label>)}</div></fieldset>
        <label className="form-field"><span>Buffer lembur sesudah jadwal</span><div className="input-with-suffix"><input type="number" min="0" max="240" value={overtimeBuffer} onChange={(event) => setOvertimeBuffer(Number(event.target.value))} /><span>menit</span></div></label>
        <label className="check-field config-check"><input type="checkbox" checked={weekendOvertime} onChange={(event) => setWeekendOvertime(event.target.checked)} /><span>Scan di luar hari kerja menjadi kandidat lembur otomatis</span></label>
        <div className="config-actions"><button className="primary-button" type="button" onClick={() => void saveProfile()} disabled={saving}>{saving ? "MENYIMPAN..." : "SIMPAN PROFIL"}</button>{profiles[selectedEmployee.id] ? <button className="danger-button" type="button" onClick={() => void removeProfile()} disabled={saving}>NONAKTIFKAN PROFIL</button> : null}</div>
        </div>
      </div>
    </section> : null}
    <section className="panel employee-directory-panel">
      <div className="panel-heading"><div><h2>Direktori karyawan</h2><p>{filtered.length} dari {records.length} karyawan ditampilkan.</p></div></div>
      <div className="data-toolbar">
        <label className="form-field data-toolbar-search"><span>Cari</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, kode, PIN, atau departemen" /></label>
        <label className="form-field"><span>Kelengkapan data</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Semua karyawan</option><option value="PROFILED">Sudah ada profil</option><option value="NO_PROFILE">Belum ada profil</option><option value="NO_DEPARTMENT">Tanpa departemen</option><option value="NO_MAPPING">Tanpa mapping X105</option></select></label>
      </div>
      {loading ? <div className="table-skeleton">{Array.from({ length: 7 }).map((_, index) => <span key={index} />)}</div> : null}
      {!loading && filtered.length === 0 ? <div className="feedback-state"><strong>Karyawan tidak ditemukan.</strong><p>Ubah kata kunci atau filter kelengkapan.</p></div> : null}
      {!loading && filtered.length > 0 ? <div className="table-wrap employee-table-wrap"><table className="employee-table"><thead><tr><th>Karyawan</th><th>Organisasi</th><th>Mapping X105</th><th>Profil kerja</th><th>Akses</th><th>Tindakan</th></tr></thead><tbody>{filtered.map((employee) => {
        const profile = profiles[employee.id];
        return <tr key={employee.id}>
          <td><strong className="table-primary">{employee.name}</strong><small className="table-secondary">ID {employee.employeeCode}{employee.email ? ` · ${employee.email}` : ""}</small></td>
          <td><strong>{employee.departmentName ?? "Belum dipetakan"}</strong><small className="table-secondary">{employee.siteName ?? "Site Sangatta"}</small></td>
          <td>{employee.deviceMappings.length ? employee.deviceMappings.map((mapping) => <span className="device-mapping" key={`${mapping.deviceSerial}-${mapping.deviceUserCode}`}><code>PIN {mapping.deviceUserCode}</code><small>{mapping.deviceSerial}</small></span>) : <StatusBadge tone="danger">BELUM TERHUBUNG</StatusBadge>}</td>
          <td>{profile ? <><StatusBadge tone="on-time">{profile.scheduleTemplateCode}</StatusBadge><small className="table-secondary">{profile.workdays.map((day) => weekdays.find((item) => item.value === day)?.label).join(", ")} · buffer {profile.overtimeBufferMinutes} menit</small></> : <StatusBadge tone="pending">BELUM DIATUR</StatusBadge>}</td>
          <td><code>{employee.role}</code><small className="table-secondary">{employee.isActive ? "Aktif" : "Nonaktif"}</small></td>
          <td><button className="secondary-button compact-button" type="button" onClick={() => openProfile(employee)}>ATUR PROFIL</button></td>
        </tr>;
      })}</tbody></table></div> : null}
    </section>
  </>;
}
