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
  shortTime,
  type DailyAttendance,
  witaDate
} from "../../components/attendance-display";
import { CustomSelect } from "../../components/custom-dropdown";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type VerificationFilter = "NEEDS_REVIEW" | "ALL" | "OFF_LEAVE" | "NO_SCHEDULE" | "CONFIRMED";

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
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchNote, setBatchNote] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<VerificationFilter>("NEEDS_REVIEW");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/attendance/daily?from=${date}&to=${date}`, {
        credentials: "include",
        cache: "no-store"
      });
      const payload = (await response.json()) as { records?: DailyAttendance[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat evaluasi absensi");
      const nextRecords = payload.records ?? [];
      setRecords(nextRecords);

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

  // Metric counts for summary cards
  const metrics = useMemo(() => {
    let needsReview = 0;
    let offScan = 0;
    let noSchedule = 0;
    let confirmed = 0;

    for (const r of records) {
      const notesText = r.notes.join(" ").toLowerCase();
      const isReviewAnomaly = ["NEEDS_REVIEW", "NO_SCHEDULE"].includes(r.autoStatus);
      if (isReviewAnomaly && r.confirmationState !== "CONFIRMED") needsReview++;
      if (notesText.includes("cuti") || notesText.includes("off")) offScan++;
      if (!r.scheduleCode || notesText.includes("tanpa jadwal") || r.autoStatus === "NO_SCHEDULE") noSchedule++;
      if (r.confirmationState === "CONFIRMED") confirmed++;
    }

    return { needsReview, offScan, noSchedule, confirmed, total: records.length };
  }, [records]);

  // Filtered attendance rows
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchSearch =
        !term ||
        `${record.employeeName} ${record.employeeCode} ${record.departmentName ?? ""} ${record.notes.join(" ")}`
          .toLowerCase()
          .includes(term);

      if (!matchSearch) return false;

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
  }, [records, search, filterCategory]);

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

  // Status options for CustomSelect
  const statusOptions = attendanceStatuses.map((s) => ({
    value: s,
    label: attendanceLabel(s)
  }));

  return (
    <>
      <PageHeader
        title="Verifikasi absensi"
        description="Sistem menghitung status dari roster, profil kerja, dan scan X105. Admin menangani pengecualian serta mencatat alasan koreksi secara real-time."
        action={
          <StatusBadge tone={metrics.needsReview > 0 ? "pending" : "on-time"}>
            {metrics.needsReview > 0 ? `${metrics.needsReview} perlu perhatian` : "Semua selesai"}
          </StatusBadge>
        }
      />

      {/* 4 Neo-Industrial Metric Summary Cards */}
      <div className="verify-stat-grid" aria-label="Statistik antrean verifikasi">
        <div className="verify-stat-card card-verify-review">
          <div className="stat-icon" aria-hidden="true">⏳</div>
          <div className="stat-content">
            <span className="stat-label">Antrean Perlu Ditinjau</span>
            <strong className="stat-value">{metrics.needsReview}</strong>
          </div>
        </div>

        <div className="verify-stat-card card-verify-anomaly">
          <div className="stat-icon" aria-hidden="true">⚠️</div>
          <div className="stat-content">
            <span className="stat-label">Scan Hari Off / Cuti</span>
            <strong className="stat-value">{metrics.offScan}</strong>
          </div>
        </div>

        <div className="verify-stat-card card-verify-nosched">
          <div className="stat-icon" aria-hidden="true">❓</div>
          <div className="stat-content">
            <span className="stat-label">Scan Tanpa Jadwal Kerja</span>
            <strong className="stat-value">{metrics.noSchedule}</strong>
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

          <div className="verify-toolbar-filter">
            <CustomSelect
              ariaLabel="Filter Kategori Verifikasi"
              value={filterCategory}
              options={[
                { value: "NEEDS_REVIEW", label: `Perlu Ditinjau (${metrics.needsReview})` },
                { value: "ALL", label: `Semua Data (${metrics.total})` },
                { value: "OFF_LEAVE", label: `Scan Hari Off / Cuti (${metrics.offScan})` },
                { value: "NO_SCHEDULE", label: `Scan Tanpa Jadwal (${metrics.noSchedule})` },
                { value: "CONFIRMED", label: `Sudah Dikonfirmasi (${metrics.confirmed})` }
              ]}
              onChange={(val) => setFilterCategory(val as VerificationFilter)}
              className="ref-toolbar-select"
            />
          </div>

          <button
            type="button"
            className="ref-refresh-btn"
            onClick={() => { void load(); }}
            title="Segarkan data absensi"
          >
            ↻
          </button>
        </div>

        {/* Floating Batch Action Bar */}
        {selectedIds.size > 0 ? (
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
            <strong>Gagal Menyimpan:</strong>
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
            <strong>Tidak ada antrean verifikasi pada kriteria ini.</strong>
            <p>Ubah kategori filter atau gunakan tanggal lain untuk melihat data absensi.</p>
          </div>
        ) : null}

        {/* Neo-Industrial Verification Table */}
        {!loading && filtered.length > 0 ? (
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
                              <span className="ref-employee-nip">ID {record.employeeCode}</span>
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
      </section>

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

