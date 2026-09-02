"use client";

import { useEffect, useMemo, useState } from "react";
import { attendanceLabel, attendanceStatuses, attendanceTone, shortTime, type DailyAttendance, witaDate } from "../../components/attendance-display";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function AttendanceVerificationPage() {
  const [date, setDate] = useState(witaDate);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [onlyReview, setOnlyReview] = useState(true);
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
      setNotes(Object.fromEntries(nextRecords.map((record) => [record.employeeId, record.confirmationNote ?? ""])));
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
        body: JSON.stringify({ status: drafts[record.employeeId] ?? record.status, note: notes[record.employeeId] || null })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengonfirmasi status");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal mengonfirmasi status"); }
    finally { setSaving(null); }
  };

  const reviewCount = records.filter((record) => ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(record.autoStatus)).length;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesTerm = !term || `${record.employeeName} ${record.employeeCode} ${record.departmentName ?? ""}`.toLowerCase().includes(term);
      return matchesTerm && (!onlyReview || ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(record.autoStatus));
    });
  }, [records, search, onlyReview]);

  return <>
    <PageHeader title="Verifikasi absensi" description="Sistem menghitung status dari roster, profil kerja, dan scan X105. Admin menangani pengecualian serta mencatat alasan koreksi." action={<StatusBadge tone={reviewCount ? "pending" : "on-time"}>{reviewCount ? `${reviewCount} perlu perhatian` : "Semua siap"}</StatusBadge>} />
    <section className="panel">
      <div className="panel-heading"><div><h2>Antrean verifikasi</h2><p>Setiap perubahan admin tersimpan sebagai status final beserta catatannya.</p></div></div>
      <div className="data-toolbar verification-toolbar">
        <label className="form-field"><span>Tanggal</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="form-field data-toolbar-search"><span>Cari karyawan</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, ID, atau departemen" /></label>
        <label className="check-field"><input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} /><span>Hanya yang perlu ditinjau</span></label>
      </div>
      {error ? <div className="notice notice-error"><strong>Belum dapat disimpan</strong><span>{error}</span></div> : null}
      {loading ? <div className="table-skeleton">{Array.from({ length: 6 }).map((_, index) => <span key={index} />)}</div> : null}
      {!loading && filtered.length === 0 ? <div className="feedback-state"><strong>Tidak ada antrean verifikasi.</strong><p>Matikan filter untuk melihat semua hasil otomatis.</p></div> : null}
      {!loading && filtered.length > 0 ? <div className="table-wrap verification-table-wrap"><table className="verification-table"><thead><tr><th>Karyawan</th><th>Jadwal dan scan</th><th>Hasil sistem</th><th>Alasan sistem</th><th>Keputusan admin</th></tr></thead><tbody>
        {filtered.map((record) => <tr key={record.employeeId}>
          <td><strong className="table-primary">{record.employeeName}</strong><small className="table-secondary">ID {record.employeeCode} · {record.departmentName ?? "Tanpa departemen"}</small></td>
          <td><code>{record.scheduleCode ?? "TANPA_JADWAL"}</code><small className="table-secondary">Masuk {shortTime(record.checkInAt)} · Keluar {shortTime(record.checkOutAt)} · {record.scanCount} scan</small></td>
          <td><StatusBadge tone={attendanceTone(record.autoStatus)}>{attendanceLabel(record.autoStatus)}</StatusBadge>{record.hasOnCall ? <small className="table-secondary"><StatusBadge tone="on-call">ON-CALL</StatusBadge></small> : null}</td>
          <td className="detail-cell"><strong>{record.notes[0] ?? "Belum ada alasan"}</strong><small>{record.notes.slice(1).join(" · ")}</small></td>
          <td className="verification-action"><select value={drafts[record.employeeId] ?? record.status} onChange={(event) => setDrafts((current) => ({ ...current, [record.employeeId]: event.target.value }))}>{attendanceStatuses.map((status) => <option key={status} value={status}>{attendanceLabel(status)}</option>)}</select><input value={notes[record.employeeId] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [record.employeeId]: event.target.value }))} placeholder="Catatan koreksi" maxLength={1000} /><button className="secondary-button" type="button" onClick={() => void confirm(record)} disabled={saving === record.employeeId}>{saving === record.employeeId ? "MENYIMPAN..." : record.confirmationState === "CONFIRMED" ? "PERBARUI" : "KONFIRMASI"}</button></td>
        </tr>)}
      </tbody></table></div> : null}
    </section>
  </>;
}
