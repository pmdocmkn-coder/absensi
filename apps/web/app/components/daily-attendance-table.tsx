"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { attendanceLabel, attendanceTone, formatScanTime, shortTime, type DailyAttendance, witaDate } from "./attendance-display";
import { StatusBadge } from "./status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function DailyAttendanceTable() {
  const [date, setDate] = useState(witaDate);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_URL}/api/attendance/daily?from=${date}&to=${date}`, {
        credentials: "include", cache: "no-store", signal
      });
      const payload = await response.json() as { records?: DailyAttendance[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat absensi harian");
      setRecords(payload.records ?? []);
      setError("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Gagal memuat absensi harian");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), 5_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch = !term || `${record.employeeName} ${record.employeeCode} ${record.departmentName ?? ""}`.toLowerCase().includes(term);
      return matchesSearch && (status === "ALL" || record.status === status);
    });
  }, [records, search, status]);

  const totals = useMemo(() => ({
    present: records.filter((record) => ["PRESENT", "LATE", "OVERTIME", "ON_CALL"].includes(record.status)).length,
    absent: records.filter((record) => record.status === "ABSENT").length,
    review: records.filter((record) => ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(record.status)).length,
    overtime: records.filter((record) => record.status === "OVERTIME").length
  }), [records]);

  return <>
    <div className="attendance-summary" aria-label="Ringkasan absensi">
      <div><span>Terdata</span><strong>{records.length}</strong></div>
      <div><span>Hadir</span><strong>{totals.present}</strong></div>
      <div><span>Lembur</span><strong>{totals.overtime}</strong></div>
      <div><span>Alfa</span><strong>{totals.absent}</strong></div>
      <div><span>Perlu ditinjau</span><strong>{totals.review}</strong></div>
    </div>
    <div className="data-toolbar">
      <label className="form-field"><span>Tanggal</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="form-field data-toolbar-search"><span>Cari karyawan</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, kode, atau departemen" /></label>
      <label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Semua status</option><option value="PRESENT">Hadir</option><option value="LATE">Terlambat</option><option value="OVERTIME">Lembur</option><option value="ON_CALL">On-call</option><option value="OFF">Off</option><option value="LEAVE">Cuti</option><option value="ABSENT">Alfa</option><option value="NEEDS_REVIEW">Perlu ditinjau</option><option value="NO_SCHEDULE">Belum ada jadwal</option></select></label>
      <button className="secondary-button" type="button" onClick={() => { setLoading(true); void load(); }}>PERBARUI</button>
    </div>
    {error ? <div className="notice notice-error"><strong>Absensi belum tersedia</strong><span>{error}</span></div> : null}
    {loading ? <div className="table-skeleton" aria-label="Menghitung absensi">{Array.from({ length: 7 }).map((_, index) => <span key={index} />)}</div> : null}
    {!loading && filtered.length === 0 ? <div className="feedback-state"><strong>Tidak ada data yang cocok.</strong><p>Ubah tanggal, pencarian, atau filter status.</p></div> : null}
    {!loading && filtered.length > 0 ? <div className="table-wrap attendance-table-wrap"><table className="attendance-detail-table">
      <thead><tr><th>Karyawan</th><th>Departemen</th><th>Jadwal</th><th>Masuk</th><th>Keluar</th><th>Status terkini</th><th>Keterangan / sensor</th></tr></thead>
      <tbody>{filtered.map((record) => (
        <tr key={`${record.employeeId}-${record.attendanceDate}`}>
          <td><strong className="table-primary">{record.employeeName}</strong><small className="table-secondary">ID {record.employeeCode}</small></td>
          <td>{record.departmentName ?? <span className="muted-value">Belum dipetakan</span>}</td>
          <td>{record.scheduleCode ? <><code>{record.scheduleCode}</code><small className="table-secondary">{record.scheduledStartAt ? `${shortTime(record.scheduledStartAt)} - ${shortTime(record.scheduledEndAt)}` : record.scheduleName}</small></> : <span className="muted-value">Belum ada jadwal</span>}</td>
          <td><strong className={record.checkInAt ? "time-chip time-in" : "time-empty"} title={record.checkInAt ?? undefined}>{formatScanTime(record.checkInAt)}</strong>{record.lateMinutes > 0 ? <small className="table-secondary">+{record.lateMinutes} menit</small> : null}</td>
          <td><strong className={record.checkOutAt ? "time-chip time-out" : "time-empty"} title={record.checkOutAt ?? undefined}>{formatScanTime(record.checkOutAt)}</strong>{record.earlyLeaveMinutes > 0 ? <small className="table-secondary">Pulang cepat {record.earlyLeaveMinutes} menit</small> : null}</td>
          <td><StatusBadge tone={attendanceTone(record.status)}>{attendanceLabel(record.status)}</StatusBadge>{record.hasOnCall ? <small className="table-secondary"><StatusBadge tone="on-call">ON-CALL</StatusBadge></small> : null}</td>
          <td className="detail-cell"><strong>{record.notes[0] ?? "Belum ada keterangan"}</strong><small>{record.notes.slice(1).join(" · ") || `${record.scanCount} scan X105`} · {record.confirmationState === "CONFIRMED" ? "Dikonfirmasi admin" : "Otomatis"}</small></td>
        </tr>
      ))}</tbody>
    </table></div> : null}
  </>;
}
