"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import { CustomSelect, type DropdownOption } from "../../components/custom-dropdown";
import { EmployeeImport } from "../../components/employee-import";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const KEEP_EXISTING = "__KEEP_EXISTING__";
const weekdays = [{ value: 1, label: "Sen" }, { value: 2, label: "Sel" }, { value: 3, label: "Rab" }, { value: 4, label: "Kam" }, { value: 5, label: "Jum" }, { value: 6, label: "Sab" }, { value: 7, label: "Min" }];
const roleOptions: DropdownOption[] = [{ value: "EMPLOYEE", label: "Karyawan" }, { value: "SUPERVISOR", label: "Supervisor" }, { value: "ADMIN", label: "Admin" }];
const rosterGroupOptions: DropdownOption[] = [
  { value: "", label: "Pilih kelompok Crew" },
  { value: "Crew A", label: "Crew A" },
  { value: "Crew B", label: "Crew B" },
  { value: "Crew C", label: "Crew C" }
];
const completenessOptions: DropdownOption[] = [
  { value: "ALL", label: "Semua karyawan" }, { value: "PROFILED", label: "Sudah ada profil" },
  { value: "NO_PROFILE", label: "Belum ada profil" }, { value: "NO_DEPARTMENT", label: "Tanpa departemen" },
  { value: "NO_MAPPING", label: "Tanpa mapping X105" }
];

type Employee = {
  id: number; employeeCode: string; name: string; email: string | null; departmentName: string | null;
  siteId: string | null; siteName: string | null; departmentId: string | null; role: string; isActive: boolean;
  deviceMappings: Array<{ deviceSerial: string; deviceUserCode: string }>;
};
type Department = { id: string; siteId: string; code: string; name: string; isActive: boolean };
type Template = { id: string; code: string; name: string; kind: string; isActive: boolean; startTime: string; endTime: string };
type ScheduleProfile = { employeeId: number; scheduleTemplateId: string; scheduleTemplateCode: string; scheduleTemplateName: string; workdays: number[]; weeklyTemplates?: Array<{ day: number; scheduleTemplateId: string }>; autoWeekendOvertime: boolean };
type WorkMode = "FIXED" | "ROSTER" | "NONE";
type EmployeeWorkMode = { employeeId: number; mode: WorkMode; rosterGroup: string | null };

export default function EmployeesPage() {
  const [records, setRecords] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<Record<number, ScheduleProfile>>({});
  const [workModes, setWorkModes] = useState<Record<number, EmployeeWorkMode>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [bulkTargetIds, setBulkTargetIds] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyTemplateIds, setWeeklyTemplateIds] = useState<Record<number, string>>({});
  const [weekendOvertime, setWeekendOvertime] = useState(true);
  const [workMode, setWorkMode] = useState<WorkMode>("NONE");
  const [rosterGroup, setRosterGroup] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [newDepartmentCode, setNewDepartmentCode] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/departments`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-profiles`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employee-work-modes`, { credentials: "include", cache: "no-store" })
      ]);
      const [employeePayload, departmentPayload, templatePayload, profilePayload, workModePayload] = await Promise.all(responses.map((response) => response.json())) as [
        { records?: Employee[]; error?: { message?: string } },
        { records?: Department[]; error?: { message?: string } },
        { records?: Template[]; error?: { message?: string } },
        { records?: ScheduleProfile[]; error?: { message?: string } },
        { records?: EmployeeWorkMode[]; error?: { message?: string } }
      ];
      if (!responses[0].ok) throw new Error(employeePayload.error?.message ?? "Gagal memuat karyawan");
      if (!responses[1].ok) throw new Error(departmentPayload.error?.message ?? "Gagal memuat departemen");
      if (!responses[2].ok) throw new Error(templatePayload.error?.message ?? "Gagal memuat template kerja");
      if (!responses[3].ok) throw new Error(profilePayload.error?.message ?? "Gagal memuat profil kerja");
      if (!responses[4].ok) throw new Error(workModePayload.error?.message ?? "Gagal memuat pola kerja");
      setRecords(employeePayload.records ?? []);
      setDepartments(departmentPayload.records ?? []);
      setTemplates((templatePayload.records ?? []).filter((template) => template.isActive && template.kind === "REGULAR"));
      setProfiles(Object.fromEntries((profilePayload.records ?? []).map((profile) => [profile.employeeId, profile])));
      setWorkModes(Object.fromEntries((workModePayload.records ?? []).map((item) => [item.employeeId, item])));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat karyawan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedEmployee = records.find((employee) => employee.id === selectedId) ?? null;
  const isBulkProfile = bulkTargetIds.length > 0;
  const profileTargetIds = isBulkProfile ? bulkTargetIds : selectedEmployee ? [selectedEmployee.id] : [];
  const departmentOptions = useMemo<DropdownOption[]>(() => [
    { value: "", label: "Belum dipetakan" },
    ...departments.map((department) => ({ value: department.id, label: `${department.code} | ${department.name}` }))
  ], [departments]);
  const bulkDepartmentOptions = useMemo<DropdownOption[]>(() => [
    { value: KEEP_EXISTING, label: "Tidak diubah" },
    ...departmentOptions
  ], [departmentOptions]);
  const bulkRoleOptions = useMemo<DropdownOption[]>(() => [
    { value: KEEP_EXISTING, label: "Tidak diubah" },
    ...roleOptions
  ], []);
  const templateOptions = useMemo<DropdownOption[]>(() => [
    { value: "", label: "Pilih template" },
    ...templates.map((template) => ({ value: template.id, label: `${template.code} | ${template.startTime} - ${template.endTime}` }))
  ], [templates]);
  const profileWeek = (profile: ScheduleProfile | undefined, fallbackTemplateId: string) => Object.fromEntries(
    (profile?.workdays ?? [1, 2, 3, 4, 5]).map((day) => [day, profile?.weeklyTemplates?.find((item) => item.day === day)?.scheduleTemplateId ?? profile?.scheduleTemplateId ?? fallbackTemplateId])
  ) as Record<number, string>;
  const openProfile = (employee: Employee) => {
    const profile = profiles[employee.id];
    const savedMode = workModes[employee.id];
    setSelectedId(employee.id);
    setBulkTargetIds([]);
    setTemplateId(profile?.scheduleTemplateId ?? "");
    setWorkdays(profile?.workdays ?? [1, 2, 3, 4, 5]);
    setWeeklyTemplateIds(profileWeek(profile, profile?.scheduleTemplateId ?? ""));
    setWeekendOvertime(profile?.autoWeekendOvertime ?? true);
    setWorkMode(savedMode?.mode ?? (profile ? "FIXED" : "NONE"));
    setRosterGroup(savedMode?.rosterGroup ?? "");
    setDepartmentId(employee.departmentId ?? "");
    setRole(employee.role);
    setError("");
    setSuccess("");
  };

  const openBulkProfile = () => {
    const targets = records.filter((employee) => checkedIds.includes(employee.id));
    if (!targets.length) return;
    const first = targets[0]!;
    const firstProfile = profiles[first.id];
    const firstMode = workModes[first.id];
    const inferredMode = firstMode?.mode ?? (firstProfile ? "FIXED" : "NONE");
    setSelectedId(null);
    setBulkTargetIds(targets.map((employee) => employee.id));
    setTemplateId(firstProfile?.scheduleTemplateId ?? "");
    setWorkdays(firstProfile?.workdays ?? [1, 2, 3, 4, 5]);
    setWeeklyTemplateIds(profileWeek(firstProfile, firstProfile?.scheduleTemplateId ?? ""));
    setWeekendOvertime(firstProfile?.autoWeekendOvertime ?? true);
    setWorkMode(inferredMode);
    setRosterGroup(firstMode?.rosterGroup ?? "");
    setDepartmentId(KEEP_EXISTING);
    setRole(KEEP_EXISTING);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const saveWorkSetup = async () => {
    if (!profileTargetIds.length) return;
    if (workMode === "FIXED" && (!templateId || workdays.length === 0 || workdays.some((day) => !weeklyTemplateIds[day]))) { setError("Untuk jadwal tetap, pilih template untuk setiap hari kerja."); return; }
    if (workMode === "ROSTER" && !rosterGroup.trim()) { setError("Isi kelompok roster, misalnya Crew A, Crew B, atau Crew C."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/employee-work-modes/bulk/setup`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeIds: profileTargetIds,
          mode: workMode,
          rosterGroup: workMode === "ROSTER" ? rosterGroup.trim() : null,
          ...(isBulkProfile && departmentId === KEEP_EXISTING ? {} : { departmentId: departmentId || null }),
          ...(isBulkProfile && role === KEEP_EXISTING ? {} : { role }),
          profile: workMode === "FIXED" ? {
            scheduleTemplateId: templateId,
            workdays,
            weeklyTemplates: workdays.map((day) => ({ day, scheduleTemplateId: weeklyTemplateIds[day] ?? templateId })),
            autoWeekendOvertime: weekendOvertime
          } : null
        })
      });
      const payload = await response.json() as { total?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan seluruh perubahan");
      await load();
      setError("");
      if (isBulkProfile) {
        setCheckedIds([]);
        setBulkTargetIds([]);
        setSuccess(`${payload.total ?? profileTargetIds.length} profil karyawan berhasil diperbarui.`);
      } else if (selectedEmployee) setSuccess(`Data organisasi dan pola kerja ${selectedEmployee.name} berhasil diperbarui.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menyimpan seluruh perubahan"); }
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
  const deviceSerials = [...new Set(records.flatMap((employee) => employee.deviceMappings.map((mapping) => mapping.deviceSerial)))];
  const visibleIds = filtered.map((employee) => employee.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => checkedIds.includes(id));
  const toggleVisible = () => setCheckedIds((current) => allVisibleSelected
    ? current.filter((id) => !visibleIds.includes(id))
    : [...new Set([...current, ...visibleIds])]);
  const toggleEmployee = (employeeId: number) => setCheckedIds((current) => current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]);

  return <>
    <PageHeader title="Data karyawan" description="Kelola identitas, mapping PIN X105, dan profil jadwal otomatis dari satu direktori." />
    <div className="attendance-summary employee-summary">
      <div><span>Karyawan aktif</span><strong>{records.filter((employee) => employee.isActive).length}</strong></div>
      <div><span>Jadwal tetap</span><strong>{Object.values(workModes).filter((item) => item.mode === "FIXED").length || Object.keys(profiles).length}</strong></div>
      <div><span>Tanpa departemen</span><strong>{missingDepartment}</strong></div>
      <div><span>Tanpa mapping X105</span><strong>{missingMapping}</strong></div>
    </div>
    {error ? <div className="notice notice-error"><strong>Perlu diperiksa</strong><span>{error}</span></div> : null}
    {success ? <div className="notice notice-success"><strong>Perubahan tersimpan</strong><span>{success}</span></div> : null}
    {selectedEmployee || isBulkProfile ? <section className="panel employee-config-panel">
      <div className="panel-heading"><div><h2>{isBulkProfile ? `Atur profil ${profileTargetIds.length} karyawan` : `Atur pola kerja: ${selectedEmployee!.name}`}</h2><p>{isBulkProfile ? "Satu pengaturan akan diterapkan ke seluruh karyawan yang dipilih." : <><code>{selectedEmployee!.employeeCode}</code> Pilih satu pola; roster harian selalu menjadi prioritas di atas jadwal tetap.</>}</p></div><button className="secondary-button" type="button" onClick={() => { setSelectedId(null); setBulkTargetIds([]); }}>TUTUP</button></div>
      <div className="employee-config-grid">
        <div className="employee-config-section">
          <h3>Data organisasi</h3>
          <div className="employee-config-fields">
            <div className="form-field"><span>Departemen</span><CustomSelect ariaLabel="Pilih departemen" value={departmentId} options={isBulkProfile ? bulkDepartmentOptions : departmentOptions} onChange={setDepartmentId} /></div>
            <div className="form-field"><span>Akses aplikasi</span><CustomSelect ariaLabel="Pilih akses aplikasi" value={role} options={isBulkProfile ? bulkRoleOptions : roleOptions} onChange={setRole} /></div>
          </div>
          <p className="employee-bulk-org-help">{isBulkProfile ? <>Pilih <b>Tidak diubah</b> untuk mempertahankan data setiap karyawan.</> : <>Departemen dan akses akan disimpan bersama pola kerja.</>}</p>
          {!isBulkProfile ? <div className="department-quick-add">
            <strong>Departemen belum ada?</strong>
            <input value={newDepartmentCode} onChange={(event) => setNewDepartmentCode(event.target.value.toUpperCase())} placeholder="Kode, mis. OPS" maxLength={20} />
            <input value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="Nama departemen" maxLength={120} />
            <button className="secondary-button compact-button" type="button" onClick={() => void addDepartment()} disabled={saving}>TAMBAH</button>
          </div> : null}
        </div>
        <div className="employee-config-section">
          <h3>Pola kerja</h3>
          {isBulkProfile ? <div className="bulk-profile-targets"><strong>{profileTargetIds.length} karyawan terpilih</strong><span>{records.filter((employee) => profileTargetIds.includes(employee.id)).slice(0, 4).map((employee) => employee.name).join(", ")}{profileTargetIds.length > 4 ? ` dan ${profileTargetIds.length - 4} lainnya` : ""}</span></div> : null}
          <div className="work-mode-picker" role="radiogroup" aria-label="Pola kerja">
            <button className={workMode === "FIXED" ? "is-selected" : ""} type="button" onClick={() => setWorkMode("FIXED")}><strong>Jadwal tetap</strong><small>Steady Day / ADM</small></button>
            <button className={workMode === "ROSTER" ? "is-selected" : ""} type="button" onClick={() => setWorkMode("ROSTER")}><strong>Shift roster</strong><small>Pagi, malam, OFF dari kalender</small></button>
            <button className={workMode === "NONE" ? "is-selected" : ""} type="button" onClick={() => setWorkMode("NONE")}><strong>Belum dijadwalkan</strong><small>Butuh pengaturan kemudian</small></button>
          </div>
          {workMode === "FIXED" ? <div className="work-mode-detail">
            <p>Dipakai untuk karyawan dengan jam yang sama setiap minggu. Scan di luar hari kerja dapat dikenali sebagai kandidat lembur.</p>
            <div className="form-field"><span>Template default</span><CustomSelect ariaLabel="Pilih template default" value={templateId} options={templateOptions} onChange={(nextTemplateId) => { setTemplateId(nextTemplateId); setWeeklyTemplateIds((current) => Object.fromEntries(workdays.map((day) => [day, current[day] || nextTemplateId])) as Record<number, string>); }} /></div>
            <fieldset className="weekly-template-field"><legend>Jam kerja per hari</legend><p>Hari aktif memakai template default. Ubah hanya hari yang jamnya berbeda, misalnya Sabtu setengah hari.</p><div>{weekdays.map((day) => {
              const enabled = workdays.includes(day.value);
              return <div className={enabled ? "is-enabled" : ""} key={day.value}><label><input type="checkbox" checked={enabled} onChange={(event) => {
                if (event.target.checked) {
                  setWorkdays((current) => [...current, day.value].sort());
                  setWeeklyTemplateIds((current) => ({ ...current, [day.value]: current[day.value] ?? templateId }));
                } else {
                  setWorkdays((current) => current.filter((value) => value !== day.value));
                  setWeeklyTemplateIds((current) => { const next = { ...current }; delete next[day.value]; return next; });
                }
              }} /><span>{day.label}</span></label>
              {enabled ? <CustomSelect className="weekly-template-dropdown" ariaLabel={`Template ${day.label}`} value={weeklyTemplateIds[day.value] ?? templateId} options={templateOptions} onChange={(value) => setWeeklyTemplateIds((current) => ({ ...current, [day.value]: value }))} /> : <small>Libur</small>}</div>;
            })}</div></fieldset>
            <label className="check-field config-check"><input type="checkbox" checked={weekendOvertime} onChange={(event) => setWeekendOvertime(event.target.checked)} /><span>Scan di luar hari kerja menjadi kandidat lembur otomatis</span></label>
          </div> : null}
          {workMode === "ROSTER" ? <div className="work-mode-detail"><p>Jangan pilih Shift Pagi atau Shift Malam di sini. Tentukan kelompoknya, lalu isi P/M/OFF pada Kalender Roster. Sistem mengikuti roster per tanggal.</p><div className="form-field"><span>Kelompok roster</span><CustomSelect ariaLabel="Pilih kelompok roster" value={rosterGroup} options={rosterGroupOptions} onChange={setRosterGroup} /></div></div> : null}
          {workMode === "NONE" ? <div className="work-mode-detail"><p>Karyawan belum diproses absensi otomatis. Setelah data siap, ubah ke Jadwal tetap atau Shift roster.</p></div> : null}
          <div className="config-actions"><button className="primary-button" type="button" onClick={() => void saveWorkSetup()} disabled={saving}>{saving ? "MENYIMPAN..." : isBulkProfile ? `SIMPAN ${profileTargetIds.length} KARYAWAN` : "SIMPAN SEMUA PERUBAHAN"}</button></div>
        </div>
      </div>
    </section> : null}
    <section className="panel employee-directory-panel">
      <div className="panel-heading"><div><h2>Direktori karyawan</h2><p>{filtered.length} dari {records.length} karyawan ditampilkan.</p></div><EmployeeImport defaultDeviceSerial={deviceSerials.length === 1 ? deviceSerials[0] : ""} onImported={load} /></div>
      <div className="data-toolbar">
        <label className="form-field data-toolbar-search"><span>Cari</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, kode, PIN, atau departemen" /></label>
        <div className="form-field"><span>Kelengkapan data</span><CustomSelect ariaLabel="Filter kelengkapan data" value={filter} options={completenessOptions} onChange={setFilter} /></div>
      </div>
      {checkedIds.length ? <div className="employee-bulk-bar"><div><strong>{checkedIds.length} karyawan dipilih</strong><span>Pilih karyawan dengan kebutuhan pola kerja yang sama.</span></div><div><button className="text-button" type="button" onClick={toggleVisible}>{allVisibleSelected ? "Batalkan hasil filter" : "Pilih semua hasil filter"}</button><button className="secondary-button" type="button" onClick={() => setCheckedIds([])}>KOSONGKAN</button><button className="primary-button" type="button" onClick={openBulkProfile}>ATUR PROFIL TERPILIH</button></div></div> : null}
      {loading ? <div className="table-skeleton">{Array.from({ length: 7 }).map((_, index) => <span key={index} />)}</div> : null}
      {!loading && filtered.length === 0 ? <div className="feedback-state"><strong>Karyawan tidak ditemukan.</strong><p>Ubah kata kunci atau filter kelengkapan.</p></div> : null}
      {!loading && filtered.length > 0 ? <div className="table-wrap employee-table-wrap"><table className="employee-table"><thead><tr><th><label className="employee-select-heading"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} /><span>Karyawan</span></label></th><th>Organisasi</th><th>Mapping X105</th><th>Profil kerja</th><th>Akses</th><th>Tindakan</th></tr></thead><tbody>{filtered.map((employee) => {
        const profile = profiles[employee.id];
        const mode = workModes[employee.id]?.mode ?? (profile ? "FIXED" : "NONE");
        return <tr className={checkedIds.includes(employee.id) ? "is-selected" : ""} key={employee.id}>
          <td><label className="employee-select-cell"><input type="checkbox" checked={checkedIds.includes(employee.id)} onChange={() => toggleEmployee(employee.id)} /><span><strong className="table-primary">{employee.name}</strong><small className="table-secondary">ID {employee.employeeCode}{employee.email ? ` · ${employee.email}` : ""}</small></span></label></td>
          <td><strong>{employee.departmentName ?? "Belum dipetakan"}</strong><small className="table-secondary">{employee.siteName ?? "Site Sangatta"}</small></td>
          <td>{employee.deviceMappings.length ? employee.deviceMappings.map((mapping) => <span className="device-mapping" key={`${mapping.deviceSerial}-${mapping.deviceUserCode}`}><code>PIN {mapping.deviceUserCode}</code><small>{mapping.deviceSerial}</small></span>) : <StatusBadge tone="danger">BELUM TERHUBUNG</StatusBadge>}</td>
          <td>{mode === "FIXED" && profile ? <><StatusBadge tone="on-time">{profile.scheduleTemplateCode}</StatusBadge><small className="table-secondary">Jadwal tetap · {profile.workdays.map((day) => weekdays.find((item) => item.value === day)?.label).join(", ")}</small></> : mode === "ROSTER" ? <><StatusBadge tone="on-call">SHIFT ROSTER</StatusBadge><small className="table-secondary">{workModes[employee.id]?.rosterGroup} · atur P/M/OFF di kalender</small></> : <StatusBadge tone="pending">BELUM DIJADWALKAN</StatusBadge>}</td>
          <td><code>{employee.role}</code><small className="table-secondary">{employee.isActive ? "Aktif" : "Nonaktif"}</small></td>
          <td><button className="secondary-button compact-button" type="button" onClick={() => openProfile(employee)}>ATUR PROFIL</button></td>
        </tr>;
      })}</tbody></table></div> : null}
    </section>
  </>;
}
