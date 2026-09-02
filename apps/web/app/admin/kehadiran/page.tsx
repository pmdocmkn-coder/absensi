"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge, type AttendanceTone } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const statuses = ["PRESENT", "LATE", "OVERTIME", "ON_CALL", "OFF", "LEAVE", "ABSENT", "NEEDS_REVIEW"];

type DailyAttendance = {
  employeeId: number; employeeCode: string; employeeName: string; departmentName: string | null; attendanceDate: string;
  autoStatus: string; status: string; confirmationState: "AUTO" | "CONFIRMED"; checkInAt: string | null; checkOutAt: string | null;
  lateMinutes: number; overtimeMinutes: number; hasOnCall: boolean; notes: string[]; confirmationNote: string | null;
};

function dateToday() { return new Date().toISOString().slice(0, 10); }
function label(status: string) { return ({ PRESENT: "Hadir", LATE: "Terlambat", OVERTIME: "Lembur", ON_CALL: "On-call", OFF: "Off", LEAVE: "Cuti", ABSENT: "Alfa", NEEDS_REVIEW: "Perlu tinjau", PENDING: "Menunggu", NO_SCHEDULE: "Tanpa jadwal" } as Record<string, string>)[status] ?? status; }
function tone(status: string): AttendanceTone { return ({ PRESENT: "on-time", LATE: "late", OVERTIME: "overtime", ON_CALL: "on-call", OFF: "off", LEAVE: "leave", ABSENT: "danger", NEEDS_REVIEW: "pending", PENDING: "pending", NO_SCHEDULE: "pending" } as Record<string, AttendanceTone>)[status] ?? "pending"; }
function time(value: string | null) { return value?.slice(11, 16) ?? "—"; }

export default function AttendanceVerificationPage() {
  const [date, setDate] = useState(dateToday);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/attendance/daily?from=${date}&to=${date}`, { credentials: "include", cache: "no-store" });
      const payload = await response.json() as { records?: DailyAttendance[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat evaluasi absensi");
      const nextRecords = payload.records ?? [];
      setRecords(nextRecords);
      setDrafts(Object.fromEntries(nextRecords.map((record) => [record.employeeId, record.status])));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat evaluasi absensi"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [date]);
  const confirm = async (record: DailyAttendance) => {
    setSaving(record.employeeId);
    try {
      const response = await fetch(`${API_URL}/api/attendance/daily/${record.employeeId}/${record.attendanceDate}/confirm`, {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: drafts[record.employeeId] ?? record.status })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengonfirmasi status");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal mengonfirmasi status"); }
    finally { setSaving(null); }
  };
  const reviewCount = records.filter((record) => record.status === "NEEDS_REVIEW" || record.autoStatus !== record.status).length;
  return <>
    <PageHeader title="Verifikasi absensi" description="Sistem menghitung status dari roster, profil Steady Day, dan scan X105. Admin hanya mengonfirmasi atau memperbaiki pengecualian." action={<StatusBadge tone={reviewCount ? "pending" : "on-time"}>{reviewCount ? `${reviewCount} perlu perhatian` : "Semua otomatis"}</StatusBadge>} />
    <section className="panel">
      <div className="panel-heading"><div><h2>Hasil perhitungan harian</h2><p>On-call adalah overlay roster; lembur terdeteksi dari scan di luar batas kerja.</p></div><label className="form-field"><span>Tanggal</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      {error ? <div className="notice notice-error"><strong>Belum dapat disimpan</strong><span>{error}</span></div> : null}
      {loading ? <div className="feedback-state"><strong>Menghitung status...</strong></div> : null}
      {!loading && <div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Masuk / keluar</th><th>Hasil otomatis</th><th>Keterangan</th><th>Konfirmasi admin</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.employeeId}>
          <td><strong className="table-primary">{record.employeeName}</strong><span className="mapping-line"><code>{record.employeeCode}</code> {record.departmentName ?? "Tanpa departemen"}</span></td>
          <td>{time(record.checkInAt)} / {time(record.checkOutAt)}<span className="mapping-line">{record.lateMinutes ? `Terlambat ${record.lateMinutes}m` : ""}{record.overtimeMinutes ? ` · Lembur ${record.overtimeMinutes}m` : ""}</span></td>
          <td><StatusBadge tone={tone(record.autoStatus)}>{label(record.autoStatus)}</StatusBadge>{record.hasOnCall ? <span className="mapping-line"><StatusBadge tone="on-call">ON-CALL</StatusBadge></span> : null}</td>
          <td>{record.notes.join(" · ") || "—"}</td>
          <td><select value={drafts[record.employeeId] ?? record.status} onChange={(event) => setDrafts((current) => ({ ...current, [record.employeeId]: event.target.value }))}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select><button className="secondary-button" type="button" onClick={() => void confirm(record)} disabled={saving === record.employeeId}>{saving === record.employeeId ? "Simpan..." : record.confirmationState === "CONFIRMED" ? "Ubah" : "Konfirmasi"}</button></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
