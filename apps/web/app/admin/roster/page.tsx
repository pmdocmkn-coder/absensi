"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge, type AttendanceTone } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Employee = { id: number; name: string; employeeCode: string; departmentName: string | null };
type Template = { id: string; name: string; code: string; kind: string };
type AssignmentType = "REGULAR" | "OFF" | "LEAVE" | "ON_CALL" | "OVERTIME";
type Assignment = {
  id: string;
  employeeId: number;
  assignmentDate: string;
  assignmentType: AssignmentType;
  scheduleTemplateId: string | null;
  scheduleTemplateName: string | null;
  scheduleTemplateCode: string | null;
  notes: string | null;
};

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function mondayOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function toneFor(type: AssignmentType): AttendanceTone {
  if (type === "OFF") return "off";
  if (type === "LEAVE") return "leave";
  if (type === "ON_CALL") return "on-call";
  if (type === "OVERTIME") return "overtime";
  return "pending";
}

function labelFor(assignment: Assignment) {
  if (assignment.assignmentType === "REGULAR") return assignment.scheduleTemplateName ?? "Reguler";
  if (assignment.assignmentType === "ON_CALL") return "On-call";
  if (assignment.assignmentType === "OVERTIME") return "Lembur";
  if (assignment.assignmentType === "LEAVE") return "Cuti";
  return "Off";
}

export default function RosterPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const from = formatDate(days[0]!);
  const to = formatDate(days[6]!);

  const load = async () => {
    try {
      const [rosterResponse, employeeResponse, templateResponse] = await Promise.all([
        fetch(`${API_URL}/api/roster?from=${from}&to=${to}`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" })
      ]);
      const [rosterPayload, employeePayload, templatePayload] = await Promise.all([
        rosterResponse.json() as Promise<{ records?: Assignment[]; error?: { message?: string } }>,
        employeeResponse.json() as Promise<{ records?: Employee[]; error?: { message?: string } }>,
        templateResponse.json() as Promise<{ records?: Template[]; error?: { message?: string } }>
      ]);
      if (!rosterResponse.ok) throw new Error(rosterPayload.error?.message ?? "Gagal memuat roster");
      if (!employeeResponse.ok) throw new Error(employeePayload.error?.message ?? "Gagal memuat karyawan");
      if (!templateResponse.ok) throw new Error(templatePayload.error?.message ?? "Gagal memuat template");
      setAssignments(rosterPayload.records ?? []);
      setEmployees(employeePayload.records ?? []);
      setTemplates(templatePayload.records ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat roster");
    }
  };

  useEffect(() => { void load(); }, [from, to]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const assignmentType = String(form.get("assignmentType")) as AssignmentType;
    const templateId = String(form.get("scheduleTemplateId") ?? "");
    try {
      const response = await fetch(`${API_URL}/api/roster`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: Number(form.get("employeeId")),
          assignmentDate: form.get("assignmentDate"),
          assignmentType,
          scheduleTemplateId: templateId || null,
          notes: form.get("notes") || null
        })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan penugasan");
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan penugasan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Kalender roster terpadu" description="Atur jadwal reguler, off, cuti, on-call, dan lembur pada satu tanggal. On-call dapat menjadi overlay di atas jadwal reguler." />
      <div className="notice"><strong>Aturan data</strong><span>Reguler membutuhkan template jam. Off dan cuti tidak memakai template. On-call dan lembur dapat ditambahkan bersama jadwal reguler.</span></div>
      <section className="roster-controls panel">
        <div className="week-navigation">
          <button type="button" className="secondary-button" onClick={() => setWeekStart((value) => addDays(value, -7))}>MINGGU SEBELUMNYA</button>
          <strong>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(days[0]!)} - {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(days[6]!)}</strong>
          <button type="button" className="secondary-button" onClick={() => setWeekStart((value) => addDays(value, 7))}>MINGGU BERIKUTNYA</button>
        </div>
        <form className="roster-form" onSubmit={submit}>
          <label className="form-field"><span>Karyawan</span><select name="employeeId" required defaultValue=""><option value="" disabled>Pilih karyawan</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeCode})</option>)}</select></label>
          <label className="form-field"><span>Tanggal</span><input name="assignmentDate" type="date" min={from} max={to} defaultValue={from} required /></label>
          <label className="form-field"><span>Jenis penugasan</span><select name="assignmentType" defaultValue="REGULAR"><option value="REGULAR">Reguler</option><option value="ON_CALL">On-call</option><option value="OVERTIME">Lembur</option><option value="LEAVE">Cuti</option><option value="OFF">Off</option></select></label>
          <label className="form-field"><span>Template jam</span><select name="scheduleTemplateId" defaultValue=""><option value="">Tanpa template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.code})</option>)}</select></label>
          <label className="form-field roster-notes"><span>Keterangan</span><input name="notes" maxLength={1000} placeholder="Opsional" /></label>
          <button className="primary-button" type="submit" disabled={submitting || employees.length === 0}>{submitting ? "MENYIMPAN..." : "TAMBAH KE ROSTER"}</button>
        </form>
      </section>
      {error ? <div className="notice notice-error"><strong>Roster belum diperbarui</strong><span>{error}</span></div> : null}
      <section className="panel roster-panel">
        <div className="panel-heading"><div><h2>Roster mingguan</h2><p>{assignments.length} penugasan tersimpan untuk minggu ini.</p></div><div className="legend"><StatusBadge tone="pending">Reguler</StatusBadge><StatusBadge tone="on-call">On-call</StatusBadge><StatusBadge tone="leave">Cuti</StatusBadge><StatusBadge tone="off">Off</StatusBadge></div></div>
        <div className="roster-scroll">
          <div className="roster-grid roster-header-row">
            <div className="roster-employee-column">Karyawan</div>
            {days.map((day) => (
              <div key={formatDate(day)} className={formatDate(day) === formatDate(new Date()) ? "roster-current" : ""}>
                <span>{new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong>
              </div>
            ))}
          </div>
          {employees.map((employee) => (
            <div className="roster-grid roster-data-row" key={employee.id}>
              <div className="roster-employee-column"><strong>{employee.name}</strong><span>{employee.departmentName ?? "Belum ada departemen"}</span></div>
              {days.map((day) => {
                const cellAssignments = assignments.filter((assignment) => assignment.employeeId === employee.id && assignment.assignmentDate === formatDate(day));
                return (
                  <div className={formatDate(day) === formatDate(new Date()) ? "roster-current roster-cell-stack" : "roster-cell-stack"} key={`${employee.id}-${formatDate(day)}`}>
                    {cellAssignments.map((assignment) => <StatusBadge key={assignment.id} tone={toneFor(assignment.assignmentType)}>{labelFor(assignment)}</StatusBadge>)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
