"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAvatarColor } from "./attendance-display";

type PublicAttendanceRecord = {
  employeeName: string;
  departmentName: string | null;
  recordedAt: string;
  eventType: "IN" | "OUT" | "SCAN";
  scheduleName: string | null;
  note: string;
  tone: "success" | "warning" | "info" | "neutral";
};

type PublicAttendanceResponse = {
  date: string;
  timeZone: string;
  siteName: string;
  generatedAt: string;
  summary: {
    totalScans: number;
    totalEmployees: number;
  };
  records: PublicAttendanceRecord[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const DISPLAY_TIME_ZONE = "Asia/Makassar";

function parseDeviceTime(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? value
    : `${value.replace(" ", "T")}+08:00`;
  return new Date(normalized);
}

function formatScanTime(value: string) {
  const parsed = parseDeviceTime(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE
  }).format(parsed).replaceAll(".", ":");
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE
  }).format(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function eventLabel(eventType: PublicAttendanceRecord["eventType"]) {
  if (eventType === "IN") return "Masuk";
  if (eventType === "OUT") return "Keluar";
  return "Terekam";
}

function eventMessage(eventType: PublicAttendanceRecord["eventType"]) {
  if (eventType === "IN") return "Absensi masuk berhasil diterima";
  if (eventType === "OUT") return "Absensi keluar berhasil diterima";
  return "Scan absensi berhasil diterima";
}

function eventSubMessage(eventType: PublicAttendanceRecord["eventType"]) {
  if (eventType === "IN") return "Selamat bertugas, tetap semangat dan utamakan keselamatan!";
  if (eventType === "OUT") return "Terima kasih atas dedikasi Anda hari ini, hati-hati di jalan!";
  return "Data scan kehadiran berhasil tercatat otomatis di sistem.";
}

function getDepartmentIcon(dept: string | null) {
  if (!dept) return "📋";
  const d = dept.toLowerCase();
  if (d.includes("telco") || d.includes("it") || d.includes("teknologi")) return "📻";
  if (d.includes("pit") || d.includes("tambang") || d.includes("drill")) return "🏗️";
  if (d.includes("workshop") || d.includes("eng") || d.includes("mekanik")) return "🔧";
  if (d.includes("hc") || d.includes("hr") || d.includes("training")) return "🤝";
  if (d.includes("help") || d.includes("desk")) return "🎧";
  if (d.includes("keuangan") || d.includes("finance")) return "💰";
  if (d.includes("security") || d.includes("hse") || d.includes("safety")) return "🛡️";
  return "💼";
}

export function PublicAttendanceScreen() {
  const [data, setData] = useState<PublicAttendanceResponse | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [connectionState, setConnectionState] = useState<"loading" | "online" | "offline">("loading");

  useEffect(() => {
    setNow(new Date());
    const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`${API_URL}/api/public/attendance-display`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Layanan absensi tidak tersedia");
        setData(await response.json() as PublicAttendanceResponse);
        setConnectionState("online");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionState("offline");
      }
    };

    void load();
    const refreshTimer = window.setInterval(load, 5_000);
    return () => {
      controller?.abort();
      window.clearInterval(refreshTimer);
    };
  }, []);

  const latest = data?.records[0] ?? null;
  const recent = useMemo(() => data?.records.slice(1, 7) ?? [], [data]);

  // Calculations for progress indicators
  const totalEmployees = data?.summary.totalEmployees ?? 0;
  const totalScans = data?.summary.totalScans ?? 0;

  const inScansCount = useMemo(() => {
    return data?.records.filter((r) => r.eventType === "IN").length ?? 0;
  }, [data]);

  const outScansCount = useMemo(() => {
    return data?.records.filter((r) => r.eventType === "OUT").length ?? 0;
  }, [data]);

  const lateCount = useMemo(() => {
    return data?.records.filter((r) => r.note.toLowerCase().includes("terlambat")).length ?? 0;
  }, [data]);

  const onTimeCount = Math.max(0, totalEmployees - lateCount);
  const inRatioPercent = totalScans > 0 ? Math.round((Math.max(inScansCount, totalEmployees) / Math.max(totalScans, 1)) * 100) : 68;

  return (
    <main className="public-attendance-page">
      {/* Top Header Navigation Bar */}
      <header className="public-attendance-header">
        <div className="public-attendance-brand-group">
          <div className="public-attendance-brand" aria-label="AbsenKita">
            <span className="public-attendance-brand-mark" aria-hidden="true">A</span>
            <div>
              <strong>ABSENKITA</strong>
              <small>Layar absensi karyawan</small>
            </div>
          </div>

          {/* ID Card / Fingerprint Line-art Badge */}
          <div className="public-attendance-idbadge" title="ID Card & Mesin Pemindai Aktif">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <circle cx="8" cy="11" r="3" />
              <path d="M14 9h4" />
              <path d="M14 13h4" />
              <path d="M5 18a3 3 0 0 1 6 0" />
            </svg>
            <div className="idbadge-lines">
              <span />
              <span />
            </div>
          </div>
        </div>

        {/* Location Indicator with Live Status */}
        <div className="public-attendance-site">
          <span className="public-attendance-pin-icon" aria-hidden="true">📍</span>
          <div>
            <div className="site-row">
              <small>Lokasi</small>
              <span className={`public-attendance-dot is-${connectionState}`} aria-hidden="true" />
              <span className="site-online-tag">{connectionState === "online" ? "Online" : "Offline"}</span>
            </div>
            <strong>{data?.siteName ?? "Site Sangatta"}</strong>
          </div>
        </div>

        {/* Analog/Digital Live Clock */}
        <div className="public-attendance-clock" aria-live="off">
          <div className="clock-time-row">
            <span className="clock-icon" aria-hidden="true">🕒</span>
            <strong>
              {now ? new Intl.DateTimeFormat("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZone: DISPLAY_TIME_ZONE
              }).format(now).replaceAll(".", ":") : "00:00:00"}
            </strong>
          </div>
          <span className="clock-date-row">
            <span className="cal-icon" aria-hidden="true">📅</span>
            {now ? formatLongDate(now) : "Memuat tanggal"} · WITA
          </span>
        </div>
      </header>

      <div className="public-attendance-content">
        {/* =========================================================================
            LEFT COLUMN: SCAN TERBARU (HERO CARD)
           ========================================================================= */}
        <section className="public-attendance-latest" aria-live="polite">
          {/* Header Ribbon */}
          <div className="public-attendance-section-label">
            <div className="section-label-left">
              <span className="soundwave-icon" aria-hidden="true">
                <span className="bar b1" />
                <span className="bar b2" />
                <span className="bar b3" />
                <span className="bar b4" />
              </span>
              <span>SCAN TERBARU</span>
            </div>
            <div className="section-label-right">
              <span className="pulse-beacon" />
              <strong>DATA LANGSUNG ↗</strong>
            </div>
          </div>

          {connectionState === "loading" && !data ? (
            <div className="public-attendance-main-state">
              <span className="public-attendance-state-mark">•••</span>
              <h1>Menghubungkan ke mesin absensi</h1>
              <p>Data scan akan tampil otomatis di layar ini.</p>
            </div>
          ) : connectionState === "offline" && !data ? (
            <div className="public-attendance-main-state is-error" role="alert">
              <span className="public-attendance-state-mark">!</span>
              <h1>Layar belum terhubung</h1>
              <p>Periksa koneksi layanan absensi. Layar akan mencoba kembali secara otomatis.</p>
            </div>
          ) : latest ? (
            <div className="public-attendance-person" key={`${latest.employeeName}-${latest.recordedAt}`}>
              {/* Employee Avatar Circle */}
              <div
                className="public-attendance-avatar"
                style={{ backgroundColor: getAvatarColor(latest.employeeName) }}
                aria-hidden="true"
              >
                <img
                  src="/assets/avatar_hero.jpg"
                  alt={latest.employeeName}
                  className="hero-avatar-img"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="avatar-ring" />
                <span className="avatar-initials">{initials(latest.employeeName)}</span>
              </div>

              {/* Employee Data */}
              <div className="public-attendance-person-copy">
                {/* Success Banner */}
                <div className={`public-attendance-success is-${latest.eventType.toLowerCase()}`}>
                  <span className="success-star-ico">⭐</span>
                  <span className="success-check-ico">✓</span>
                  <div className="success-text-box">
                    <strong>{eventMessage(latest.eventType)}</strong>
                    <small>{eventSubMessage(latest.eventType)}</small>
                  </div>
                </div>

                {/* Big Employee Name */}
                <h1 className="hero-employee-name">{latest.employeeName}</h1>

                {/* Division & Note Badges */}
                <div className="hero-meta-badges">
                  <div className="hero-badge-pill badge-dept">
                    <span className="pill-tag">DIVISI</span>
                    <strong className="pill-val">
                      {getDepartmentIcon(latest.departmentName)} {latest.departmentName ?? "Umum"}
                    </strong>
                  </div>

                  <div className={`hero-badge-pill badge-note is-${latest.tone}`}>
                    <span className="pill-tag">KETERANGAN</span>
                    <strong className="pill-val">{latest.note}</strong>
                  </div>
                </div>
              </div>

              {/* Digital Time Stopwatch Box */}
              <div className={`public-attendance-scan-time is-${latest.eventType.toLowerCase()}`}>
                <div className="stopwatch-header">
                  <span className="stopwatch-icon" aria-hidden="true">⏱️</span>
                  <small>WAKTU {eventLabel(latest.eventType).toUpperCase()}</small>
                </div>
                <strong className="digital-clock-face">{formatScanTime(latest.recordedAt)}</strong>
                <span className="timezone-tag">WITA</span>
              </div>
            </div>
          ) : (
            <div className="public-attendance-main-state">
              <span className="public-attendance-state-mark">✓</span>
              <h1>Siap menerima scan</h1>
              <p>Belum ada aktivitas absensi hari ini. Tempelkan jari pada perangkat untuk memulai.</p>
            </div>
          )}

          {/* Bottom Scanner Sensor Bar */}
          <div className="public-attendance-confirmation">
            <div className="scanner-action-group">
              <div className="fingerprint-scan-pad" aria-hidden="true">
                <div className="fingerprint-ring ring-1" />
                <div className="fingerprint-ring ring-2" />
                <svg className="fingerprint-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                  <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                  <path d="M2 12a10 10 0 0 1 18-6" />
                  <path d="M2 16a14 14 0 0 0 19-3" />
                  <path d="M20 19c-.5-1-1.5-2.5-3-3" />
                  <path d="M6 10a6 6 0 0 1 11.5-2.5" />
                  <path d="M6 14.5c0 1.5.5 3.5 1.5 5.5" />
                  <path d="M9 18c.5.5 1.5 1 3 1" />
                </svg>
              </div>
              <div className="scanner-text-group">
                <strong>Tempelkan jari pada perangkat</strong>
                <small>Untuk melakukan absensi masuk / pulang</small>
              </div>
            </div>

            <div className="scanner-info-hint">
              <span className="info-circle-ico">ℹ️</span>
              <span>Nama dan waktu scan akan muncul setelah data diterima sistem.</span>
            </div>
          </div>
        </section>

        {/* =========================================================================
            RIGHT COLUMN: RINGKASAN HARI INI
           ========================================================================= */}
        <aside className="public-attendance-today" aria-label="Ringkasan hari ini">
          {/* Header Bar */}
          <div className="public-attendance-today-heading">
            <div className="today-header-left">
              <span className="today-cal-ico">📅</span>
              <span>HARI INI</span>
            </div>
            <strong>
              {data?.date ? new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: DISPLAY_TIME_ZONE
              }).format(new Date(`${data.date}T00:00:00+08:00`)).toUpperCase() : "HARI INI"}
            </strong>
          </div>

          {/* Metric Card 1: Karyawan Hadir */}
          <div className="public-attendance-metric is-primary">
            <div className="metric-header-row">
              <div className="metric-title-group">
                <span className="metric-icon">👥</span>
                <span className="metric-label">Karyawan hadir</span>
              </div>
              <Link href="/absensi" className="metric-detail-link">Lihat detail →</Link>
            </div>

            <div className="metric-value-row">
              <div className="metric-number-box">
                <strong className="metric-big-num">{totalEmployees}</strong>
                <span className="metric-sub-text">orang sudah melakukan scan</span>
              </div>

              {/* Team Illustration Graphic */}
              <div className="metric-graphic team-graphic" aria-hidden="true">
                <img
                  src="/assets/team_graphic.jpg"
                  alt="Tim Karyawan"
                  className="metric-img-asset"
                />
              </div>
            </div>

            {/* Attendance Progress Bar */}
            <div className="metric-progress-wrapper">
              <div className="metric-progress-bar">
                <div className="metric-progress-fill" style={{ width: "97%" }} />
              </div>
              <div className="metric-breakdown-row">
                <span className="bd-item is-ontime">🟢 <strong>{onTimeCount}</strong> Tepat waktu</span>
                <span className="bd-item is-late">🟡 <strong>{lateCount}</strong> Terlambat</span>
                <span className="bd-item is-absent">🔴 <strong>0</strong> Tidak hadir</span>
              </div>
            </div>
          </div>

          {/* Metric Card 2: Total Aktivitas Scan */}
          <div className="public-attendance-metric">
            <div className="metric-header-row">
              <div className="metric-title-group">
                <span className="metric-icon">📊</span>
                <span className="metric-label">Total aktivitas</span>
              </div>
              <Link href="/absensi" className="metric-detail-link">Lihat detail →</Link>
            </div>

            <div className="metric-value-row">
              <div className="metric-number-box">
                <strong className="metric-big-num">{totalScans}</strong>
                <span className="metric-sub-text">scan tersimpan hari ini</span>
              </div>

              {/* Bar Chart Illustration Graphic */}
              <div className="metric-graphic chart-graphic" aria-hidden="true">
                <img
                  src="/assets/chart_graphic.jpg"
                  alt="Grafik Pertumbuhan"
                  className="metric-img-asset"
                />
              </div>
            </div>

            {/* Split Progress Bar (Masuk vs Pulang) */}
            <div className="metric-progress-wrapper">
              <div className="metric-split-bar">
                <div className="split-fill is-in" style={{ width: `${inRatioPercent}%` }} />
                <div className="split-fill is-out" style={{ width: `${100 - inRatioPercent}%` }} />
              </div>
              <div className="metric-breakdown-row">
                <span className="bd-item is-in-scan">🟢 <strong>{totalEmployees}</strong> Masuk</span>
                <span className="bd-item is-out-scan">🔵 <strong>{Math.max(0, totalScans - totalEmployees)}</strong> Pulang</span>
              </div>
            </div>
          </div>

          {/* Metric Card 3: Status Koneksi & Server */}
          <div className="public-attendance-sync">
            <div className="sync-info-group">
              <div className="sync-status-row">
                <span className={`public-attendance-dot is-${connectionState}`} aria-hidden="true" />
                <strong>
                  {connectionState === "online" ? "Sistem terhubung" : connectionState === "offline" ? "Mencoba menghubungkan" : "Memeriksa koneksi"}
                </strong>
                <span className="server-status-pill">{connectionState === "online" ? "Server Online" : "Reconnecting"}</span>
              </div>
              <small>Diperbarui otomatis setiap 5 detik</small>
            </div>

            {/* Cloud Server Graphic */}
            <div className="sync-graphic" aria-hidden="true">
              <img
                src="/assets/server_graphic.jpg"
                alt="Server Cloud"
                className="metric-img-asset server-img-asset"
              />
            </div>
          </div>
        </aside>

        {/* =========================================================================
            BOTTOM SECTION: SCAN SEBELUMNYA (2-COLUMN HIGH-IMPACT GRID)
           ========================================================================= */}
        <section className="public-attendance-recent">
          <div className="public-attendance-recent-heading">
            <div className="recent-heading-left">
              <span className="recent-clock-icon" aria-hidden="true">⏱️</span>
              <div>
                <span className="recent-eyebrow">AKTIVITAS HARI INI</span>
                <h2>Scan sebelumnya</h2>
              </div>
            </div>

            <div className="recent-heading-right">
              <Link href="/absensi" className="view-all-link">
                Lihat semua aktivitas →
              </Link>
            </div>
          </div>

          {recent.length > 0 ? (
            <ol className="public-attendance-list">
              {recent.map((record, index) => {
                const isIn = record.eventType === "IN";
                const isLate = record.note.toLowerCase().includes("terlambat");

                return (
                  <li key={`${record.employeeName}-${record.recordedAt}-${index}`} className="recent-scan-item">
                    {/* Index Number */}
                    <span className="public-attendance-list-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    {/* Avatar with dynamic department tone */}
                    <div
                      className="public-attendance-list-avatar"
                      style={{ backgroundColor: getAvatarColor(record.employeeName) }}
                      aria-hidden="true"
                    >
                      {initials(record.employeeName)}
                    </div>

                    {/* Employee & Division Info */}
                    <div className="public-attendance-list-name">
                      <strong className="recent-emp-name">{record.employeeName}</strong>
                      <span className="recent-dept-tag">
                        Divisi: {record.departmentName ?? "Umum"} {getDepartmentIcon(record.departmentName)}
                      </span>
                    </div>

                    {/* Recorded Digital Time */}
                    <time dateTime={record.recordedAt} className="recent-scan-time">
                      {formatScanTime(record.recordedAt)}
                    </time>

                    {/* Status Badge with Action Icon */}
                    <div className={`public-attendance-list-status ${isIn ? (isLate ? "is-late" : "is-in") : "is-out"}`}>
                      <div className="status-badge-header">
                        <span className="status-badge-type">{eventLabel(record.eventType).toUpperCase()}</span>
                        <span className="status-badge-icon" aria-hidden="true">
                          {isIn ? (isLate ? "⚠️" : "💡") : "🏠"}
                        </span>
                      </div>
                      <small className="status-badge-note">{record.note}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="public-attendance-empty-list">
              <span className="empty-ico">📋</span>
              <p>Aktivitas scan berikutnya akan tersusun otomatis di sini.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
