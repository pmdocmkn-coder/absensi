"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge, type AttendanceTone } from "./components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type AuthUser = {
  employeeId: number;
  employeeCode: string;
  name: string;
  email: string | null;
  role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
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
  scheduleName: string | null;
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
  "#0284c7",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#e11d48",
  "#475569"
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

function formatWitaFullDate() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());
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

function getGreetingWita(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Makassar",
      hour: "numeric",
      hour12: false
    }).format(new Date())
  );
  if (hour >= 4 && hour < 11) return "pagi";
  if (hour >= 11 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  return "malam";
}

function formatScanTime(isoOrString: string | null) {
  if (!isoOrString) return "—";
  if (isoOrString.includes(" ")) {
    return isoOrString.slice(11, 16) + " WITA";
  }
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Makassar",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(isoOrString)) + " WITA";
  } catch {
    return isoOrString.slice(11, 16) || isoOrString;
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    PRESENT: "Hadir Tepat Waktu",
    LATE: "Terlambat",
    OVERTIME: "Lembur",
    ON_CALL: "On-call",
    OFF: "Jadwal Libur (OFF)",
    LEAVE: "Sedang Cuti",
    ABSENT: "Alfa / Tidak Hadir",
    PENDING: "Menunggu Scan",
    NEEDS_REVIEW: "Perlu Ditinjau",
    NO_SCHEDULE: "Belum Ada Jadwal"
  };
  return map[status] ?? status;
}

function statusTone(status: string): AttendanceTone {
  const map: Record<string, AttendanceTone> = {
    PRESENT: "on-time",
    LATE: "late",
    OVERTIME: "overtime",
    ON_CALL: "on-call",
    OFF: "off",
    LEAVE: "leave",
    ABSENT: "danger",
    NEEDS_REVIEW: "pending",
    PENDING: "pending",
    NO_SCHEDULE: "pending"
  };
  return map[status] ?? "pending";
}

export function RingkasanDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [record, setRecord] = useState<DailyAttendance | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScanLog[]>([]);
  const [activeTab, setActiveTab] = useState<"MY_SCANS" | "SITE_SCANS">("MY_SCANS");
  const [clock, setClock] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Live WITA clock
  useEffect(() => {
    setClock(formatWitaClock());
    const timer = setInterval(() => setClock(formatWitaClock()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError("");

    const today = witaDateStr();

    try {
      // 1. Fetch current auth user
      const authRes = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!authRes.ok) throw new Error("Sesi tidak valid. Silakan login kembali.");
      const authData = (await authRes.json()) as { user: AuthUser };
      setUser(authData.user);

      // 2. Fetch daily attendance for this user
      const dailyRes = await fetch(
        `${API_URL}/api/attendance/daily?from=${today}&to=${today}&employeeId=${authData.user.employeeId}`,
        { credentials: "include", cache: "no-store" }
      );
      if (dailyRes.ok) {
        const dailyData = (await dailyRes.json()) as { records?: DailyAttendance[] };
        setRecord(dailyData.records?.[0] ?? null);
      }

      // 3. Fetch recent site scans for the feed
      const scanRes = await fetch(`${API_URL}/api/attendance?limit=6`, {
        credentials: "include",
        cache: "no-store"
      });
      if (scanRes.ok) {
        const scanData = (await scanRes.json()) as { records?: RecentScanLog[] };
        setRecentScans(scanData.records ?? []);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat data ringkasan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const greeting = useMemo(() => getGreetingWita(), []);
  const todayFormatted = useMemo(() => formatWitaFullDate(), []);

  const status = record?.status ?? "PENDING";
  const isPresent = status === "PRESENT";
  const isLate = status === "LATE" || (record?.lateMinutes ?? 0) > 0;
  const isOff = status === "OFF";
  const isLeave = status === "LEAVE";

  // Schedule range string
  const scheduleTimeRange = useMemo(() => {
    if (record?.scheduledStartAt && record?.scheduledEndAt) {
      return `${record.scheduledStartAt.slice(11, 16)} - ${record.scheduledEndAt.slice(11, 16)} WITA`;
    }
    if (record?.scheduleName) return record.scheduleName;
    return isOff ? "Jadwal OFF / Libur" : isLeave ? "Cuti Kerja" : "Steady Day (08:00 - 17:00)";
  }, [record, isOff, isLeave]);

  return (
    <div className="ringkasan-dashboard-root">
      {/* Header Dinamis dengan Sapaan Ramah */}
      <header className="admin-dash-header">
        <div className="admin-dash-title-group">
          <h1>
            Selamat {greeting}, {user?.name ?? "Karyawan"}.
          </h1>
          <p>
            Ringkasan absensi mandiri, jadwal shift kerja, dan status tap Solution X105 Anda hari ini di Site Sangatta.
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
            title="Segarkan data ringkasan"
          >
            <span>{refreshing ? "⏳" : "🔄"}</span>
            <span>{refreshing ? "Memperbarui..." : "Segarkan"}</span>
          </button>
        </div>
      </header>

      {/* Error Alert */}
      {error ? (
        <div className="notice notice-error" role="alert" style={{ marginBottom: "20px" }}>
          <strong>Pemberitahuan</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {/* 4 Kartu KPI Kehadiran Mandiri Hari Ini */}
      <section className="admin-kpi-grid" aria-label="Ringkasan Kehadiran Hari Ini">
        {/* Card 1: Status Hari Ini */}
        <div className="admin-kpi-card kpi-accent">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Status Hari Ini</span>
            <div className="admin-kpi-icon" aria-hidden="true">
              {isPresent ? "✅" : isLate ? "⚠️" : isOff ? "🏖️" : isLeave ? "🏖️" : "⏱️"}
            </div>
          </div>
          <div className="admin-kpi-value" style={{ fontSize: "clamp(20px, 2vw, 26px)" }}>
            {loading ? "…" : statusLabel(status)}
          </div>
          <div className="admin-kpi-foot">
            <span>
              {record?.confirmationState === "CONFIRMED"
                ? "Dikonfirmasi admin"
                : "Dihitung otomatis mesin X105"}
            </span>
            <Link href="/absensi" className="admin-kpi-link">Detail →</Link>
          </div>
        </div>

        {/* Card 2: Waktu Masuk */}
        <div className="admin-kpi-card">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Waktu Masuk</span>
            <div className="admin-kpi-icon" aria-hidden="true">📥</div>
          </div>
          <div className="admin-kpi-value">
            {loading ? "…" : formatScanTime(record?.checkInAt ?? null)}
          </div>
          <div className="admin-kpi-foot">
            <span>
              {record?.lateMinutes
                ? `Terlambat ${record.lateMinutes} menit`
                : record?.checkInAt
                ? "Scan pertama tervalidasi"
                : "Belum melakukan tap masuk"}
            </span>
            <span style={{ color: "#64748b", fontFamily: "Consolas, monospace" }}>IN</span>
          </div>
        </div>

        {/* Card 3: Waktu Keluar */}
        <div className="admin-kpi-card">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Waktu Keluar</span>
            <div className="admin-kpi-icon" aria-hidden="true">📤</div>
          </div>
          <div className="admin-kpi-value">
            {loading ? "…" : formatScanTime(record?.checkOutAt ?? null)}
          </div>
          <div className="admin-kpi-foot">
            <span>
              {record?.overtimeMinutes
                ? `Estimasi lembur ${record.overtimeMinutes} menit`
                : record?.checkOutAt
                ? "Scan kepulangan tervalidasi"
                : "Menunggu tap keluar"}
            </span>
            <span style={{ color: "#64748b", fontFamily: "Consolas, monospace" }}>OUT</span>
          </div>
        </div>

        {/* Card 4: Jadwal Kerja */}
        <div className="admin-kpi-card">
          <div className="admin-kpi-head">
            <span className="admin-kpi-label">Jadwal Shift</span>
            <div className="admin-kpi-icon" aria-hidden="true">📅</div>
          </div>
          <div className="admin-kpi-value" style={{ fontSize: "clamp(18px, 1.8vw, 24px)" }}>
            {loading ? "…" : record?.scheduledStartAt ? record.scheduledStartAt.slice(11, 16) : "08:00"}
          </div>
          <div className="admin-kpi-foot">
            <span>{record?.scheduleName ?? "Steady Day Reguler"}</span>
            <span style={{ color: "#64748b", fontFamily: "Consolas, monospace" }}>WITA</span>
          </div>
        </div>
      </section>

      {/* Evaluasi Kehadiran Hari Ini (Clean Neo-Industrial White Box) */}
      <section className="ringkasan-eval-panel" aria-label="Rincian Evaluasi Kehadiran">
        <div className="admin-panel-head">
          <div>
            <h3>📋 Evaluasi Kehadiran & Jam Kerja Hari Ini</h3>
            <p>Sistem memadankan scan sidik jari X105 dengan jadwal kerja aktif Anda di Site Sangatta.</p>
          </div>
          <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
        </div>

        <div className="ringkasan-eval-grid">
          {/* Box 1: Keterangan Catatan */}
          <div className="ringkasan-eval-box">
            <span className="ringkasan-eval-box-label">
              <span>📝</span>
              <span>Catatan Sistem</span>
            </span>
            <strong className="ringkasan-eval-box-value">
              {record?.notes?.length ? record.notes.join(" · ") : "Menunggu absen masuk"}
            </strong>
          </div>

          {/* Box 2: Rentang Jam Kerja */}
          <div className="ringkasan-eval-box">
            <span className="ringkasan-eval-box-label">
              <span>⏱️</span>
              <span>Jam Dinas Terjadwal</span>
            </span>
            <strong className="ringkasan-eval-box-value">
              {scheduleTimeRange}
            </strong>
          </div>

          {/* Box 3: Toleransi Keterlambatan */}
          <div className="ringkasan-eval-box">
            <span className="ringkasan-eval-box-label">
              <span>🛡️</span>
              <span>Toleransi Masuk</span>
            </span>
            <strong className="ringkasan-eval-box-value">
              15 Menit Maksimal
            </strong>
          </div>

          {/* Box 4: Sumber Verifikasi */}
          <div className="ringkasan-eval-box">
            <span className="ringkasan-eval-box-label">
              <span>⚡</span>
              <span>Sumber Keputusan</span>
            </span>
            <strong className="ringkasan-eval-box-value">
              {record?.confirmationState === "CONFIRMED"
                ? "Divalidasi Tim HRD"
                : "Aturan Otomatis Mesin X105"}
            </strong>
          </div>
        </div>
      </section>

      {/* Bagian Bawah: Dua Kolom (Aktivitas Scan & Profil Jadwal Saya) */}
      <div className="admin-telemetry-grid">
        {/* Kolom Kiri: Riwayat Scan Hari Ini */}
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h3>Riwayat Transaksi Scan Hari Ini</h3>
              <p>Pilih tampilan log tap sidik jari mandiri atau feed mesin terkini.</p>
            </div>

            <div className="ringkasan-tabs" role="tablist">
              <button
                type="button"
                className={`ringkasan-tab-btn ${activeTab === "MY_SCANS" ? "is-active" : ""}`}
                onClick={() => setActiveTab("MY_SCANS")}
              >
                Scan Saya
              </button>
              <button
                type="button"
                className={`ringkasan-tab-btn ${activeTab === "SITE_SCANS" ? "is-active" : ""}`}
                onClick={() => setActiveTab("SITE_SCANS")}
              >
                Live Feed Site
              </button>
            </div>
          </div>

          {activeTab === "MY_SCANS" ? (
            <div className="ringkasan-personal-scan-box">
              {/* Scan Masuk */}
              <div className="ringkasan-scan-item">
                <div className="ringkasan-scan-info">
                  <div className="ringkasan-scan-type-icon scan-type-in" aria-hidden="true">
                    📥
                  </div>
                  <div className="ringkasan-scan-meta">
                    <strong>Absen Masuk (Check-In)</strong>
                    <span>
                      {record?.checkInAt
                        ? `Tercatat pada ${formatScanTime(record.checkInAt)} · Solusi X105`
                        : "Belum terdeteksi tap sidik jari masuk hari ini"}
                    </span>
                  </div>
                </div>
                <div>
                  {record?.checkInAt ? (
                    <StatusBadge tone="on-time">Berhasil Masuk</StatusBadge>
                  ) : (
                    <StatusBadge tone="pending">Menunggu Tap</StatusBadge>
                  )}
                </div>
              </div>

              {/* Scan Keluar */}
              <div className="ringkasan-scan-item">
                <div className="ringkasan-scan-info">
                  <div className="ringkasan-scan-type-icon scan-type-out" aria-hidden="true">
                    📤
                  </div>
                  <div className="ringkasan-scan-meta">
                    <strong>Absen Pulang (Check-Out)</strong>
                    <span>
                      {record?.checkOutAt
                        ? `Tercatat pada ${formatScanTime(record.checkOutAt)} · Solusi X105`
                        : "Lakukan scan sidik jari di mesin sebelum meninggalkan site"}
                    </span>
                  </div>
                </div>
                <div>
                  {record?.checkOutAt ? (
                    <StatusBadge tone="on-time">Berhasil Pulang</StatusBadge>
                  ) : (
                    <StatusBadge tone="off">Belum Pulang</StatusBadge>
                  )}
                </div>
              </div>

              <div
                style={{
                  marginTop: "16px",
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#64748b"
                }}
              >
                💡 <strong>Tips Operasional:</strong> Pastikan jari dalam keadaan bersih dan kering saat melakukan
                scan di Solution X105. Sistem otomatis mencatat log pertama sebagai waktu masuk dan log kepulangan sebagai waktu keluar.
              </div>
            </div>
          ) : (
            /* Live Feed Seluruh Site */
            <div style={{ overflowX: "auto" }}>
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
                    const empName = scan.employeeName ?? `PIN #${scan.employeeCode}`;
                    return (
                      <tr key={scan.id}>
                        <td>
                          <div className="admin-scan-user">
                            <div
                              className="admin-scan-avatar"
                              style={{ backgroundColor: getAvatarColor(empName) }}
                            >
                              {getInitials(empName)}
                            </div>
                            <div>
                              <div className="admin-scan-name">{empName}</div>
                              <div className="admin-scan-code">PIN: {scan.employeeCode}</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span style={{ fontWeight: 600 }}>{scan.departmentName ?? "Belum dipetakan"}</span>
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
            </div>
          )}

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
              Sinkronisasi data otomatis dengan receiver port 8080
            </span>
            <Link
              href="/absensi"
              style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
            >
              Lihat Rekap Kehadiran Lengkap →
            </Link>
          </div>
        </div>

        {/* Kolom Kanan: Jadwal & Profil Kerja Saya */}
        <div className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h3>Jadwal & Profil Kerja Saya</h3>
              <p>{todayFormatted}</p>
            </div>
            <StatusBadge tone="on-time">Site Sangatta</StatusBadge>
          </div>

          <div className="ringkasan-profile-list">
            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Nama Lengkap</span>
              <span className="ringkasan-profile-item-val">{user?.name ?? "—"}</span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">NIP / PIN Mesin</span>
              <span className="ringkasan-profile-item-val" style={{ fontFamily: "Consolas, monospace" }}>
                {user?.employeeCode ?? "—"}
              </span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Divisi / Departemen</span>
              <span className="ringkasan-profile-item-val">
                {record?.departmentName ?? "Operasional Sangatta"}
              </span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Pola Jadwal Aktif</span>
              <span className="ringkasan-profile-item-val">
                {record?.scheduleName ?? "Steady Day Reguler"}
              </span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Status Siaga On-Call</span>
              <span className="ringkasan-profile-item-val">
                {record?.hasOnCall ? "🟣 Siaga Aktif" : "Tidak Terjadwal"}
              </span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Status Cuti</span>
              <span className="ringkasan-profile-item-val">
                {isLeave ? "🔵 Sedang Cuti" : "Tidak Ada Cuti Aktif"}
              </span>
            </div>

            <div className="ringkasan-profile-item">
              <span className="ringkasan-profile-item-label">Estimasi Lembur</span>
              <span className="ringkasan-profile-item-val">
                {record?.overtimeMinutes ? `${record.overtimeMinutes} Menit` : "0 Menit"}
              </span>
            </div>
          </div>

          <div className="ringkasan-profile-actions">
            <Link href="/cuti" className="ringkasan-profile-btn btn-accent">
              <span>🏖️</span>
              <span>Ajukan Cuti Baru</span>
            </Link>
            {user?.role === "ADMIN" || user?.role === "SUPERVISOR" ? (
              <Link href="/admin/roster" className="ringkasan-profile-btn">
                <span>📅</span>
                <span>Kalender Roster</span>
              </Link>
            ) : (
              <Link href="/absensi" className="ringkasan-profile-btn">
                <span>📊</span>
                <span>Rekap Absensi</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
