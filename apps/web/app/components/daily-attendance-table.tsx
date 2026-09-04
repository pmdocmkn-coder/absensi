"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatScheduleDisplay,
  formatScanTime,
  getAvatarColor,
  getInformativeNote,
  getInitials,
  isUnverifiedEmployee,
  type DailyAttendance,
  witaDate
} from "./attendance-display";
import { CustomSelect } from "./custom-dropdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function renderStatusPill(status: string) {
  switch (status) {
    case "PRESENT":
      return <span className="ref-status-pill pill-present"><span className="pill-ico" aria-hidden="true">✓</span> Hadir Tepat Waktu</span>;
    case "LATE":
      return <span className="ref-status-pill pill-late"><span className="pill-ico" aria-hidden="true">⚠️</span> Terlambat</span>;
    case "OFF":
      return <span className="ref-status-pill pill-off"><span className="pill-ico" aria-hidden="true">☕</span> Jadwal Off</span>;
    case "LEAVE":
      return <span className="ref-status-pill pill-leave"><span className="pill-ico" aria-hidden="true">🏖️</span> Sedang Cuti</span>;
    case "ON_CALL":
      return <span className="ref-status-pill pill-oncall"><span className="pill-ico" aria-hidden="true">⚡</span> Sedang On-Call</span>;
    case "ABSENT":
    case "PENDING":
      return <span className="ref-status-pill pill-absent"><span className="pill-ico" aria-hidden="true">👤</span> Belum Hadir</span>;
    case "OVERTIME":
      return <span className="ref-status-pill pill-overtime"><span className="pill-ico" aria-hidden="true">⏱️</span> Lembur</span>;
    case "NEEDS_REVIEW":
    default:
      return <span className="ref-status-pill pill-review"><span className="pill-ico" aria-hidden="true">🔍</span> Perlu Ditinjau</span>;
  }
}

export function DailyAttendanceTable() {
  const [date, setDate] = useState(witaDate);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [scope, setScope] = useState<"ALL" | "SCANNED">("ALL");
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

  // Hanya ambil karyawan yang datanya lengkap/terverifikasi (punya nama resmi)
  const verifiedRecords = useMemo(() => {
    return records.filter((r) => !isUnverifiedEmployee(r));
  }, [records]);

  // Hitung berapa scan anonim/hanya PIN pada hari ini
  const unverifiedScansCount = useMemo(() => {
    return records.filter((r) => isUnverifiedEmployee(r) && r.scanCount > 0).length;
  }, [records]);

  // List of unique departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of verifiedRecords) {
      if (r.departmentName) set.add(r.departmentName);
    }
    return Array.from(set).sort();
  }, [verifiedRecords]);

  // Scope filter: ALL vs SCANNED
  const baseRecords = useMemo(() => {
    if (scope === "SCANNED") {
      return verifiedRecords.filter((r) => r.scanCount > 0);
    }
    return verifiedRecords;
  }, [verifiedRecords, scope]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return baseRecords.filter((record) => {
      const matchesSearch = !term || `${record.employeeName} ${record.employeeCode} ${record.departmentName ?? ""}`.toLowerCase().includes(term);
      const matchesDept = department === "ALL" || record.departmentName === department;
      const matchesStatus = status === "ALL" || (
        status === "ABSENT" ? (record.status === "ABSENT" || record.status === "PENDING") : record.status === status
      );
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [baseRecords, search, department, status]);

  const totals = useMemo(() => ({
    allEmployees: verifiedRecords.length,
    scanned: verifiedRecords.filter((record) => record.scanCount > 0).length,
    present: verifiedRecords.filter((record) => ["PRESENT", "LATE", "OVERTIME", "ON_CALL"].includes(record.status)).length,
    review: verifiedRecords.filter((record) => ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(record.status)).length,
    overtime: verifiedRecords.filter((record) => record.status === "OVERTIME").length,
    leave: verifiedRecords.filter((record) => record.status === "LEAVE").length,
    off: verifiedRecords.filter((record) => record.status === "OFF").length,
    notYet: verifiedRecords.filter((record) => ["ABSENT", "PENDING"].includes(record.status)).length
  }), [verifiedRecords]);

  return <>
    <div className="attendance-summary" aria-label="Ringkasan absensi">
      <div><span>Total terjadwal</span><strong>{totals.allEmployees}</strong></div>
      <div><span>Sudah scan</span><strong>{totals.scanned}</strong></div>
      <div><span>Hadir tepat / terlambat</span><strong>{totals.present}</strong></div>
      <div><span>Sedang cuti</span><strong>{totals.leave}</strong></div>
      <div><span>Jadwal off</span><strong>{totals.off}</strong></div>
      <div><span>Belum hadir</span><strong>{totals.notYet}</strong></div>
    </div>

    {unverifiedScansCount > 0 ? (
      <div className="unverified-alert-banner" role="alert">
        <span className="unverified-alert-icon" aria-hidden="true">⚠️</span>
        <div className="unverified-alert-text">
          <strong>Perhatian:</strong> Terdapat <strong>{unverifiedScansCount} scan</strong> dari perangkat X105 dengan PIN yang belum terhubung ke nama karyawan.
        </div>
        <Link href="/admin/kehadiran?tab=unverified" className="unverified-alert-btn">
          Tinjau & Lengkapi di Verifikasi Absensi →
        </Link>
      </div>
    ) : null}

    {/* Toolbar filter persis seperti referensi gambar */}
    <div className="ref-attendance-toolbar">
      <div className="ref-search-box">
        <span className="ref-search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          className="ref-search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama karyawan, NIP, atau departemen..."
          aria-label="Cari nama karyawan, NIP, atau departemen"
        />
        {search ? (
          <button
            type="button"
            className="ref-search-clear"
            onClick={() => setSearch("")}
            aria-label="Hapus kata kunci pencarian"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="ref-filter-group">
        <CustomSelect
          ariaLabel="Filter Divisi / Departemen"
          value={department}
          options={[
            { value: "ALL", label: "🏢 Semua Divisi / Departemen" },
            ...departments.map((dept) => ({ value: dept, label: dept }))
          ]}
          onChange={setDepartment}
          className="ref-toolbar-select"
        />

        <CustomSelect
          ariaLabel="Filter Status Absensi"
          value={status}
          options={[
            { value: "ALL", label: "🎯 Semua Status" },
            { value: "PRESENT", label: "Hadir Tepat Waktu" },
            { value: "LATE", label: "Terlambat" },
            { value: "OFF", label: "Jadwal Off" },
            { value: "LEAVE", label: "Sedang Cuti" },
            { value: "ON_CALL", label: "Sedang On-Call" },
            { value: "ABSENT", label: "Belum Hadir" },
            { value: "OVERTIME", label: "Lembur" },
            { value: "NEEDS_REVIEW", label: "Perlu Ditinjau" }
          ]}
          onChange={setStatus}
          className="ref-toolbar-select"
        />

        <div className="ref-date-item">
          <input
            type="date"
            className="ref-date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Pilih Tanggal Absensi"
          />
        </div>

        <div className="ref-scope-toggle">
          <button
            type="button"
            className={`ref-toggle-btn ${scope === "ALL" ? "active" : ""}`}
            onClick={() => setScope("ALL")}
            title="Tampilkan semua karyawan yang dijadwalkan hari ini"
          >
            Semua
          </button>
          <button
            type="button"
            className={`ref-toggle-btn ${scope === "SCANNED" ? "active" : ""}`}
            onClick={() => setScope("SCANNED")}
            title="Tampilkan hanya karyawan yang memiliki aktivitas scan perangkat"
          >
            Hanya Scan ({totals.scanned})
          </button>
        </div>

        <button
          type="button"
          className="ref-refresh-btn"
          onClick={() => { setLoading(true); void load(); }}
          title="Segarkan data absensi"
        >
          ↻
        </button>
      </div>
    </div>

    {error ? <div className="notice notice-error"><strong>Absensi belum tersedia</strong><span>{error}</span></div> : null}
    {loading ? <div className="table-skeleton" aria-label="Menghitung absensi">{Array.from({ length: 7 }).map((_, index) => <span key={index} />)}</div> : null}
    {!loading && filtered.length === 0 ? (
      <div className="feedback-state">
        <strong>{baseRecords.length === 0 ? "Belum ada data pada tanggal ini." : "Tidak ada data yang cocok dengan filter."}</strong>
        <p>Ubah kata kunci pencarian, filter departemen, atau filter status.</p>
      </div>
    ) : null}

    {/* Tabel Absensi Kuning Sesuai Gambar Referensi */}
    {!loading && filtered.length > 0 ? (
      <div className="ref-table-card">
        <div className="ref-table-wrap">
          <table className="ref-attendance-table">
            <thead>
              <tr>
                <th className="th-karyawan">Karyawan</th>
                <th className="th-departemen">Departemen</th>
                <th className="th-jadwal">Jadwal Shift</th>
                <th className="th-waktu">Waktu Masuk</th>
                <th className="th-waktu">Waktu Keluar</th>
                <th className="th-status">Status Terkini</th>
                <th className="th-keterangan">Keterangan / Sensor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={`${record.employeeId}-${record.attendanceDate}`}>
                  {/* Kolom Karyawan: Avatar Inisial + Nama + NIP */}
                  <td className="td-karyawan">
                    <div className="ref-employee-cell">
                      <div
                        className="ref-avatar"
                        style={{ backgroundColor: getAvatarColor(record.employeeName) }}
                        title={record.employeeName}
                        aria-hidden="true"
                      >
                        {getInitials(record.employeeName)}
                      </div>
                      <div className="ref-employee-meta">
                        <strong className="ref-employee-name">{record.employeeName}</strong>
                        <span className="ref-employee-nip">NIP: {record.employeeCode}</span>
                      </div>
                    </div>
                  </td>

                  {/* Kolom Departemen */}
                  <td className="td-departemen">
                    <span className="ref-dept-name">{record.departmentName ?? "Umum"}</span>
                  </td>

                  {/* Kolom Jadwal Shift */}
                  <td className="td-jadwal">
                    <span className="ref-schedule-badge">
                      {formatScheduleDisplay(record)}
                    </span>
                  </td>

                  {/* Kolom Waktu Masuk: Digital Box Hijau + WITA */}
                  <td className="td-waktu">
                    {record.checkInAt ? (
                      <div className="ref-time-box time-box-in" title={record.checkInAt}>
                        <span className="time-val">{formatScanTime(record.checkInAt)}</span>
                        <span className="time-tz">WITA</span>
                      </div>
                    ) : (
                      <span className="ref-time-dash">—</span>
                    )}
                  </td>

                  {/* Kolom Waktu Keluar: Digital Box Biru + WITA / Belum tap keluar */}
                  <td className="td-waktu">
                    {record.checkOutAt ? (
                      <div className="ref-time-box time-box-out" title={record.checkOutAt}>
                        <span className="time-val">{formatScanTime(record.checkOutAt)}</span>
                        <span className="time-tz">WITA</span>
                      </div>
                    ) : (
                      <span className="ref-time-unscanned">Belum tap keluar</span>
                    )}
                  </td>

                  {/* Kolom Status Terkini: Pill dengan Icon */}
                  <td className="td-status">
                    {renderStatusPill(record.status)}
                  </td>

                  {/* Kolom Keterangan / Sensor: Informatif & Simpel */}
                  <td className="td-keterangan">
                    <span className="ref-keterangan-text">{getInformativeNote(record)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null}
  </>;
}

