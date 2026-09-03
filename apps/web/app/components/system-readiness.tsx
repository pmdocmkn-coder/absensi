"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Metric } from "./metric";
import { StatusBadge } from "./status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Employee = { id: number; departmentName: string | null; deviceMappings: Array<{ deviceSerial: string; deviceUserCode: string }> };
type Template = { code: string; isActive: boolean; kind: string };
type WorkMode = { employeeId: number; mode: "FIXED" | "ROSTER" | "NONE"; rosterGroup: string | null };
type Assignment = { employeeId: number; assignmentDate: string };
type ApiPayload<T> = { records?: T[]; events?: unknown[]; error?: { message?: string } };

function isPitCrewDepartment(name: string | null) {
  return /\bpit\s*crew\b/i.test(name ?? "");
}

function bookPeriod(date = new Date()) {
  const start = date.getDate() >= 16
    ? new Date(date.getFullYear(), date.getMonth(), 16)
    : new Date(date.getFullYear(), date.getMonth() - 1, 16);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 15);
  const format = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { from: format(start), to: format(end), days: Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 };
}

export function SystemReadiness() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [receiverOnline, setReceiverOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const period = bookPeriod();
    try {
      const responses = await Promise.all([
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employee-work-modes`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/roster?from=${period.from}&to=${period.to}`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/events?limit=1`, { credentials: "include", cache: "no-store" })
      ]);
      const [employeeData, templateData, modeData, rosterData] = await Promise.all(responses.slice(0, 4).map((response) => response.json())) as [ApiPayload<Employee>, ApiPayload<Template>, ApiPayload<WorkMode>, ApiPayload<Assignment>];
      if (!responses[0].ok) throw new Error(employeeData.error?.message ?? "Data karyawan tidak dapat dimuat");
      if (!responses[1].ok) throw new Error(templateData.error?.message ?? "Template jam tidak dapat dimuat");
      if (!responses[2].ok) throw new Error(modeData.error?.message ?? "Pola kerja tidak dapat dimuat");
      if (!responses[3].ok) throw new Error(rosterData.error?.message ?? "Roster tidak dapat dimuat");
      setEmployees(employeeData.records ?? []);
      setTemplates(templateData.records ?? []);
      setWorkModes(modeData.records ?? []);
      setAssignments(rosterData.records ?? []);
      setReceiverOnline(responses[4].ok);
      setError("");
    } catch (reason) {
      setReceiverOnline(false);
      setError(reason instanceof Error ? reason.message : "Kesiapan sistem belum dapat diperiksa");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readiness = useMemo(() => {
    const modes = new Map(workModes.map((mode) => [mode.employeeId, mode]));
    const withoutDepartment = employees.filter((employee) => !employee.departmentName).length;
    const withoutMapping = employees.filter((employee) => employee.deviceMappings.length === 0).length;
    const pitEmployees = employees.filter((employee) => isPitCrewDepartment(employee.departmentName));
    const pitWithoutCrew = pitEmployees.filter((employee) => {
      const mode = modes.get(employee.id);
      return mode?.mode !== "ROSTER" || !mode.rosterGroup?.trim();
    }).length;
    const requiredTemplates = ["STEADY_DAY", "SHIFT_PAGI", "SHIFT_MALAM"];
    const activeTemplateCodes = new Set(templates.filter((template) => template.isActive && template.kind === "REGULAR").map((template) => template.code));
    const missingTemplates = requiredTemplates.filter((code) => !activeTemplateCodes.has(code));
    const periodDays = bookPeriod().days;
    const pitRosterCells = new Set(assignments
      .filter((assignment) => pitEmployees.some((employee) => employee.id === assignment.employeeId))
      .map((assignment) => `${assignment.employeeId}|${assignment.assignmentDate}`)).size;
    const pitRosterTarget = pitEmployees.length * periodDays;
    const pending = [
      !receiverOnline,
      withoutDepartment > 0 || withoutMapping > 0,
      missingTemplates.length > 0,
      pitWithoutCrew > 0,
      pitEmployees.length > 0 && pitRosterCells < pitRosterTarget
    ].filter(Boolean).length;
    return { withoutDepartment, withoutMapping, pitEmployees: pitEmployees.length, pitWithoutCrew, missingTemplates, pitRosterCells, pitRosterTarget, pending };
  }, [assignments, employees, receiverOnline, templates, workModes]);

  return <>
    <section className="metric-grid" aria-label="Ringkasan kesiapan administrasi">
      <Metric label="Karyawan terdaftar" value={loading ? "…" : String(employees.length)} note={loading ? "Memeriksa data" : readiness.withoutDepartment || readiness.withoutMapping ? `${readiness.withoutDepartment} tanpa departemen · ${readiness.withoutMapping} tanpa PIN` : "Data organisasi dan PIN lengkap"} emphasis />
      <Metric label="Receiver API" value={receiverOnline === null ? "…" : receiverOnline ? "Online" : "Offline"} note={receiverOnline ? "Endpoint X105 dapat dijangkau" : "Periksa API Bun di port 8080"} />
      <Metric label="Roster PIT" value={loading ? "…" : `${readiness.pitRosterCells}/${readiness.pitRosterTarget}`} note={loading ? "Memeriksa periode aktif" : readiness.pitEmployees === 0 ? "Tidak ada karyawan PIT Crew" : "Sel terjadwal pada periode aktif"} />
      <Metric label="Langkah tersisa" value={loading ? "…" : String(readiness.pending)} note={loading ? "Menghitung kesiapan" : readiness.pending === 0 ? "Siap untuk evaluasi otomatis" : "Lihat checklist di bawah"} />
    </section>

    {error ? <div className="notice notice-error" role="alert"><strong>Kesiapan belum dapat dimuat</strong><span>{error}</span></div> : null}

    <section className="panel readiness-panel" aria-live="polite">
      <div className="panel-heading"><div><h2>Kesiapan sistem</h2><p>{loading ? "Memeriksa konfigurasi…" : readiness.pending === 0 ? "Seluruh prasyarat operasional telah siap." : `${readiness.pending} hal masih perlu diselesaikan sebelum absensi dijalankan penuh.`}</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>{loading ? "MEMERIKSA" : "PERBARUI"}</button></div>
      <ol className="readiness-list">
        <li className={receiverOnline ? "readiness-complete" : "readiness-pending"}><strong>Receiver dan log X105</strong><span>{receiverOnline ? "API receiver dapat dijangkau. Scan baru siap diterima." : "Jalankan API Bun lalu pastikan port 8080 dapat dijangkau."}</span><StatusBadge tone={receiverOnline ? "on-time" : "danger"}>{receiverOnline ? "Siap" : "Perlu diperiksa"}</StatusBadge></li>
        <li className={readiness.withoutDepartment === 0 && readiness.withoutMapping === 0 ? "readiness-complete" : "readiness-pending"}><strong>Data karyawan dan PIN</strong><span>{readiness.withoutDepartment || readiness.withoutMapping ? `${readiness.withoutDepartment} tanpa departemen dan ${readiness.withoutMapping} tanpa mapping PIN X105.` : "Seluruh karyawan memiliki departemen dan mapping PIN."}</span><Link href="/admin/karyawan">Buka data karyawan</Link></li>
        <li className={readiness.missingTemplates.length === 0 ? "readiness-complete" : "readiness-pending"}><strong>Template jam inti</strong><span>{readiness.missingTemplates.length === 0 ? "Steady Day, Shift Pagi, dan Shift Malam tersedia." : `Belum tersedia: ${readiness.missingTemplates.join(", ")}.`}</span><Link href="/admin/pengaturan-jam">Buka pengaturan jam</Link></li>
        <li className={readiness.pitWithoutCrew === 0 ? "readiness-complete" : "readiness-pending"}><strong>Kelompok Pit Crew</strong><span>{readiness.pitEmployees === 0 ? "Belum ada karyawan pada departemen PIT Crew." : readiness.pitWithoutCrew === 0 ? `${readiness.pitEmployees} karyawan PIT sudah masuk Crew A, B, atau C.` : `${readiness.pitWithoutCrew} karyawan PIT belum memiliki kelompok crew.`}</span><Link href="/admin/karyawan">Atur pola kerja</Link></li>
        <li className={readiness.pitEmployees === 0 || readiness.pitRosterCells === readiness.pitRosterTarget ? "readiness-complete" : "readiness-pending"}><strong>Roster periode aktif</strong><span>{readiness.pitEmployees === 0 ? "Tidak ada roster PIT yang perlu diterbitkan." : readiness.pitRosterCells === readiness.pitRosterTarget ? `Semua ${readiness.pitRosterTarget} sel roster PIT telah diterbitkan.` : `${readiness.pitRosterCells} dari ${readiness.pitRosterTarget} sel roster PIT telah diisi pada periode aktif.`}</span><Link href="/admin/roster">Buka kalender roster</Link></li>
        <li className="readiness-complete"><strong>Rules engine absensi</strong><span>Aturan masuk, pulang, terlambat, lintas hari, dan kandidat lembur telah aktif.</span><StatusBadge tone="on-time">Aktif</StatusBadge></li>
      </ol>
    </section>
  </>;
}
