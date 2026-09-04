"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Employee = {
  id: number;
  employeeCode: string;
  name: string;
  departmentName: string | null;
  siteName: string | null;
  deviceMappings: Array<{ deviceSerial: string; deviceUserCode: string }>;
};

type WorkMode = {
  employeeId: number;
  mode: "FIXED" | "ROSTER" | "NONE";
  rosterGroup: string | null;
};

type DailyAttendance = {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  attendanceDate: string;
  status: string;
  autoStatus: string;
  confirmationState: "AUTO" | "CONFIRMED";
  checkInAt: string | null;
  checkOutAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduleCode: string | null;
  scanCount: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  hasOnCall: boolean;
  notes: string[];
};

type RecentScanLog = {
  id: number;
  deviceSerial: string;
  employeeCode: string;
  employeeName: string | null;
  departmentName: string | null;
  siteName: string | null;
  recordedAt: string;
  attendanceStatus: number;
  verificationType: number;
  receivedAt: string;
};

const AVATAR_COLORS = [
  "#0284c7", // Blue
  "#059669", // Emerald
  "#7c3aed", // Violet
  "#d97706", // Amber
  "#db2777", // Pink
  "#4f46e5", // Indigo
  "#0d9488", // Teal
  "#e11d48", // Rose
  "#475569"  // Slate
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function witaDateStr() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const val = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${val("year")}-${val("month")}-${val("day")}`;
}

function formatWitaClock() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function formatScanTime(isoOrString: string) {
  if (!isoOrString) return "—";
  if (isoOrString.includes(" ")) {
    return isoOrString.slice(11, 19) + " WITA";
  }
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Makassar",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(isoOrString)) + " WITA";
  } catch {
    return isoOrString.slice(11, 19) || isoOrString;
  }
}

export function AdminDashboardView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyAttendance[]>([]);
  const [recentScans, setRecentScans] = useState<RecentScanLog[]>([]);
  const [totalLogCount, setTotalLogCount] = useState<number>(0);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [receiverOnline, setReceiverOnline] = useState<boolean | null>(null);
  const [clock, setClock] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Live WITA Clock
  useEffect(() => {
    setClock(formatWitaClock());
    const interval = setInterval(() => {
      setClock(formatWitaClock());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError("");

    const today = witaDateStr();

    try {
      const [empRes, dailyRes, scanRes, modeRes, healthRes] = await Promise.all([
        fetch(`${API_URL}/api/employees`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/attendance/daily?from=${today}&to=${today}`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/attendance?limit=8`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/employee-work-modes`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/health`, { cache: "no-store" }).catch(() => null)
      ]);

      if (!empRes.ok) throw new Error("Gagal memuat data karyawan");
      const empData = (await empRes.json()) as { records?: Employee[] };
      setEmployees(empData.records ?? []);

      if (dailyRes.ok) {
        const dailyData = (await dailyRes.json()) as { records?: DailyAttendance[] };
        setDailyRecords(dailyData.records ?? []);
      }

      if (scanRes.ok) {
        const scanData = (await scanRes.json()) as { total?: number; records?: RecentScanLog[] };
        setRecentScans(scanData.records ?? []);
        if (typeof scanData.total === "number") {
          setTotalLogCount(scanData.total);
        }
      }

      if (modeRes.ok) {
        const modeData = (await modeRes.json()) as { records?: WorkMode[] };
        setWorkModes(modeData.records ?? []);
      }

      setReceiverOnline(healthRes ? healthRes.ok : false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data operasional");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Computed Metrics
  const metrics = useMemo(() => {
    const totalEmployees = employees.length;
    const rosterEmployees = workModes.filter((m) => m.mode === "ROSTER").length;
    const steadyDayEmployees = totalEmployees - rosterEmployees;
    const unmappedPin = employees.filter((e) => e.deviceMappings.length === 0).length;
    const unmappedDept = employees.filter((e) => !e.departmentName).length;

    let scannedCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    let overtimeCount = 0;
    let offCount = 0;
    let leaveCount = 0;
    let needsReviewCount = 0;

    for (const r of dailyRecords) {
      if (r.scanCount > 0) {
        scannedCount++;
        if (r.status === "LATE" || r.lateMinutes > 0) {
          lateCount++;
        } else if (r.status === "PRESENT") {
          onTimeCount++;
        }
        if (r.status === "OVERTIME" || r.overtimeMinutes > 0) {
          overtimeCount++;
        }
        if (["NEEDS_REVIEW", "NO_SCHEDULE"].includes(r.autoStatus) && r.confirmationState !== "CONFIRMED") {
          needsReviewCount++;
        }
      } else {
        if (r.status === "OFF" || r.notes.some((n) => n.toLowerCase().includes("off"))) {
          offCount++;
        } else if (r.status === "LEAVE" || r.notes.some((n) => n.toLowerCase().includes("cuti"))) {
          leaveCount++;
        }
      }
    }

    const pendingCount = Math.max(0, totalEmployees - scannedCount - offCount - leaveCount);

    return {
      totalEmployees,
      rosterEmployees,
      steadyDayEmployees,
      unmappedPin,
      unmappedDept,
      scannedCount,
      onTimeCount,
      lateCount,
      overtimeCount,
      offCount,
      leaveCount,
      needsReviewCount,
      pendingCount
    };
  }, [employees, dailyRecords, workModes]);

  // Calculate percentages for the distribution bar
  const pulsePercentages = useMemo(() => {
    const total = metrics.totalEmployees || 1;
    const presentPct = Math.round((metrics.onTimeCount / total) * 100);
    const latePct = Math.round((metrics.lateCount / total) * 100);
    const overtimePct = Math.round((metrics.overtimeCount / total) * 100);
    const offPct = Math.round(((metrics.offCount + metrics.leaveCount) / total) * 100);
    const pendingPct = Math.max(0, 100 - presentPct - latePct - overtimePct - offPct);

    return { presentPct, latePct, overtimePct, offPct, pendingPct };
  }, [metrics]);

  return (
    <div className="admin-dashboard-root">
      {/* Header Operasional */}
      <header className="admin-dash-header">
        <div className="admin-dash-title-group">
          <h1>Dashboard Operasional Admin</h1>
          <p>
            Pusat kendali absensi Site Sangatta, pemantauan perangkat Solution X105 realtime, dan sinkronisasi roster kerja.
          </p>
        </div>

        <div className="admin-dash-actions">
          <div className="admin-clock-badge" title="Waktu Indonesia Tengah (WITA)">
            <span className="admin-clock-dot" aria-hidden="true" />
            <span>{clock || "Memuat waktu..."}</span>
          </div>

          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            title="Segarkan seluruh data dashboard"
          >
            <span>{refreshing ? "⏳" : "🔄"}</span>
            <span>{refreshing ? "Memperbarui..." : "Segarkan"}</span>
          </button>
        </div>
      </header>

      {/* Error Notice */}
      {error ? (
        <div className="notice notice-error" role="alert" style={{ marginBottom: "20px" }}>
          <strong>Gagal memuat sebagian data operasional</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {/* 4 KPI Metric Cards */}
      <section className="admin-kpi-grid" aria-label="Indikator Kinerja Utama Operasional">
        {/* Total Karyawan */}
        <div className="admin-kpi-card">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Total Personil</span>
            <div className="admin-kpi-icon" aria-hidden="true">👥</div>
          </div>
          <div className="admin-kpi-value">{loading ? "…" : metrics.totalEmployees}</div>
          <div className="admin-kpi-foot">
            <span>{metrics.rosterEmployees} Roster · {metrics.steadyDayEmployees} Steady Day</span>
            <Link href="/admin/karyawan" className="admin-kpi-link">Kelola →</Link>
          </div>
        </div>

        {/* Kehadiran Hari Ini */}
        <div className="admin-kpi-card kpi-accent">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Kehadiran Hari Ini</span>
            <div className="admin-kpi-icon" aria-hidden="true">⏱️</div>
          </div>
          <div className="admin-kpi-value">
            {loading ? "…" : `${metrics.scannedCount} Scan`}
          </div>
          <div className="admin-kpi-foot">
            <span>{metrics.onTimeCount} Tepat Waktu · {metrics.lateCount} Terlambat</span>
            <Link href="/absensi" className="admin-kpi-link">Rekap →</Link>
          </div>
        </div>

        {/* Antrean Verifikasi Scan */}
        <div className={`admin-kpi-card ${metrics.needsReviewCount > 0 ? "kpi-warning" : ""}`}>
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Antrean Verifikasi</span>
            <div className="admin-kpi-icon" aria-hidden="true">📋</div>
          </div>
          <div className="admin-kpi-value">
            {loading ? "…" : metrics.needsReviewCount > 0 ? `${metrics.needsReviewCount} Perlu Aksi` : "0 Antrean"}
          </div>
          <div className="admin-kpi-foot">
            <span>
              {metrics.needsReviewCount > 0
                ? "Anomali / lembur menunggu sah"
                : "Seluruh scan tervalidasi"}
            </span>
            <Link href="/admin/kehadiran" className="admin-kpi-link">
              {metrics.needsReviewCount > 0 ? "Tinjau Sekarang →" : "Buka →"}
            </Link>
          </div>
        </div>

        {/* Perangkat Solution X105 */}
        <div className="admin-kpi-card">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Receiver Mesin X105</span>
            <div className="admin-kpi-icon" aria-hidden="true">📟</div>
          </div>
          <div className="admin-kpi-value">
            {loading ? "…" : receiverOnline ? "Online" : "Offline"}
          </div>
          <div className="admin-kpi-foot">
            <span>
              {totalLogCount > 0
                ? `${totalLogCount.toLocaleString("id-ID")} Log Scan`
                : "Port 8080 ADMS"}
            </span>
            <Link href="/admin/perangkat" className="admin-kpi-link">Monitor →</Link>
          </div>
        </div>
      </section>

      {/* Actionable Notice Banner if Master Data needs attention */}
      {!loading && (metrics.unmappedDept > 0 || metrics.unmappedPin > 0) ? (
        <div className="admin-alert-banner" role="alert">
          <div>
            <strong>⚠️ Perhatian Integritas Master Data:</strong> Terdapat{" "}
            {metrics.unmappedDept > 0 ? `${metrics.unmappedDept} personil belum dipetakan departemennya` : ""}
            {metrics.unmappedDept > 0 && metrics.unmappedPin > 0 ? " dan " : ""}
            {metrics.unmappedPin > 0 ? `${metrics.unmappedPin} personil belum memiliki pemetaan PIN mesin X105` : ""}.
            Lengkapi data ini agar absensi terhitung otomatis tanpa kendala.
          </div>
          <Link href="/admin/karyawan" className="admin-alert-banner-btn">
            Lengkapi Data Karyawan →
          </Link>
        </div>
      ) : null}

      {/* Quick Command Hub (5 Modul Navigasi Utama) */}
      <section className="admin-hub-section" aria-label="Modul Manajemen Operasional">
        <div className="admin-section-header">
          <div>
            <h2>🛠️ Pusat Manajemen Operasional</h2>
            <p>Akses langsung ke konfigurasi master data, jadwal shift, dan verifikasi absensi harian.</p>
          </div>
        </div>

        <div className="admin-hub-grid">
          {/* Modul 1: Verifikasi Absensi */}
          <Link href="/admin/kehadiran" className="admin-hub-card">
            <div className="admin-hub-card-top">
              <div className="admin-hub-card-icon" aria-hidden="true">📋</div>
              {metrics.needsReviewCount > 0 ? (
                <span className="admin-hub-badge hub-badge-warning">{metrics.needsReviewCount} Perlu Ditinjau</span>
              ) : (
                <span className="admin-hub-badge hub-badge-success">Semua Selesai</span>
              )}
            </div>
            <div>
              <h3 className="admin-hub-title">Verifikasi & Anomali Scan</h3>
              <p className="admin-hub-desc">
                Sahkan scan lembur, keterlambatan, shift malam lintas hari, dan scan di luar jadwal.
              </p>
            </div>
            <div className="admin-hub-action">
              <span>Buka Verifikasi Kehadiran</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>

          {/* Modul 2: Data Karyawan */}
          <Link href="/admin/karyawan" className="admin-hub-card">
            <div className="admin-hub-card-top">
              <div className="admin-hub-card-icon" aria-hidden="true">👥</div>
              {metrics.unmappedPin > 0 ? (
                <span className="admin-hub-badge hub-badge-warning">{metrics.unmappedPin} Tanpa PIN</span>
              ) : (
                <span className="admin-hub-badge hub-badge-neutral">{metrics.totalEmployees} Karyawan</span>
              )}
            </div>
            <div>
              <h3 className="admin-hub-title">Data Karyawan & PIN Mesin</h3>
              <p className="admin-hub-desc">
                Kelola 108 personil, mapping PIN mesin finger X105, departemen, site, dan grup kerja.
              </p>
            </div>
            <div className="admin-hub-action">
              <span>Buka Data Karyawan</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>

          {/* Modul 3: Kalender Roster */}
          <Link href="/admin/roster" className="admin-hub-card">
            <div className="admin-hub-card-top">
              <div className="admin-hub-card-icon" aria-hidden="true">📅</div>
              <span className="admin-hub-badge hub-badge-info">3 Crew Roster</span>
            </div>
            <div>
              <h3 className="admin-hub-title">Jadwal Roster & Crew</h3>
              <p className="admin-hub-desc">
                Atur rotasi Crew A, Crew B, Crew C, jadwal backup cuti, giliran shift, dan on-call.
              </p>
            </div>
            <div className="admin-hub-action">
              <span>Buka Kalender Roster</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>

          {/* Modul 4: Pengaturan Jam Kerja */}
          <Link href="/admin/pengaturan-jam" className="admin-hub-card">
            <div className="admin-hub-card-top">
              <div className="admin-hub-card-icon" aria-hidden="true">⚙️</div>
              <span className="admin-hub-badge hub-badge-neutral">Toleransi 15 Mnt</span>
            </div>
            <div>
              <h3 className="admin-hub-title">Pengaturan Jam & Shift</h3>
              <p className="admin-hub-desc">
                Konfigurasi jam masuk/pulang Steady Day, Shift Pagi, Shift Malam, dan cut-off lembur.
              </p>
            </div>
            <div className="admin-hub-action">
              <span>Buka Pengaturan Jam</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>

          {/* Modul 5: Perangkat X105 */}
          <Link href="/admin/perangkat" className="admin-hub-card">
            <div className="admin-hub-card-top">
              <div className="admin-hub-card-icon" aria-hidden="true">📟</div>
              {receiverOnline ? (
                <span className="admin-hub-badge hub-badge-success">ADMS Port 8080</span>
              ) : (
                <span className="admin-hub-badge hub-badge-warning">Perlu Dicek</span>
              )}
            </div>
            <div>
              <h3 className="admin-hub-title">Monitor Perangkat X105</h3>
              <p className="admin-hub-desc">
                Diagnostik receiver ADMS port 8080, event listener, dan riwayat transmisi log mesin.
              </p>
            </div>
            <div className="admin-hub-action">
              <span>Buka Monitor Perangkat</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Two-Column Telemetry: Live Scan Feed (Left) & Today's Attendance Pulse (Right) */}
      <div className="admin-telemetry-grid">
        {/* Kolom Kiri: Live Scan Feed Mesin X105 */}
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h3>Aktivitas Scan Mesin X105 Terkini</h3>
              <p>Log scan fingerprint terbaru yang diterima server dari Site Sangatta.</p>
            </div>
            <span
              className="admin-hub-badge hub-badge-success"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <span className="admin-clock-dot" style={{ width: "6px", height: "6px" }} />
              Live Feed
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            {recentScans.length === 0 ? (
              <div className="feedback-state" style={{ padding: "36px 20px" }}>
                <strong>Belum ada transaksi scan pada database</strong>
                <p>Scan di mesin Solution X105 akan otomatis tampil di sini secara realtime.</p>
              </div>
            ) : (
              <table className="admin-scan-table">
                <thead>
                  <tr>
                    <th>Personil</th>
                    <th>Departemen</th>
                    <th>Waktu Scan (WITA)</th>
                    <th>Metode Scan</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScans.map((scan) => {
                    const employeeName = scan.employeeName ?? `PIN #${scan.employeeCode}`;
                    return (
                      <tr key={scan.id}>
                        <td>
                          <div className="admin-scan-user">
                            <div
                              className="admin-scan-avatar"
                              style={{ backgroundColor: getAvatarColor(employeeName) }}
                              title={employeeName}
                            >
                              {getInitials(employeeName)}
                            </div>
                            <div>
                              <div className="admin-scan-name">{employeeName}</div>
                              <div className="admin-scan-code">PIN: {scan.employeeCode}</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span style={{ fontWeight: 600 }}>{scan.departmentName ?? "Belum dipetakan"}</span>
                          <span style={{ display: "block", fontSize: "10.5px", color: "#64748b" }}>
                            {scan.siteName ?? "Site Sangatta"}
                          </span>
                        </td>

                        <td>
                          <span className="admin-scan-time">
                            {formatScanTime(scan.recordedAt)}
                          </span>
                        </td>

                        <td>
                          <span
                            className="admin-hub-badge hub-badge-neutral"
                            style={{ fontSize: "10px", padding: "2px 6px" }}
                          >
                            Fingerprint (X105)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px"
            }}
          >
            <span style={{ color: "#64748b" }}>
              Menampilkan {recentScans.length} log transaksi scan finger terbaru
            </span>
            <Link
              href="/admin/perangkat"
              style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
            >
              Buka Monitor Diagnostik Lengkap →
            </Link>
          </div>
        </div>

        {/* Kolom Kanan: Status Kehadiran Hari Ini & Kesehatan Sistem */}
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h3>Status Kehadiran Hari Ini</h3>
              <p>Distribusi absensi seluruh karyawan aktif pada tanggal {witaDateStr()}.</p>
            </div>
          </div>

          <div className="admin-panel-body">
            {/* Visual Distribution Bar */}
            <div className="admin-pulse-bar-wrapper">
              <div className="admin-pulse-bar" title="Distribusi Kehadiran Hari Ini">
                <div
                  className="admin-pulse-segment pulse-seg-present"
                  style={{ width: `${pulsePercentages.presentPct}%` }}
                  title={`Hadir: ${metrics.onTimeCount} (${pulsePercentages.presentPct}%)`}
                />
                <div
                  className="admin-pulse-segment pulse-seg-late"
                  style={{ width: `${pulsePercentages.latePct}%` }}
                  title={`Terlambat: ${metrics.lateCount} (${pulsePercentages.latePct}%)`}
                />
                <div
                  className="admin-pulse-segment pulse-seg-overtime"
                  style={{ width: `${pulsePercentages.overtimePct}%` }}
                  title={`Lembur: ${metrics.overtimeCount} (${pulsePercentages.overtimePct}%)`}
                />
                <div
                  className="admin-pulse-segment pulse-seg-off"
                  style={{ width: `${pulsePercentages.offPct}%` }}
                  title={`Jadwal OFF / Cuti: ${metrics.offCount + metrics.leaveCount} (${pulsePercentages.offPct}%)`}
                />
                <div
                  className="admin-pulse-segment pulse-seg-pending"
                  style={{ width: `${pulsePercentages.pendingPct}%` }}
                  title={`Menunggu / Belum Scan: ${metrics.pendingCount} (${pulsePercentages.pendingPct}%)`}
                />
              </div>

              {/* Legend Items */}
              <div className="admin-pulse-legend">
                <div className="admin-pulse-item">
                  <div className="admin-pulse-item-label">
                    <span className="admin-pulse-dot" style={{ background: "#22c55e" }} />
                    <span>Hadir Tepat Waktu</span>
                  </div>
                  <span className="admin-pulse-item-val">{metrics.onTimeCount}</span>
                </div>

                <div className="admin-pulse-item">
                  <div className="admin-pulse-item-label">
                    <span className="admin-pulse-dot" style={{ background: "#f59e0b" }} />
                    <span>Terlambat</span>
                  </div>
                  <span className="admin-pulse-item-val">{metrics.lateCount}</span>
                </div>

                <div className="admin-pulse-item">
                  <div className="admin-pulse-item-label">
                    <span className="admin-pulse-dot" style={{ background: "#f97316" }} />
                    <span>Scan Lembur</span>
                  </div>
                  <span className="admin-pulse-item-val">{metrics.overtimeCount}</span>
                </div>

                <div className="admin-pulse-item">
                  <div className="admin-pulse-item-label">
                    <span className="admin-pulse-dot" style={{ background: "#94a3b8" }} />
                    <span>Jadwal OFF / Cuti</span>
                  </div>
                  <span className="admin-pulse-item-val">{metrics.offCount + metrics.leaveCount}</span>
                </div>
              </div>
            </div>

            {/* Kesehatan Sistem & Status Roster */}
            <div>
              <div
                style={{
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#0f172a",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>⚡</span>
                <span>Kesiapan & Integritas Operasional</span>
              </div>

              <div className="admin-health-list">
                <div className="admin-health-row">
                  <div className="admin-health-info">
                    <span>📟</span>
                    <span>Receiver Solution X105 (ADMS)</span>
                  </div>
                  <span
                    className={`admin-health-badge ${
                      receiverOnline ? "admin-health-ok" : "admin-health-warn"
                    }`}
                  >
                    {receiverOnline ? "Online (Port 8080)" : "Perlu Dicek"}
                  </span>
                </div>

                <div className="admin-health-row">
                  <div className="admin-health-info">
                    <span>⚡</span>
                    <span>Rules Engine Absensi & Shift Malam</span>
                  </div>
                  <span className="admin-health-badge admin-health-ok">Aktif & Otomatis</span>
                </div>

                <div className="admin-health-row">
                  <div className="admin-health-info">
                    <span>📅</span>
                    <span>Pola Roster Tambang (Crew A, B, C)</span>
                  </div>
                  <span className="admin-health-badge admin-health-ok">
                    {metrics.rosterEmployees > 0
                      ? `${metrics.rosterEmployees} Personil Aktif`
                      : "Siap Digunakan"}
                  </span>
                </div>

                <div className="admin-health-row">
                  <div className="admin-health-info">
                    <span>👥</span>
                    <span>Kelengkapan Master Data Personil</span>
                  </div>
                  <span
                    className={`admin-health-badge ${
                      metrics.unmappedPin === 0 ? "admin-health-ok" : "admin-health-warn"
                    }`}
                  >
                    {metrics.unmappedPin === 0 ? "100% Lengkap" : `${metrics.unmappedPin} Tanpa PIN`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
