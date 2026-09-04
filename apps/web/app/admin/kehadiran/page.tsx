"use client";

import { useEffect, useMemo, useState } from "react";
import {
  attendanceLabel,
  attendanceReason,
  attendanceReasonDetails,
  attendanceStatuses,
  attendanceTone,
  formatAuditTime,
  formatScheduleDisplay,
  getAnomalyBadge,
  getAvatarColor,
  getInitials,
  isUnverifiedEmployee,
  shortTime,
  type DailyAttendance,
  witaDate
} from "../../components/attendance-display";
import { CustomSelect } from "../../components/custom-dropdown";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type VerificationFilter = "NEEDS_REVIEW" | "ALL" | "OFF_LEAVE" | "NO_SCHEDULE" | "CONFIRMED";

type Department = { id: string; code: string; name: string };

function getPreviousDate(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

export default function AttendanceVerificationPage() {
  const [date, setDate] = useState(witaDate);
  const [records, setRecords] = useState<DailyAttendance[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchNote, setBatchNote] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<VerificationFilter>("NEEDS_REVIEW");
  const [activeTab, setActiveTab] = useState<"VERIFIED" | "UNVERIFIED">("VERIFIED");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State untuk modal lengkapi identitas karyawan (jika nama hanya PIN)
  const [editingEmployee, setEditingEmployee] = useState<{
    employeeId: number;
    employeeCode: string;
    name: string;
    departmentId: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editDeptId, setEditDeptId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Cek jika URL memiliki query parameter ?tab=unverified
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "unverified") {
        setActiveTab("UNVERIFIED");
      }
    }
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [attRes, deptRes] = await Promise.all([
        fetch(`${API_URL}/api/attendance/daily?from=${date}&to=${date}`, {
          credentials: "include",
          cache: "no-store"
        }),
        fetch(`${API_URL}/api/departments`, {
          credentials: "include",
          cache: "no-store"
        })
      ]);

      const attPayload = (await attRes.json()) as { records?: DailyAttendance[]; error?: { message?: string } };
      const deptPayload = (await deptRes.json()) as { records?: Department[] };

      if (!attRes.ok) throw new Error(attPayload.error?.message ?? "Gagal memuat evaluasi absensi");
      const nextRecords = attPayload.records ?? [];
      setRecords(nextRecords);
      setDepartments(deptPayload.records ?? []);

      // Preserve or initialize drafts & notes
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of nextRecords) {
          if (!next[r.employeeId]) next[r.employeeId] = r.status;
        }
        return next;
      });
      setNotes((prev) => {
        const next = { ...prev };
        for (const r of nextRecords) {
          if (next[r.employeeId] === undefined) next[r.employeeId] = r.confirmationNote ?? "";
        }
        return next;
      });
      setSelectedIds(new Set());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat evaluasi absensi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [date]);

  // Pisahkan records menjadi terdaftar vs belum terverifikasi (hanya PIN)
  const { verifiedRecords, unverifiedRecords } = useMemo(() => {
    const verified: DailyAttendance[] = [];
    const unverified: DailyAttendance[] = [];
    for (const r of records) {
      if (isUnverifiedEmployee(r)) unverified.push(r);
      else verified.push(r);
    }
    return { verifiedRecords: verified, unverifiedRecords: unverified };
  }, [records]);

  // Metric counts for summary cards
  const metrics = useMemo(() => {
    let verifiedNeedsReview = 0;
    let offScan = 0;
    let confirmed = 0;

    for (const r of verifiedRecords) {
      const notesText = r.notes.join(" ").toLowerCase();
      const isReviewAnomaly = ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(r.autoStatus);
      if (isReviewAnomaly && r.confirmationState !== "CONFIRMED") verifiedNeedsReview++;
      if (notesText.includes("cuti") || notesText.includes("off")) offScan++;
      if (r.confirmationState === "CONFIRMED") confirmed++;
    }

    return {
      verifiedNeedsReview,
      unverifiedCount: unverifiedRecords.length,
      offScan,
      confirmed,
      totalVerified: verifiedRecords.length
    };
  }, [verifiedRecords, unverifiedRecords]);

  // Filtered rows untuk tab aktif
  const currentBaseRecords = activeTab === "VERIFIED" ? verifiedRecords : unverifiedRecords;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return currentBaseRecords.filter((record) => {
      const matchSearch =
        !term ||
        `${record.employeeName} ${record.employeeCode} ${record.departmentName ?? ""} ${record.notes.join(" ")}`
          .toLowerCase()
          .includes(term);

      if (!matchSearch) return false;

      if (activeTab === "UNVERIFIED") return true;

      const notesText = record.notes.join(" ").toLowerCase();
      switch (filterCategory) {
        case "NEEDS_REVIEW":
          return ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(record.autoStatus) && record.confirmationState !== "CONFIRMED";
        case "OFF_LEAVE":
          return notesText.includes("cuti") || notesText.includes("off");
        case "NO_SCHEDULE":
          return !record.scheduleCode || notesText.includes("tanpa jadwal") || record.autoStatus === "NO_SCHEDULE";
        case "CONFIRMED":
          return record.confirmationState === "CONFIRMED";
        case "ALL":
        default:
          return true;
      }
    });
  }, [currentBaseRecords, search, filterCategory, activeTab]);

  // Checkbox handlers
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.employeeId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.employeeId)));
    }
  };

  const toggleSelectRow = (employeeId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  // Single confirmation action
  const handleConfirm = async (record: DailyAttendance) => {
    setSavingId(record.employeeId);
    setError("");
    const targetStatus = drafts[record.employeeId] ?? record.status;
    const targetNote = notes[record.employeeId]?.trim() || null;

    try {
      const response = await fetch(
        `${API_URL}/api/attendance/daily/${record.employeeId}/${record.attendanceDate}/confirm`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: targetStatus, note: targetNote })
        }
      );
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengonfirmasi status");

      showToast(`Status ${record.employeeName} berhasil disahkan (${attendanceLabel(targetStatus)})`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengonfirmasi status");
    } finally {
      setSavingId(null);
    }
  };

  // Batch confirmation action
  const handleBatchConfirm = async (targetStatus: string) => {
    if (selectedIds.size === 0) return;
    setBatchSaving(true);
    setError("");

    const items = Array.from(selectedIds).map((id) => {
      const r = records.find((rec) => rec.employeeId === id);
      return {
        employeeId: id,
        attendanceDate: r?.attendanceDate ?? date,
        status: targetStatus,
        note: batchNote.trim() || notes[id]?.trim() || null
      };
    });

    try {
      const response = await fetch(`${API_URL}/api/attendance/daily/batch-confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items })
      });
      const payload = (await response.json()) as { success?: boolean; count?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memproses konfirmasi masal");

      showToast(`Berhasil mengonfirmasi ${payload.count ?? items.length} karyawan (${attendanceLabel(targetStatus)})`);
      setBatchNote("");
      setSelectedIds(new Set());
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memproses konfirmasi masal");
    } finally {
      setBatchSaving(false);
    }
  };

  // Buka modal untuk melengkapi nama karyawan
  const openEditModal = (record: DailyAttendance) => {
    setEditingEmployee({
      employeeId: record.employeeId,
      employeeCode: record.employeeCode,
      name: "",
      departmentId: ""
    });
    setEditName("");
    setEditDeptId("");
  };

  // Simpan nama karyawan ke API
  const saveEmployeeIdentity = async () => {
    if (!editingEmployee) return;
    const name = editName.trim();
    if (!name) {
      setError("Nama lengkap karyawan wajib diisi.");
      return;
    }

    setEditSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/employees/${editingEmployee.employeeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          departmentId: editDeptId || null
        })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan identitas karyawan");

      showToast(`Identitas PIN ${editingEmployee.employeeCode} berhasil disahkan menjadi "${name}"!`);
      setEditingEmployee(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan identitas karyawan");
    } finally {
      setEditSaving(false);
    }
  };

  // Status options for CustomSelect
  const statusOptions = attendanceStatuses.map((s) => ({
    value: s,
    label: attendanceLabel(s)
  }));

  const departmentOptions = [
    { value: "", label: "Tanpa departemen" },
    ...departments.map((d) => ({ value: d.id, label: `${d.code} | ${d.name}` }))
  ];

  return (
    <>
      <PageHeader
        title="Verifikasi absensi"
        description="Sistem menghitung status dari roster, profil kerja, dan scan X105. Admin menangani pengecualian serta memisahkan scan yang belum bernama agar mudah diverifikasi."
        action={
          <StatusBadge tone={metrics.verifiedNeedsReview > 0 ? "pending" : "on-time"}>
            {metrics.verifiedNeedsReview > 0 ? `${metrics.verifiedNeedsReview} perlu perhatian` : "Semua selesai"}
          </StatusBadge>
        }
      />

      {/* 4 Neo-Industrial Metric Summary Cards */}
      <div className="verify-stat-grid" aria-label="Statistik antrean verifikasi">
        <div className="verify-stat-card card-verify-review">
          <div className="stat-icon" aria-hidden="true">📋</div>
          <div className="stat-content">
            <span className="stat-label">Antrean Karyawan Terdaftar</span>
            <strong className="stat-value">{metrics.verifiedNeedsReview}</strong>
          </div>
        </div>

        <div
          className="verify-stat-card card-verify-anomaly"
          style={{ cursor: "pointer" }}
          onClick={() => setActiveTab("UNVERIFIED")}
          title="Klik untuk membuka tab Scan Belum Teridentifikasi"
        >
          <div className="stat-icon" aria-hidden="true">⚠️</div>
          <div className="stat-content">
            <span className="stat-label">Scan Belum Teridentifikasi</span>
            <strong className="stat-value" style={{ color: metrics.unverifiedCount > 0 ? "#c2410c" : undefined }}>
              {metrics.unverifiedCount}
            </strong>
          </div>
        </div>

        <div className="verify-stat-card card-verify-nosched">
          <div className="stat-icon" aria-hidden="true">🏖️</div>
          <div className="stat-content">
            <span className="stat-label">Scan Hari Off / Cuti</span>
            <strong className="stat-value">{metrics.offScan}</strong>
          </div>
        </div>

        <div className="verify-stat-card card-verify-confirmed">
          <div className="stat-icon" aria-hidden="true">✅</div>
          <div className="stat-content">
            <span className="stat-label">Sudah Dikonfirmasi</span>
            <strong className="stat-value">{metrics.confirmed}</strong>
          </div>
        </div>
      </div>

      {/* Main Container Panel */}
      <section className="panel" style={{ padding: "20px 24px" }}>
        {/* Tab Pemisah: Karyawan Terdaftar vs Scan Belum Teridentifikasi */}
        <div className="verify-tabs" role="tablist">
          <button
            type="button"
            className={`verify-tab-btn ${activeTab === "VERIFIED" ? "is-active" : ""}`}
            onClick={() => setActiveTab("VERIFIED")}
            role="tab"
            aria-selected={activeTab === "VERIFIED"}
          >
            <span className="verify-tab-title">📋 Antrean Karyawan Terdaftar</span>
            <span className="verify-tab-badge badge-primary">{metrics.verifiedNeedsReview}</span>
          </button>

          <button
            type="button"
            className={`verify-tab-btn ${activeTab === "UNVERIFIED" ? "is-active" : ""}`}
            onClick={() => setActiveTab("UNVERIFIED")}
            role="tab"
            aria-selected={activeTab === "UNVERIFIED"}
          >
            <span className="verify-tab-title">⚠️ Scan Belum Teridentifikasi (Hanya PIN)</span>
            {metrics.unverifiedCount > 0 ? (
              <span className="verify-tab-badge badge-warning">{metrics.unverifiedCount}</span>
            ) : (
              <span className="verify-tab-badge badge-muted">0</span>
            )}
          </button>
        </div>

        {/* Verification Toolbar */}
        <div className="verify-toolbar">
          <div className="verify-date-group">
            <input
              type="date"
              className="verify-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              title="Pilih tanggal verifikasi"
            />
            <button
              type="button"
              className="verify-quick-date-btn"
              onClick={() => setDate(witaDate())}
              title="Kembali ke hari ini"
            >
              Hari Ini
            </button>
            <button
              type="button"
              className="verify-quick-date-btn"
              onClick={() => setDate((curr) => getPreviousDate(curr))}
              title="Lihat hari sebelumnya"
            >
              Kemarin
            </button>
          </div>

          <div className="verify-search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="verify-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama karyawan, NIP, atau departemen..."
            />
            {search ? (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
              >
                ✕
              </button>
            ) : null}
          </div>

          {activeTab === "VERIFIED" ? (
            <div className="verify-toolbar-filter">
              <CustomSelect
                ariaLabel="Filter Kategori Verifikasi"
                value={filterCategory}
                options={[
                  { value: "NEEDS_REVIEW", label: `Perlu Ditinjau (${metrics.verifiedNeedsReview})` },
                  { value: "ALL", label: `Semua Terdaftar (${metrics.totalVerified})` },
                  { value: "OFF_LEAVE", label: `Scan Hari Off / Cuti (${metrics.offScan})` },
                  { value: "CONFIRMED", label: `Sudah Dikonfirmasi (${metrics.confirmed})` }
                ]}
                onChange={(val) => setFilterCategory(val as VerificationFilter)}
                className="ref-toolbar-select"
              />
            </div>
          ) : null}

          <button
            type="button"
            className="ref-refresh-btn"
            onClick={() => { void load(); }}
            title="Segarkan data absensi"
          >
            ↻
          </button>
        </div>

        {/* Floating Batch Action Bar (Khusus Tab Terdaftar) */}
        {activeTab === "VERIFIED" && selectedIds.size > 0 ? (
          <div className="verify-batch-bar" role="toolbar" aria-label="Aksi masal verifikasi">
            <div className="verify-batch-info">
              <span className="verify-batch-badge">{selectedIds.size} DIPILIH</span>
              <span>Terapkan keputusan sekaligus untuk seluruh karyawan terpilih:</span>
            </div>

            <div className="verify-batch-actions">
              <input
                type="text"
                className="verify-batch-note-input"
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                placeholder="Catatan masal (opsional)..."
              />
              <button
                type="button"
                className="verify-batch-btn btn-batch-present"
                onClick={() => void handleBatchConfirm("PRESENT")}
                disabled={batchSaving}
              >
                {batchSaving ? "Memproses..." : "⚡ Setujui Hadir"}
              </button>
              <button
                type="button"
                className="verify-batch-btn btn-batch-off"
                onClick={() => void handleBatchConfirm("OFF")}
                disabled={batchSaving}
              >
                {batchSaving ? "Memproses..." : "⚡ Tetapkan Off"}
              </button>
              <button
                type="button"
                className="verify-batch-btn btn-batch-oncall"
                onClick={() => void handleBatchConfirm("ON_CALL")}
                disabled={batchSaving}
              >
                {batchSaving ? "Memproses..." : "⚡ On-Call"}
              </button>
              <button
                type="button"
                className="verify-batch-btn btn-batch-cancel"
                onClick={() => setSelectedIds(new Set())}
              >
                Batal
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="notice notice-error" style={{ marginBottom: "16px" }}>
            <strong>Perhatian:</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="table-skeleton" aria-label="Memuat data verifikasi">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="feedback-state">
            <strong>
              {activeTab === "UNVERIFIED"
                ? "Bagus! Tidak ada scan yang belum teridentifikasi pada tanggal ini."
                : "Tidak ada antrean verifikasi pada kriteria ini."}
            </strong>
            <p>
              {activeTab === "UNVERIFIED"
                ? "Semua data scan dari perangkat X105 telah cocok dengan karyawan terdaftar."
                : "Ubah kategori filter atau gunakan tanggal lain untuk melihat data absensi."}
            </p>
          </div>
        ) : null}

        {/* TAB 1: TABEL KARYAWAN TERDAFTAR */}
        {!loading && filtered.length > 0 && activeTab === "VERIFIED" ? (
          <div className="ref-table-card">
            <div className="ref-table-wrap">
              <table className="ref-attendance-table">
                <thead>
                  <tr>
                    <th className="verify-th-check">
                      <input
                        type="checkbox"
                        className="verify-checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        title="Pilih semua baris"
                        aria-label="Pilih semua baris"
                      />
                    </th>
                    <th style={{ minWidth: "220px" }}>Karyawan</th>
                    <th style={{ minWidth: "250px" }}>Jadwal & Scan X105</th>
                    <th style={{ minWidth: "260px" }}>Hasil & Alasan Sistem</th>
                    <th style={{ minWidth: "300px" }}>Keputusan Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => {
                    const isSelected = selectedIds.has(record.employeeId);
                    const isSaving = savingId === record.employeeId;
                    const anomaly = getAnomalyBadge(record);
                    const currentDraft = drafts[record.employeeId] ?? record.status;
                    const currentNote = notes[record.employeeId] ?? "";

                    return (
                      <tr
                        key={`${record.employeeId}-${record.attendanceDate}`}
                        style={{ background: isSelected ? "#fefce8" : undefined }}
                      >
                        {/* Checkbox */}
                        <td className="verify-td-check">
                          <input
                            type="checkbox"
                            className="verify-checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(record.employeeId)}
                            aria-label={`Pilih ${record.employeeName}`}
                          />
                        </td>

                        {/* Kolom Karyawan */}
                        <td>
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
                              <span className="ref-dept-name" style={{ marginTop: "2px" }}>
                                {record.departmentName ?? "Tanpa departemen"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Kolom Jadwal & Scan X105 */}
                        <td>
                          <div className="verify-schedule-cell">
                            <div>
                              <span className="ref-schedule-badge">
                                {formatScheduleDisplay(record)}
                              </span>
                            </div>

                            <div className="verify-times-row">
                              {/* Jam Masuk */}
                              {record.checkInAt ? (
                                <div className="ref-time-box time-box-in" title={record.checkInAt}>
                                  <span className="time-clock" aria-hidden="true">🟢</span>
                                  <strong>{shortTime(record.checkInAt)}</strong>
                                  <span className="time-tz">WITA</span>
                                </div>
                              ) : (
                                <div className="ref-time-box time-box-empty">
                                  <span className="time-empty-dash">—</span>
                                  <span>Belum tap masuk</span>
                                </div>
                              )}

                              {/* Jam Keluar */}
                              {record.checkOutAt ? (
                                <div className="ref-time-box time-box-out" title={record.checkOutAt}>
                                  <span className="time-clock" aria-hidden="true">🔵</span>
                                  <strong>{shortTime(record.checkOutAt)}</strong>
                                  <span className="time-tz">WITA</span>
                                </div>
                              ) : (
                                <div className="ref-time-box time-box-empty">
                                  <span className="time-empty-dash">—</span>
                                  <span>Belum tap keluar</span>
                                </div>
                              )}
                            </div>

                            <div className="verify-scan-chip">
                              <span aria-hidden="true">📡</span>
                              <span>{record.scanCount} Scan Terdeteksi</span>
                            </div>
                          </div>
                        </td>

                        {/* Kolom Hasil & Alasan Sistem */}
                        <td>
                          <div className="verify-system-cell">
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <StatusBadge tone={attendanceTone(record.autoStatus)}>
                                {attendanceLabel(record.autoStatus)}
                              </StatusBadge>
                              {record.hasOnCall ? (
                                <StatusBadge tone="on-call">ON-CALL</StatusBadge>
                              ) : null}
                            </div>

                            {anomaly ? (
                              <div className={`verify-anomaly-pill anomaly-pill-${anomaly.tone}`}>
                                <span>{anomaly.icon}</span>
                                <span>{anomaly.label}</span>
                              </div>
                            ) : null}

                            <div className="verify-system-desc">
                              <strong>{attendanceReason(record)}</strong>
                              <span>{attendanceReasonDetails(record)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Kolom Keputusan Admin */}
                        <td>
                          <div className="verify-decision-cell">
                            {/* Reusable CustomSelect */}
                            <div className="verify-status-select-wrap">
                              <CustomSelect
                                ariaLabel={`Status Keputusan ${record.employeeName}`}
                                value={currentDraft}
                                options={statusOptions}
                                onChange={(val) =>
                                  setDrafts((prev) => ({ ...prev, [record.employeeId]: val }))
                                }
                              />
                            </div>

                            {/* Quick Preset Action Chips */}
                            <div className="verify-quick-chips">
                              <button
                                type="button"
                                className={`verify-quick-chip ${currentDraft === "PRESENT" ? "is-active" : ""}`}
                                onClick={() => setDrafts((prev) => ({ ...prev, [record.employeeId]: "PRESENT" }))}
                              >
                                Hadir
                              </button>
                              <button
                                type="button"
                                className={`verify-quick-chip ${currentDraft === "OFF" ? "is-active" : ""}`}
                                onClick={() => setDrafts((prev) => ({ ...prev, [record.employeeId]: "OFF" }))}
                              >
                                Off
                              </button>
                              <button
                                type="button"
                                className={`verify-quick-chip ${currentDraft === "ON_CALL" ? "is-active" : ""}`}
                                onClick={() => setDrafts((prev) => ({ ...prev, [record.employeeId]: "ON_CALL" }))}
                              >
                                On-Call
                              </button>
                              <button
                                type="button"
                                className={`verify-quick-chip ${currentDraft === "OVERTIME" ? "is-active" : ""}`}
                                onClick={() => setDrafts((prev) => ({ ...prev, [record.employeeId]: "OVERTIME" }))}
                              >
                                Lembur
                              </button>
                            </div>

                            {/* Correction Note Input */}
                            <input
                              type="text"
                              className="verify-note-input"
                              value={currentNote}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [record.employeeId]: e.target.value }))
                              }
                              placeholder="Catatan koreksi admin..."
                              maxLength={1000}
                            />

                            {/* Action Button */}
                            <button
                              type="button"
                              className={`verify-submit-btn ${record.confirmationState === "CONFIRMED" ? "btn-update" : ""}`}
                              onClick={() => void handleConfirm(record)}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <>
                                  <span className="spinner" aria-hidden="true" />
                                  <span>Menyimpan...</span>
                                </>
                              ) : record.confirmationState === "CONFIRMED" ? (
                                "PERBARUI"
                              ) : (
                                "KONFIRMASI"
                              )}
                            </button>

                            {/* Audit Stamp if already confirmed */}
                            {record.confirmationState === "CONFIRMED" ? (
                              <div className="verify-audit-stamp" title={record.confirmedAt ?? undefined}>
                                <span aria-hidden="true">✓</span>
                                <span>
                                  Dikonfirmasi {record.confirmedByName ? `oleh ${record.confirmedByName}` : "Admin"}
                                  {record.confirmedAt ? ` (${formatAuditTime(record.confirmedAt)})` : ""}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* TAB 2: TABEL SCAN BELUM TERIDENTIFIKASI (HANYA ID / PIN MESIN) */}
        {!loading && filtered.length > 0 && activeTab === "UNVERIFIED" ? (
          <div className="ref-table-card">
            <div className="ref-table-wrap">
              <table className="ref-attendance-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: "160px" }}>PIN / ID Mesin</th>
                    <th style={{ minWidth: "250px" }}>Waktu Scan X105</th>
                    <th style={{ minWidth: "260px" }}>Diagnosa Mesin</th>
                    <th style={{ minWidth: "260px" }}>Tindakan Identifikasi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => {
                    const isSaving = savingId === record.employeeId;

                    return (
                      <tr key={`${record.employeeId}-${record.attendanceDate}`}>
                        {/* PIN Mesin */}
                        <td>
                          <div className="unverified-card-raw">
                            <span className="unverified-pin-badge">PIN {record.employeeCode}</span>
                            <span className="unverified-tag">⚠️ BELUM ADA NAMA</span>
                            <small style={{ color: "#64748b", fontSize: "11px" }}>
                              Master data belum memiliki nama untuk PIN ini
                            </small>
                          </div>
                        </td>

                        {/* Waktu Scan */}
                        <td>
                          <div className="verify-schedule-cell">
                            <div className="verify-times-row">
                              {record.checkInAt ? (
                                <div className="ref-time-box time-box-in" title={record.checkInAt}>
                                  <span className="time-clock" aria-hidden="true">🟢</span>
                                  <strong>{shortTime(record.checkInAt)}</strong>
                                  <span className="time-tz">WITA</span>
                                </div>
                              ) : (
                                <div className="ref-time-box time-box-empty">
                                  <span className="time-empty-dash">—</span>
                                  <span>Belum tap masuk</span>
                                </div>
                              )}

                              {record.checkOutAt ? (
                                <div className="ref-time-box time-box-out" title={record.checkOutAt}>
                                  <span className="time-clock" aria-hidden="true">🔵</span>
                                  <strong>{shortTime(record.checkOutAt)}</strong>
                                  <span className="time-tz">WITA</span>
                                </div>
                              ) : (
                                <div className="ref-time-box time-box-empty">
                                  <span className="time-empty-dash">—</span>
                                  <span>Belum tap keluar</span>
                                </div>
                              )}
                            </div>

                            <div className="verify-scan-chip">
                              <span aria-hidden="true">📡</span>
                              <span>{record.scanCount} Scan X105 Terdeteksi</span>
                            </div>
                          </div>
                        </td>

                        {/* Diagnosa */}
                        <td>
                          <div className="verify-system-cell">
                            <div className="verify-anomaly-pill anomaly-pill-pending">
                              <span>❓</span>
                              <span>Scan Tanpa Nama & Profil</span>
                            </div>
                            <div className="verify-system-desc">
                              <strong>{attendanceReason(record)}</strong>
                              <span>{attendanceReasonDetails(record)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Tindakan Identifikasi */}
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button
                              type="button"
                              className="verify-submit-btn"
                              onClick={() => openEditModal(record)}
                              title="Lengkapi identitas nama karyawan ini agar masuk ke daftar terdaftar"
                            >
                              <span>✏️ Lengkapi Nama Karyawan</span>
                            </button>

                            <button
                              type="button"
                              className="verify-quick-chip"
                              style={{ height: "30px", justifyContent: "center" }}
                              onClick={() => void handleConfirm(record)}
                              disabled={isSaving}
                            >
                              {isSaving ? "Menyimpan..." : "Konfirmasi Sebagai Off / Abaikan"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Modal Dialog: Lengkapi Nama Karyawan */}
      {editingEmployee ? (
        <div
          className="roster-modal-backdrop"
          onClick={() => setEditingEmployee(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="roster-backup-modal-card"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="roster-backup-modal-header">
              <div>
                <h2>Lengkapi Identitas Karyawan</h2>
                <p>
                  Menghubungkan <strong>PIN {editingEmployee.employeeCode}</strong> ke nama karyawan sebenarnya.
                </p>
              </div>
              <button
                type="button"
                className="roster-backup-modal-close"
                onClick={() => setEditingEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="roster-backup-modal-body">
              <div className="roster-backup-field">
                <label htmlFor="edit-name-input">Nama Lengkap Karyawan</label>
                <input
                  id="edit-name-input"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Contoh: Budi Santoso, Jufri Rante..."
                  autoFocus
                />
              </div>

              <div className="roster-backup-field">
                <label>Departemen</label>
                <CustomSelect
                  ariaLabel="Pilih Departemen"
                  value={editDeptId}
                  options={departmentOptions}
                  onChange={setEditDeptId}
                />
              </div>

              <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#475569" }}>
                💡 <em>Setelah identitas disimpan, karyawan ini akan <strong>otomatis terverifikasi</strong> dan langsung muncul di tabel absensi resmi.</em>
              </div>
            </div>

            <div className="roster-backup-modal-footer">
              <button
                type="button"
                className="roster-btn roster-btn-cancel"
                onClick={() => setEditingEmployee(null)}
                disabled={editSaving}
              >
                Batal
              </button>
              <button
                type="button"
                className="roster-btn roster-btn-save"
                onClick={() => void saveEmployeeIdentity()}
                disabled={editSaving || !editName.trim()}
              >
                {editSaving ? "Menyimpan..." : "Simpan Identitas Karyawan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Toast Notification */}
      {toastMessage ? (
        <div className="verify-toast" role="status" aria-live="polite">
          <span aria-hidden="true">✅</span>
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </>
  );
}


