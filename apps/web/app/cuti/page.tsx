"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/page-header";
import { CustomSelect, SearchableSelect, type SearchableOption } from "../components/custom-dropdown";
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

function leaveTypeIcon(type: LeaveRecord["leaveType"]) {
  switch (type) {
    case "ANNUAL": return "🏖️";
    case "SICK": return "🏥";
    case "FAMILY": return "👨‍👩‍👧";
    case "MATERNITY": return "🍼";
    case "SPECIAL": return "⭐";
    default: return "📋";
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

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export default function LeaveManagementPage() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  // Dual View Mode: "CALENDAR" vs "TABLE"
  const [viewMode, setViewMode] = useState<"CALENDAR" | "TABLE">("CALENDAR");

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  // Interactive Range Selection on Calendar Grid
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeHover, setRangeHover] = useState<string | null>(null);

  // Detail Modal for a specific leave chip
  const [selectedLeaveDetail, setSelectedLeaveDetail] = useState<LeaveRecord | null>(null);

  // Create Modal State
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

  // Departments List for Filter
  const departmentOptions = useMemo(() => {
    const deptSet = new Set<string>();
    employees.forEach((e) => {
      if (e.departmentName) deptSet.add(e.departmentName);
    });
    records.forEach((r) => {
      if (r.departmentName) deptSet.add(r.departmentName);
    });
    return [
      { value: "ALL", label: "Semua Departemen" },
      ...Array.from(deptSet).sort().map((d) => ({ value: d, label: d }))
    ];
  }, [employees, records]);

  // Filtered Records for Table and Calendar
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((item) => {
      const matchesSearch = !term || `${item.employeeName} ${item.employeeCode} ${item.departmentName ?? ""} ${item.reason}`.toLowerCase().includes(term);
      const matchesType = typeFilter === "ALL" || item.leaveType === typeFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchesDept = departmentFilter === "ALL" || (item.departmentName ?? "Umum") === departmentFilter;
      return matchesSearch && matchesType && matchesStatus && matchesDept;
    });
  }, [records, search, typeFilter, statusFilter, departmentFilter]);

  // Employee options for SearchableSelect
  const employeeOptions: SearchableOption[] = useMemo(() => {
    return employees.map((emp) => ({
      value: String(emp.id),
      label: emp.name,
      subLabel: `NIP: ${emp.employeeCode} · ${emp.departmentName ?? "Umum"}`
    }));
  }, [employees]);

  // Selected Employee Details for Form
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => String(e.id) === String(selectedEmployeeId)) ?? null;
  }, [employees, selectedEmployeeId]);

  // Duration calculation for modal
  const modalDuration = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return 0;
    const d1 = new Date(`${startDate}T00:00:00Z`);
    const d2 = new Date(`${endDate}T00:00:00Z`);
    return Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  }, [startDate, endDate]);

  // Department Conflict Detection in Modal
  const departmentConflictsInModal = useMemo(() => {
    if (!selectedEmployee || !selectedEmployee.departmentName || !startDate || !endDate) return [];
    const dept = selectedEmployee.departmentName;

    return records.filter((r) => {
      if (r.status === "REJECTED") return false;
      if (String(r.employeeId) === String(selectedEmployee.id)) return false;
      if ((r.departmentName ?? "Umum") !== dept) return false;
      // Overlap condition: r.startDate <= endDate && r.endDate >= startDate
      return r.startDate <= endDate && r.endDate >= startDate;
    });
  }, [selectedEmployee, startDate, endDate, records]);

  // Department Conflict Detection in Detail Modal
  const departmentConflictsInDetail = useMemo(() => {
    if (!selectedLeaveDetail || !selectedLeaveDetail.departmentName) return [];
    const dept = selectedLeaveDetail.departmentName;
    const sDate = selectedLeaveDetail.startDate;
    const eDate = selectedLeaveDetail.endDate;

    return records.filter((r) => {
      if (r.id === selectedLeaveDetail.id || r.status === "REJECTED") return false;
      if ((r.departmentName ?? "Umum") !== dept) return false;
      return r.startDate <= eDate && r.endDate >= sDate;
    });
  }, [selectedLeaveDetail, records]);

  // Calendar Navigation Handlers
  const handlePrevMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleTodayMonth = () => {
    setCalendarDate(new Date());
  };

  // Calendar Grid Builder (7 Columns: Senin s/d Minggu)
  const calendarCells = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDayOfMonth.getDate();

    // Monday-based index (0 = Monday, ..., 6 = Sunday)
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      leaves: LeaveRecord[];
      deptConflicts: { dept: string; count: number; names: string[] }[];
    }[] = [];

    // Leading days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const pDate = new Date(year, month - 1, d);
      const pStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = (pDate.getDay() + 6) % 7;
      const dayLeaves = filtered.filter((r) => r.startDate <= pStr && r.endDate >= pStr);

      // Dept conflicts for this day
      const deptMap = new Map<string, string[]>();
      dayLeaves.forEach((l) => {
        if (l.status === "REJECTED") return;
        const dName = l.departmentName || "Umum";
        const arr = deptMap.get(dName) ?? [];
        arr.push(l.employeeName);
        deptMap.set(dName, arr);
      });
      const conflicts: { dept: string; count: number; names: string[] }[] = [];
      deptMap.forEach((names, dept) => {
        if (names.length > 1) conflicts.push({ dept, count: names.length, names });
      });

      cells.push({
        dateStr: pStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: pStr === today,
        isWeekend: dayOfWeek >= 5,
        leaves: dayLeaves,
        deptConflicts: conflicts
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const cDate = new Date(year, month, d);
      const cStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = (cDate.getDay() + 6) % 7;
      const dayLeaves = filtered.filter((r) => r.startDate <= cStr && r.endDate >= cStr);

      const deptMap = new Map<string, string[]>();
      dayLeaves.forEach((l) => {
        if (l.status === "REJECTED") return;
        const dName = l.departmentName || "Umum";
        const arr = deptMap.get(dName) ?? [];
        arr.push(l.employeeName);
        deptMap.set(dName, arr);
      });
      const conflicts: { dept: string; count: number; names: string[] }[] = [];
      deptMap.forEach((names, dept) => {
        if (names.length > 1) conflicts.push({ dept, count: names.length, names });
      });

      cells.push({
        dateStr: cStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: cStr === today,
        isWeekend: dayOfWeek >= 5,
        leaves: dayLeaves,
        deptConflicts: conflicts
      });
    }

    // Trailing days to complete the 7-column grid
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nDate = new Date(year, month + 1, d);
        const nStr = `${nDate.getFullYear()}-${String(nDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayOfWeek = (nDate.getDay() + 6) % 7;
        const dayLeaves = filtered.filter((r) => r.startDate <= nStr && r.endDate >= nStr);

        const deptMap = new Map<string, string[]>();
        dayLeaves.forEach((l) => {
          if (l.status === "REJECTED") return;
          const dName = l.departmentName || "Umum";
          const arr = deptMap.get(dName) ?? [];
          arr.push(l.employeeName);
          deptMap.set(dName, arr);
        });
        const conflicts: { dept: string; count: number; names: string[] }[] = [];
        deptMap.forEach((names, dept) => {
          if (names.length > 1) conflicts.push({ dept, count: names.length, names });
        });

        cells.push({
          dateStr: nStr,
          dayNum: d,
          isCurrentMonth: false,
          isToday: nStr === today,
          isWeekend: dayOfWeek >= 5,
          leaves: dayLeaves,
          deptConflicts: conflicts
        });
      }
    }

    return cells;
  }, [calendarDate, filtered, today]);

  // Check if cell is in range selection
  const isCellInRange = (dateStr: string) => {
    if (!rangeStart) return false;
    const target = rangeHover || rangeStart;
    const min = rangeStart < target ? rangeStart : target;
    const max = rangeStart < target ? target : rangeStart;
    return dateStr >= min && dateStr <= max;
  };

  // Cell Click Handler for Interactive Range Selection
  const handleCellClick = (dateStr: string) => {
    if (!rangeStart) {
      // Step 1: Set start date
      setRangeStart(dateStr);
      setRangeHover(dateStr);
    } else {
      // Step 2: Set end date, finalize range and open modal
      const start = rangeStart < dateStr ? rangeStart : dateStr;
      const end = rangeStart < dateStr ? dateStr : rangeStart;
      setStartDate(start);
      setEndDate(end);
      setRangeStart(null);
      setRangeHover(null);
      setFormError("");
      setIsModalOpen(true);
    }
  };

  // Quick Add for single date directly from + button
  const handleQuickAddSingleDate = (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation();
    setStartDate(dateStr);
    setEndDate(dateStr);
    setRangeStart(null);
    setRangeHover(null);
    setFormError("");
    setIsModalOpen(true);
  };

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
      setSelectedLeaveDetail(null);
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
        description="Kelola pengajuan cuti tahunan, sakit, dan dispensasi dengan tampilan kalender interaktif full-color serta deteksi bentrok antar personel satu departemen."
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
        {/* Main Toolbar */}
        <div className="leave-toolbar">
          <div className="leave-search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama karyawan, NIP, departemen, atau alasan..."
            />
            {search ? (
              <button type="button" className="clear-btn" onClick={() => setSearch("")}>✕</button>
            ) : null}
          </div>

          <div className="leave-filter-group">
            {/* View Switcher: Kalender vs Tabel */}
            <div className="leave-view-switcher" role="group" aria-label="Mode Tampilan">
              <button
                type="button"
                className={`leave-view-btn ${viewMode === "CALENDAR" ? "is-active" : ""}`}
                onClick={() => setViewMode("CALENDAR")}
              >
                📅 Kalender Bulanan
              </button>
              <button
                type="button"
                className={`leave-view-btn ${viewMode === "TABLE" ? "is-active" : ""}`}
                onClick={() => setViewMode("TABLE")}
              >
                📋 Tabel & Riwayat
              </button>
            </div>

            {/* Departemen Filter */}
            <CustomSelect
              ariaLabel="Filter Departemen"
              value={departmentFilter}
              options={departmentOptions}
              onChange={setDepartmentFilter}
              className="leave-toolbar-select"
            />

            {/* Jenis Cuti Filter */}
            <CustomSelect
              ariaLabel="Filter Jenis Cuti"
              value={typeFilter}
              options={[
                { value: "ALL", label: "Semua Jenis Cuti" },
                { value: "ANNUAL", label: "🏖️ Cuti Tahunan" },
                { value: "SICK", label: "🏥 Cuti Sakit" },
                { value: "FAMILY", label: "👨‍👩‍👧 Izin Keluarga" },
                { value: "MATERNITY", label: "🍼 Cuti Melahirkan" },
                { value: "SPECIAL", label: "⭐ Cuti Alasan Penting" }
              ]}
              onChange={setTypeFilter}
              className="leave-toolbar-select"
            />

            {/* Status Filter */}
            <CustomSelect
              ariaLabel="Filter Status Cuti"
              value={statusFilter}
              options={[
                { value: "ALL", label: "Semua Status" },
                { value: "APPROVED", label: "✓ Disetujui" },
                { value: "PENDING", label: "⏳ Menunggu" },
                { value: "REJECTED", label: "✕ Ditolak" }
              ]}
              onChange={setStatusFilter}
              className="leave-toolbar-select"
            />

            <button
              type="button"
              className="leave-add-btn"
              onClick={() => {
                setStartDate(witaDate());
                setEndDate(witaDate());
                setFormError("");
                setIsModalOpen(true);
              }}
            >
              + Ajukan Cuti Baru
            </button>
          </div>
        </div>

        {/* Range Selection Active Announcement */}
        {rangeStart ? (
          <div className="leave-range-banner">
            <div className="leave-range-banner-content">
              <span className="leave-range-banner-badge">📍 MODE PILIH TANGGAL</span>
              <span>
                Tanggal Mulai: <strong>{formatDateIndo(rangeStart)}</strong>. Sekarang klik <strong>tanggal selesai</strong> di kalender untuk menentukan periode cuti.
              </span>
            </div>
            <button
              type="button"
              className="leave-range-cancel-btn"
              onClick={() => {
                setRangeStart(null);
                setRangeHover(null);
              }}
            >
              ✕ Batalkan Pilihan
            </button>
          </div>
        ) : null}

        {error ? <div className="notice notice-error"><strong>Gagal memuat cuti</strong><span>{error}</span></div> : null}
        {loading ? <div className="table-skeleton">{Array.from({ length: 5 }).map((_, i) => <span key={i} />)}</div> : null}

        {/* =========================================================================
            MODE 1: INTERACTIVE FULL-COLOR MONTHLY CALENDAR
           ========================================================================= */}
        {!loading && viewMode === "CALENDAR" ? (
          <div className="leave-calendar-card">
            {/* Calendar Nav Header */}
            <div className="leave-cal-header">
              <div className="leave-cal-nav-group">
                <button
                  type="button"
                  className="leave-cal-nav-btn"
                  onClick={handlePrevMonth}
                  title="Bulan Sebelumnya"
                >
                  ◀
                </button>
                <div className="leave-cal-month-title">
                  {MONTH_NAMES_ID[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                </div>
                <button
                  type="button"
                  className="leave-cal-nav-btn"
                  onClick={handleNextMonth}
                  title="Bulan Berikutnya"
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="leave-cal-today-btn"
                  onClick={handleTodayMonth}
                  title="Kembali ke Bulan Berjalan"
                >
                  Hari Ini
                </button>
              </div>

              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
                💡 <em>Klik tanggal mulai lalu klik tanggal selesai di kalender untuk mengajukan cuti berentang.</em>
              </div>
            </div>

            {/* Legend Bar (Full Color Guide) */}
            <div className="leave-legend-bar">
              <span className="leave-legend-title">Panduan Warna:</span>
              <span className="leave-legend-item leave-type-annual">🏖️ Cuti Tahunan</span>
              <span className="leave-legend-item leave-type-sick">🏥 Cuti Sakit</span>
              <span className="leave-legend-item leave-type-family">👨‍👩‍👧 Izin Keluarga</span>
              <span className="leave-legend-item leave-type-maternity">🍼 Cuti Melahirkan</span>
              <span className="leave-legend-item leave-type-special">⭐ Alasan Penting</span>
              <span className="leave-legend-item" style={{ background: "#fffbeb", borderColor: "#f59e0b", color: "#92400e" }}>
                ⚠️ Bentrok Dept (≥2 Cuti Bersamaan)
              </span>
            </div>

            {/* 7 Columns Weekday Header */}
            <div className="leave-cal-weekday-grid">
              <div className="leave-cal-weekday-col">SENIN</div>
              <div className="leave-cal-weekday-col">SELASA</div>
              <div className="leave-cal-weekday-col">RABU</div>
              <div className="leave-cal-weekday-col">KAMIS</div>
              <div className="leave-cal-weekday-col">JUMAT</div>
              <div className="leave-cal-weekday-col is-weekend">SABTU</div>
              <div className="leave-cal-weekday-col is-weekend">MINGGU</div>
            </div>

            {/* Calendar Cells Grid */}
            <div className="leave-cal-month-grid">
              {calendarCells.map((cell) => {
                const isStart = cell.dateStr === rangeStart;
                const inRange = isCellInRange(cell.dateStr);
                const isHoverTarget = Boolean(rangeStart && cell.dateStr === rangeHover && cell.dateStr !== rangeStart);

                let cellClass = "leave-cal-cell";
                if (!cell.isCurrentMonth) cellClass += " is-outside";
                if (cell.isWeekend) cellClass += " is-weekend";
                if (cell.isToday) cellClass += " is-today";
                if (isStart) cellClass += " is-range-start";
                else if (isHoverTarget) cellClass += " is-range-end";
                else if (inRange) cellClass += " is-in-range";

                return (
                  <div
                    key={cell.dateStr}
                    className={cellClass}
                    onClick={() => handleCellClick(cell.dateStr)}
                    onMouseEnter={() => {
                      if (rangeStart) setRangeHover(cell.dateStr);
                    }}
                    title={rangeStart ? `Klik untuk menetapkan tanggal selesai: ${cell.dateStr}` : `Klik untuk mulai memilih rentang dari ${cell.dateStr}`}
                  >
                    {/* Header: Date number & indicators */}
                    <div className="leave-cal-cell-header">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="leave-cal-day-num">{cell.dayNum}</span>
                        {cell.isToday ? <span className="leave-cal-today-tag">HARI INI</span> : null}
                        {cell.deptConflicts.length > 0 ? (
                          <span
                            className="leave-cal-conflict-tag"
                            title={`Bentrok Departemen: ${cell.deptConflicts.map((c) => `${c.dept} (${c.names.join(", ")})`).join("; ")}`}
                          >
                            ⚠️ {cell.deptConflicts[0]?.dept} ({cell.deptConflicts[0]?.count})
                          </span>
                        ) : null}
                      </div>

                      {/* Quick Add Button */}
                      <button
                        type="button"
                        className="leave-cal-add-btn"
                        onClick={(e) => handleQuickAddSingleDate(e, cell.dateStr)}
                        title={`Ajukan cuti khusus tanggal ${cell.dateStr}`}
                      >
                        +
                      </button>
                    </div>

                    {/* Chips for employees on leave */}
                    <div className="leave-cal-chips-list">
                      {cell.leaves.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className={`leave-cal-chip ${leaveTypeTone(item.leaveType)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLeaveDetail(item);
                          }}
                          title={`${item.employeeName} (${item.departmentName ?? "Umum"}) - ${leaveTypeLabel(item.leaveType)}: ${item.reason} [${item.status}]`}
                        >
                          <span
                            className="leave-cal-chip-avatar"
                            style={{ backgroundColor: getAvatarColor(item.employeeName) }}
                          >
                            {getInitials(item.employeeName)}
                          </span>
                          <span className="leave-cal-chip-name">{item.employeeName}</span>
                          <span className="leave-cal-chip-dept">{item.departmentName ? `· ${item.departmentName}` : ""}</span>
                          <span
                            className={`leave-cal-chip-status-dot ${item.status === "APPROVED" ? "is-approved" : "is-pending"}`}
                            title={`Status: ${item.status}`}
                          />
                        </div>
                      ))}

                      {cell.leaves.length > 3 ? (
                        <div
                          className="leave-cal-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLeaveDetail(cell.leaves[3] ?? null);
                          }}
                        >
                          +{cell.leaves.length - 3} lainnya...
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* =========================================================================
            MODE 2: ENHANCED TABLE & RIWAYAT VIEW
           ========================================================================= */}
        {!loading && viewMode === "TABLE" ? (
          filtered.length === 0 ? (
            <div className="feedback-state">
              <strong>{records.length === 0 ? "Belum ada pengajuan cuti yang tercatat." : "Tidak ada data cuti yang sesuai filter."}</strong>
              <p>{records.length === 0 ? "Klik tombol '+ Ajukan Cuti Baru' untuk menambahkan cuti." : "Ubah kata kunci pencarian atau filter."}</p>
            </div>
          ) : (
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
                            {leaveTypeIcon(item.leaveType)} {leaveTypeLabel(item.leaveType)}
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
          )
        ) : null}
      </section>

      {/* =========================================================================
          MODAL DETAIL CUTI DARI EVENT CHIP KALENDER
         ========================================================================= */}
      {selectedLeaveDetail ? (
        <div
          className="roster-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedLeaveDetail(null)}
        >
          <aside
            className="roster-backup-modal-card leave-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Detail Permohonan Cuti"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="roster-backup-modal-header">
              <div>
                <span className="roster-backup-eyebrow">DETAIL PENGAJUAN CUTI</span>
                <h2>{selectedLeaveDetail.employeeName}</h2>
                <p>NIP: {selectedLeaveDetail.employeeCode} · Departemen: {selectedLeaveDetail.departmentName ?? "Umum"}</p>
              </div>
              <button
                type="button"
                className="roster-backup-close-btn"
                aria-label="Tutup dialog detail cuti"
                onClick={() => setSelectedLeaveDetail(null)}
              >
                ✕
              </button>
            </div>

            <div className="roster-backup-modal-body">
              {/* Department Conflict Warning in Detail */}
              {departmentConflictsInDetail.length > 0 ? (
                <div className="leave-dept-conflict-box">
                  <div className="leave-dept-conflict-header">
                    ⚠️ Peringatan Bentrok Departemen ({departmentConflictsInDetail.length} Karyawan Lain Cuti Bersamaan)
                  </div>
                  <div className="leave-dept-conflict-desc">
                    Di departemen <strong>{selectedLeaveDetail.departmentName}</strong>, karyawan berikut juga memiliki jadwal cuti aktif yang beririsan dengan periode ini:
                  </div>
                  <ul className="leave-dept-conflict-list">
                    {departmentConflictsInDetail.map((c) => (
                      <li key={c.id} className="leave-dept-conflict-item">
                        <span><strong>{c.employeeName}</strong> ({leaveTypeLabel(c.leaveType)})</span>
                        <span className="leave-dept-conflict-dates">
                          {formatDateIndo(c.startDate)} s/d {formatDateIndo(c.endDate)} [{c.status}]
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="leave-detail-grid">
                <div className="leave-detail-item">
                  <span className="leave-detail-label">Jenis Cuti</span>
                  <div style={{ marginTop: "4px" }}>
                    <span className={`leave-type-badge ${leaveTypeTone(selectedLeaveDetail.leaveType)}`}>
                      {leaveTypeIcon(selectedLeaveDetail.leaveType)} {leaveTypeLabel(selectedLeaveDetail.leaveType)}
                    </span>
                  </div>
                </div>

                <div className="leave-detail-item">
                  <span className="leave-detail-label">Status Cuti</span>
                  <div style={{ marginTop: "4px" }}>
                    {selectedLeaveDetail.status === "APPROVED" ? (
                      <span className="ref-status-pill pill-present"><span className="pill-ico">✓</span> Disetujui</span>
                    ) : selectedLeaveDetail.status === "PENDING" ? (
                      <span className="ref-status-pill pill-late"><span className="pill-ico">⏳</span> Menunggu</span>
                    ) : (
                      <span className="ref-status-pill pill-absent"><span className="pill-ico">✕</span> Ditolak</span>
                    )}
                  </div>
                </div>

                <div className="leave-detail-item">
                  <span className="leave-detail-label">Periode Tanggal</span>
                  <span className="leave-detail-val">
                    {formatDateIndo(selectedLeaveDetail.startDate)} s/d {formatDateIndo(selectedLeaveDetail.endDate)}
                  </span>
                </div>

                <div className="leave-detail-item">
                  <span className="leave-detail-label">Total Durasi</span>
                  <span className="leave-detail-val">{selectedLeaveDetail.totalDays} Hari Kerja</span>
                </div>
              </div>

              <div className="leave-detail-reason-box">
                <h4>Alasan / Keterangan Pengajuan</h4>
                <p>{selectedLeaveDetail.reason || "Tidak ada keterangan tambahan."}</p>
              </div>
            </div>

            <div className="roster-backup-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedLeaveDetail(null)}
              >
                Tutup
              </button>

              {selectedLeaveDetail.status === "PENDING" ? (
                <>
                  <button
                    type="button"
                    className="action-btn btn-reject"
                    style={{ padding: "8px 16px", fontSize: "12px" }}
                    onClick={() => void handleUpdateStatus(selectedLeaveDetail.id, "REJECTED")}
                  >
                    Tolak Permohonan
                  </button>
                  <button
                    type="button"
                    className="action-btn btn-approve"
                    style={{ padding: "8px 16px", fontSize: "12px" }}
                    onClick={() => void handleUpdateStatus(selectedLeaveDetail.id, "APPROVED")}
                  >
                    ✓ Setujui Permohonan
                  </button>
                </>
              ) : selectedLeaveDetail.status === "APPROVED" ? (
                <button
                  type="button"
                  className="action-btn btn-cancel"
                  style={{ padding: "8px 16px", fontSize: "12px" }}
                  onClick={() => void handleUpdateStatus(selectedLeaveDetail.id, "REJECTED")}
                >
                  Batalkan Persetujuan
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn btn-approve"
                  style={{ padding: "8px 16px", fontSize: "12px" }}
                  onClick={() => void handleUpdateStatus(selectedLeaveDetail.id, "APPROVED")}
                >
                  Setujui Kembali
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {/* =========================================================================
          MODAL FORM AJUKAN CUTI BARU (DENGAN PERINGATAN BENTROK DEPARTEMEN)
         ========================================================================= */}
      {isModalOpen ? (
        <div
          className="roster-modal-backdrop"
          role="presentation"
          onMouseDown={() => !submitting && setIsModalOpen(false)}
        >
          <aside
            className="roster-backup-modal-card leave-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Ajukan cuti karyawan"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="roster-backup-modal-header">
              <div>
                <span className="roster-backup-eyebrow">PENGELOLAAN CUTI</span>
                <h2>Ajukan Cuti Karyawan</h2>
                <p>Formulir penetapan cuti langsung terhubung ke kalender roster & absensi.</p>
              </div>
              <button
                type="button"
                className="roster-backup-close-btn"
                aria-label="Tutup dialog cuti"
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
                    <span>Estimasi Durasi: <strong>{modalDuration} Hari Kerja</strong> ({formatDateIndo(startDate)} s/d {formatDateIndo(endDate)})</span>
                  </div>
                ) : null}

                {/* Warning Bentrok Departemen */}
                {departmentConflictsInModal.length > 0 ? (
                  <div className="leave-dept-conflict-box">
                    <div className="leave-dept-conflict-header">
                      ⚠️ Peringatan Bentrok Departemen ({departmentConflictsInModal.length} Karyawan Cuti Bersamaan)
                    </div>
                    <div className="leave-dept-conflict-desc">
                      Di departemen <strong>{selectedEmployee?.departmentName}</strong>, karyawan berikut juga memiliki cuti pada rentang tanggal ini:
                    </div>
                    <ul className="leave-dept-conflict-list">
                      {departmentConflictsInModal.map((c) => (
                        <li key={c.id} className="leave-dept-conflict-item">
                          <span><strong>{c.employeeName}</strong> ({leaveTypeLabel(c.leaveType)})</span>
                          <span className="leave-dept-conflict-dates">
                            {formatDateIndo(c.startDate)} s/d {formatDateIndo(c.endDate)} [{c.status}]
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#92400e", fontStyle: "italic" }}>
                      Harap pastikan delegasi tugas dan penjagaan shift tetap terpenuhi sebelum menyetujui.
                    </div>
                  </div>
                ) : null}

                {/* Jenis Cuti dengan Reusable CustomSelect */}
                <div className="roster-backup-field">
                  <span className="field-title">Jenis Cuti</span>
                  <CustomSelect
                    ariaLabel="Pilih jenis cuti"
                    value={leaveType}
                    options={[
                      { value: "ANNUAL", label: "🏖️ Cuti Tahunan" },
                      { value: "SICK", label: "🏥 Cuti Sakit (Disertai Surat Dokter)" },
                      { value: "FAMILY", label: "👨‍👩‍👧 Izin Keperluan Keluarga" },
                      { value: "MATERNITY", label: "🍼 Cuti Melahirkan" },
                      { value: "SPECIAL", label: "⭐ Cuti Alasan Penting / Dispensasi" }
                    ]}
                    onChange={(val) => setLeaveType(val as LeaveRecord["leaveType"])}
                  />
                </div>

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
          </aside>
        </div>
      ) : null}
    </>
  );
}
