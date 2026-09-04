"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/page-header";
import { SearchableSelect, type SearchableOption } from "../components/custom-dropdown";
import { getAvatarColor, getInitials, witaDate } from "../components/attendance-display";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type LeaveRecord = {
  id: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  leaveType: "ANNUAL" | "SICK" | "FAMILY" | "MATERNITY" | "SPECIAL";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedByEmployeeId: number | null;
  createdAt: string;
  updatedAt: string;
};

type EmployeeOption = {
  id: number;
  name: string;
  employeeCode: string;
  departmentName: string | null;
};

function leaveTypeLabel(type: LeaveRecord["leaveType"]) {
  switch (type) {
    case "ANNUAL": return "Cuti Tahunan";
    case "SICK": return "Cuti Sakit";
    case "FAMILY": return "Izin Keluarga";
    case "MATERNITY": return "Cuti Melahirkan";
    case "SPECIAL": return "Cuti Alasan Penting";
    default: return type;
  }
}

function leaveTypeTone(type: LeaveRecord["leaveType"]) {
  switch (type) {
    case "ANNUAL": return "leave-type-annual";
    case "SICK": return "leave-type-sick";
    case "FAMILY": return "leave-type-family";
    case "MATERNITY": return "leave-type-maternity";
    case "SPECIAL": return "leave-type-special";
    default: return "";
  }
}

function formatDateIndo(dateStr: string) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
  const mIndex = Number(month) - 1;
  return `${day} ${monthNames[mIndex] ?? month} ${year}`;
}

export default function LeaveManagementPage() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveRecord["leaveType"]>("ANNUAL");
  const [startDate, setStartDate] = useState(witaDate());
  const [endDate, setEndDate] = useState(witaDate());
  const [reason, setReason] = useState("");
  const [directApprove, setDirectApprove] = useState(true);

  // Load Leave Records
  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_URL}/api/leave`, {
        credentials: "include", cache: "no-store", signal
      });
      const payload = await response.json() as { records?: LeaveRecord[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat daftar cuti");
      setRecords(payload.records ?? []);
      setError("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Gagal memuat daftar cuti");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Active Employees for Modal Dropdown
  const loadEmployees = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/employees`, {
        credentials: "include", cache: "no-store"
      });
      const payload = await response.json() as { records?: EmployeeOption[] };
      if (response.ok && payload.records) {
        setEmployees(payload.records);
      }
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRecords(controller.signal);
    void loadEmployees();
    return () => controller.abort();
  }, [loadRecords, loadEmployees]);

  // Metrics
  const today = witaDate();
  const metrics = useMemo(() => {
    return {
      total: records.length,
      approved: records.filter((r) => r.status === "APPROVED").length,
      pending: records.filter((r) => r.status === "PENDING").length,
      activeToday: records.filter((r) => r.status === "APPROVED" && r.startDate <= today && r.endDate >= today).length
    };
  }, [records, today]);

  // Filtered List
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((item) => {
      const matchesSearch = !term || `${item.employeeName} ${item.employeeCode} ${item.departmentName ?? ""} ${item.reason}`.toLowerCase().includes(term);
      const matchesType = typeFilter === "ALL" || item.leaveType === typeFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [records, search, typeFilter, statusFilter]);

  // Employee options for SearchableSelect
  const employeeOptions: SearchableOption[] = useMemo(() => {
    return employees.map((emp) => ({
      value: String(emp.id),
      label: emp.name,
      subLabel: `NIP: ${emp.employeeCode} · ${emp.departmentName ?? "Umum"}`
    }));
  }, [employees]);

  // Duration calculation for modal
  const modalDuration = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return 0;
    const d1 = new Date(`${startDate}T00:00:00Z`);
    const d2 = new Date(`${endDate}T00:00:00Z`);
    return Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  }, [startDate, endDate]);

  // Handle Status Update
  const handleUpdateStatus = async (id: string, newStatus: "APPROVED" | "REJECTED") => {
    try {
      const response = await fetch(`${API_URL}/api/leave/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Gagal memperbarui status cuti");
      }
      await loadRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  // Handle Submit New Leave
  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!selectedEmployeeId) {
      setFormError("Pilih karyawan terlebih dahulu");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setFormError("Rentang tanggal tidak valid");
      return;
    }
    if (!reason.trim()) {
      setFormError("Alasan cuti wajib diisi");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          employeeId: Number(selectedEmployeeId),
          leaveType,
          startDate,
          endDate,
          reason: reason.trim(),
          status: directApprove ? "APPROVED" : "PENDING"
        })
      });

      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan pengajuan cuti");

      setIsModalOpen(false);
      setSelectedEmployeeId("");
      setReason("");
      await loadRecords();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Daftar Cuti Karyawan"
        description="Kelola pengajuan cuti tahunan, cuti sakit, dan dispensasi kerja yang terhubung langsung ke kalender roster dan absensi."
      />

      {/* Summary Cards */}
      <div className="leave-summary-grid">
        <div className="leave-stat-card card-approved">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <span className="stat-label">Total Disetujui</span>
            <strong className="stat-value">{metrics.approved}</strong>
          </div>
        </div>

        <div className="leave-stat-card card-pending">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <span className="stat-label">Menunggu Persetujuan</span>
            <strong className="stat-value">{metrics.pending}</strong>
          </div>
        </div>

        <div className="leave-stat-card card-active">
          <div className="stat-icon">🏖️</div>
          <div className="stat-content">
            <span className="stat-label">Sedang Cuti Hari Ini</span>
            <strong className="stat-value">{metrics.activeToday}</strong>
          </div>
        </div>

        <div className="leave-stat-card card-total">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <span className="stat-label">Total Pengajuan</span>
            <strong className="stat-value">{metrics.total}</strong>
          </div>
        </div>
      </div>

      <section className="panel" style={{ padding: "20px 24px" }}>
        {/* Toolbar */}
        <div className="leave-toolbar">
          <div className="leave-search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama karyawan, NIP, atau alasan cuti..."
            />
            {search ? (
              <button type="button" className="clear-btn" onClick={() => setSearch("")}>✕</button>
            ) : null}
          </div>

          <div className="leave-filter-group">
            <select
              className="leave-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">Semua Jenis Cuti</option>
              <option value="ANNUAL">Cuti Tahunan</option>
              <option value="SICK">Cuti Sakit</option>
              <option value="FAMILY">Izin Keluarga</option>
              <option value="MATERNITY">Cuti Melahirkan</option>
              <option value="SPECIAL">Cuti Alasan Penting</option>
            </select>

            <select
              className="leave-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Semua Status</option>
              <option value="APPROVED">Disetujui</option>
              <option value="PENDING">Menunggu</option>
              <option value="REJECTED">Ditolak</option>
            </select>

            <button
              type="button"
              className="leave-add-btn"
              onClick={() => {
                setFormError("");
                setIsModalOpen(true);
              }}
            >
              + Ajukan Cuti Baru
            </button>
          </div>
        </div>

        {error ? <div className="notice notice-error"><strong>Gagal memuat cuti</strong><span>{error}</span></div> : null}
        {loading ? <div className="table-skeleton">{Array.from({ length: 5 }).map((_, i) => <span key={i} />)}</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="feedback-state">
            <strong>{records.length === 0 ? "Belum ada pengajuan cuti yang tercatat." : "Tidak ada data cuti yang sesuai filter."}</strong>
            <p>{records.length === 0 ? "Klik tombol '+ Ajukan Cuti Baru' untuk menambahkan cuti." : "Ubah kata kunci pencarian atau filter status."}</p>
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <div className="ref-table-card">
            <div className="ref-table-wrap">
              <table className="ref-attendance-table">
                <thead>
                  <tr>
                    <th className="th-karyawan">Karyawan</th>
                    <th className="th-departemen">Departemen</th>
                    <th style={{ width: "160px" }}>Jenis Cuti</th>
                    <th style={{ width: "200px" }}>Periode Tanggal</th>
                    <th style={{ width: "90px" }}>Durasi</th>
                    <th>Alasan / Keterangan</th>
                    <th className="th-status" style={{ width: "130px" }}>Status</th>
                    <th style={{ width: "140px", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      {/* Karyawan */}
                      <td className="td-karyawan">
                        <div className="ref-employee-cell">
                          <div
                            className="ref-avatar"
                            style={{ backgroundColor: getAvatarColor(item.employeeName) }}
                            title={item.employeeName}
                          >
                            {getInitials(item.employeeName)}
                          </div>
                          <div className="ref-employee-meta">
                            <strong className="ref-employee-name">{item.employeeName}</strong>
                            <span className="ref-employee-nip">NIP: {item.employeeCode}</span>
                          </div>
                        </div>
                      </td>

                      {/* Departemen */}
                      <td className="td-departemen">
                        <span className="ref-dept-name">{item.departmentName ?? "Umum"}</span>
                      </td>

                      {/* Jenis Cuti */}
                      <td>
                        <span className={`leave-type-badge ${leaveTypeTone(item.leaveType)}`}>
                          {leaveTypeLabel(item.leaveType)}
                        </span>
                      </td>

                      {/* Periode */}
                      <td>
                        <span className="leave-date-range">
                          {formatDateIndo(item.startDate)} s/d {formatDateIndo(item.endDate)}
                        </span>
                      </td>

                      {/* Durasi */}
                      <td>
                        <strong className="leave-duration-pill">{item.totalDays} Hari</strong>
                      </td>

                      {/* Alasan */}
                      <td>
                        <span className="leave-reason-text">{item.reason}</span>
                      </td>

                      {/* Status */}
                      <td className="td-status">
                        {item.status === "APPROVED" ? (
                          <span className="ref-status-pill pill-present"><span className="pill-ico">✓</span> Disetujui</span>
                        ) : item.status === "PENDING" ? (
                          <span className="ref-status-pill pill-late"><span className="pill-ico">⏳</span> Menunggu</span>
                        ) : (
                          <span className="ref-status-pill pill-absent"><span className="pill-ico">✕</span> Ditolak</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td style={{ textAlign: "center" }}>
                        <div className="leave-action-buttons">
                          {item.status === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                className="action-btn btn-approve"
                                onClick={() => void handleUpdateStatus(item.id, "APPROVED")}
                                title="Setujui permohonan cuti"
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                className="action-btn btn-reject"
                                onClick={() => void handleUpdateStatus(item.id, "REJECTED")}
                                title="Tolak permohonan cuti"
                              >
                                Tolak
                              </button>
                            </>
                          ) : item.status === "APPROVED" ? (
                            <button
                              type="button"
                              className="action-btn btn-cancel"
                              onClick={() => void handleUpdateStatus(item.id, "REJECTED")}
                              title="Batalkan persetujuan cuti"
                            >
                              Batalkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="action-btn btn-approve"
                              onClick={() => void handleUpdateStatus(item.id, "APPROVED")}
                              title="Setujui kembali"
                            >
                              Setujui
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Modal Ajukan Cuti Baru */}
      {isModalOpen ? (
        <div className="modal-backdrop" onClick={() => !submitting && setIsModalOpen(false)}>
          <div className="roster-backup-modal leave-modal" onClick={(e) => e.stopPropagation()}>
            <div className="roster-backup-modal-header">
              <div className="roster-backup-modal-title">
                <h3>Ajukan Cuti Karyawan</h3>
                <p>Formulir permohonan dan penetapan cuti langsung terhubung ke kalender roster.</p>
              </div>
              <button
                type="button"
                className="roster-backup-modal-close"
                onClick={() => !submitting && setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLeave}>
              <div className="roster-backup-modal-body">
                {formError ? <div className="notice notice-error"><strong>Validasi</strong><span>{formError}</span></div> : null}

                {/* Pilih Karyawan */}
                <div className="roster-backup-field">
                  <span className="field-title">Karyawan yang Mengajukan</span>
                  <SearchableSelect
                    options={employeeOptions}
                    value={selectedEmployeeId}
                    onChange={setSelectedEmployeeId}
                    placeholder="Pilih nama karyawan..."
                    searchPlaceholder="Ketik nama atau NIP..."
                    ariaLabel="Pilih karyawan cuti"
                  />
                </div>

                {/* Jenis Cuti */}
                <div className="roster-backup-field">
                  <span className="field-title">Jenis Cuti</span>
                  <select
                    className="leave-modal-select"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveRecord["leaveType"])}
                  >
                    <option value="ANNUAL">Cuti Tahunan</option>
                    <option value="SICK">Cuti Sakit (Disertai Surat Dokter)</option>
                    <option value="FAMILY">Izin Keperluan Keluarga</option>
                    <option value="MATERNITY">Cuti Melahirkan</option>
                    <option value="SPECIAL">Cuti Alasan Penting / Dispensasi</option>
                  </select>
                </div>

                {/* Rentang Tanggal */}
                <div className="roster-backup-dates-grid">
                  <label className="roster-backup-field">
                    <span className="field-title">Tanggal Mulai</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </label>

                  <label className="roster-backup-field">
                    <span className="field-title">Tanggal Selesai</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </label>
                </div>

                {modalDuration > 0 ? (
                  <div className="leave-duration-preview">
                    <span>Estimasi Durasi: <strong>{modalDuration} Hari Kerja</strong></span>
                  </div>
                ) : null}

                {/* Alasan */}
                <label className="roster-backup-field">
                  <span className="field-title">Alasan Pengajuan Cuti</span>
                  <textarea
                    className="leave-modal-textarea"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Keperluan keluarga di luar kota, urusan pernikahan, dll."
                    required
                  />
                </label>

                {/* Approval Langsung */}
                <label className="leave-checkbox-row">
                  <input
                    type="checkbox"
                    checked={directApprove}
                    onChange={(e) => setDirectApprove(e.target.checked)}
                  />
                  <span>Langsung setujui dan terapkan status cuti di kalender roster</span>
                </label>
              </div>

              <div className="roster-backup-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="action-btn btn-approve"
                  style={{ padding: "8px 18px", fontSize: "13px" }}
                  disabled={submitting || !selectedEmployeeId || !reason.trim()}
                >
                  {submitting ? "Menyimpan..." : "Simpan & Terapkan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
