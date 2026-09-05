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
              {/* Employee Avatar Circle with Monogram Initials */}
              <div
                className="public-attendance-avatar"
                style={{ backgroundColor: getAvatarColor(latest.employeeName) }}
                aria-hidden="true"
              >
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

              {/* Handcrafted Neo-Industrial Vector Team Illustration */}
              <div className="metric-graphic team-graphic" aria-hidden="true">
                <svg width="112" height="74" viewBox="0 0 112 74" fill="none" xmlns="http://www.w3.org/2000/svg" className="metric-svg-team">
                  {/* Left Person: Female Specialist (Teal Blazer) */}
                  <g>
                    <path d="M6 72c0-12 8-20 20-20h6c12 0 20 8 20 20" fill="#0d9488" stroke="#0f172a" strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M29 52v20" stroke="#0f172a" strokeWidth="1.8" />
                    <polygon points="29,52 24,62 34,62" fill="#ffffff" stroke="#0f172a" strokeWidth="1.4" />
                    <rect x="26" y="38" width="6" height="7" fill="#fed7aa" stroke="#0f172a" strokeWidth="1.6" />
                    <circle cx="29" cy="26" r="12" fill="#fed7aa" stroke="#0f172a" strokeWidth="2.2" />
                    <path d="M18 24c0-7 5-12 11-12s11 5 11 12c-1 3-3 4-11 4s-10-1-11-4z" fill="#0f172a" />
                    <path d="M17 26c1 5 4 9 6 10" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
                    <circle cx="25.5" cy="25" r="1.3" fill="#0f172a" />
                    <circle cx="32.5" cy="25" r="1.3" fill="#0f172a" />
                    <path d="M27 30c1 1 3 1 4 0" stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round" />
                  </g>

                  {/* Right Person: Operations / Engineer (Amber Jacket) */}
                  <g>
                    <path d="M60 72c0-12 8-20 20-20h6c12 0 20 8 20 20" fill="#ea580c" stroke="#0f172a" strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M83 52v20" stroke="#0f172a" strokeWidth="1.8" />
                    <polygon points="83,52 78,62 88,62" fill="#ffffff" stroke="#0f172a" strokeWidth="1.4" />
                    <rect x="80" y="38" width="6" height="7" fill="#fed7aa" stroke="#0f172a" strokeWidth="1.6" />
                    <circle cx="83" cy="26" r="12" fill="#fed7aa" stroke="#0f172a" strokeWidth="2.2" />
                    <path d="M72 22c0-6 5-11 11-11s11 5 11 11c-1 2-3 3-11 3s-10-1-11-3z" fill="#78350f" />
                    <path d="M77 29c1.5 3.5 4.5 5.5 6 5.5s4.5-2 6-5.5" fill="#78350f" stroke="#0f172a" strokeWidth="1.4" />
                    <circle cx="79.5" cy="25" r="1.3" fill="#0f172a" />
                    <circle cx="86.5" cy="25" r="1.3" fill="#0f172a" />
                  </g>

                  {/* Center Person: Executive Director (Navy Suit with Red Tie) */}
                  <g>
                    <path d="M30 74c0-13 10-22 26-22s26 9 26 22" fill="#1e293b" stroke="#0f172a" strokeWidth="2.4" strokeLinejoin="round" />
                    <polygon points="56,52 48,64 64,64" fill="#ffffff" stroke="#0f172a" strokeWidth="1.6" />
                    <polygon points="56,55 52,68 56,73 60,68" fill="#dc2626" stroke="#0f172a" strokeWidth="1.4" />
                    <line x1="53" y1="65" x2="59" y2="65" stroke="#facc15" strokeWidth="1.2" />
                    <rect x="52.5" y="36" width="7" height="8" fill="#fed7aa" stroke="#0f172a" strokeWidth="1.6" />
                    <circle cx="56" cy="22" r="14" fill="#fed7aa" stroke="#0f172a" strokeWidth="2.4" />
                    <path d="M43 19c0-8 6-14 13-14s13 6 13 14c-2 2-4 3-13 3s-11-1-13-3z" fill="#0f172a" />
                    <path d="M42 20c2-5 7-9 14-9" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="51.5" cy="21" r="1.5" fill="#0f172a" />
                    <circle cx="60.5" cy="21" r="1.5" fill="#0f172a" />
                    <path d="M53 27c1.5 1.4 4.5 1.4 6 0" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                </svg>
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

              {/* Handcrafted Neo-Industrial Vector Chart Illustration */}
              <div className="metric-graphic chart-graphic" aria-hidden="true">
                <svg width="104" height="70" viewBox="0 0 104 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="metric-svg-chart">
                  <line x1="6" y1="48" x2="98" y2="48" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="6" y1="30" x2="98" y2="30" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="6" y1="12" x2="98" y2="12" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="4" y1="64" x2="100" y2="64" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Vertical Bars with 3D Gloss Sheen */}
                  <rect x="10" y="44" width="14" height="20" rx="3" fill="#93c5fd" stroke="#0f172a" strokeWidth="2" />
                  <line x1="14" y1="48" x2="14" y2="59" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

                  <rect x="32" y="30" width="14" height="34" rx="3" fill="#3b82f6" stroke="#0f172a" strokeWidth="2" />
                  <line x1="36" y1="34" x2="36" y2="59" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

                  <rect x="54" y="36" width="14" height="28" rx="3" fill="#facc15" stroke="#0f172a" strokeWidth="2" />
                  <line x1="58" y1="40" x2="58" y2="59" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

                  <rect x="76" y="18" width="14" height="46" rx="3" fill="#10b981" stroke="#0f172a" strokeWidth="2" />
                  <line x1="80" y1="22" x2="80" y2="59" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

                  {/* Smooth Dynamic Trend Arrow Line */}
                  <path d="M8 44 C 22 40, 26 26, 40 24 C 52 22, 64 30, 74 18 L 92 8" stroke="#059669" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M79 8 H92 V21" stroke="#059669" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="8" cy="44" r="2.8" fill="#ffffff" stroke="#059669" strokeWidth="2.2" />
                  <circle cx="39" cy="24" r="2.8" fill="#ffffff" stroke="#059669" strokeWidth="2.2" />
                  <circle cx="68" cy="24" r="2.8" fill="#ffffff" stroke="#059669" strokeWidth="2.2" />
                  <circle cx="92" cy="8" r="3.4" fill="#10b981" stroke="#0f172a" strokeWidth="2.2" />
                </svg>
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

            {/* Handcrafted Vector Cloud Server Graphic */}
            <div className="sync-graphic" aria-hidden="true">
              <svg width="56" height="42" viewBox="0 0 56 42" fill="none" xmlns="http://www.w3.org/2000/svg" className="metric-svg-server">
                <path d="M15 30h26a9 9 0 0 0 2.5-17.6 11.5 11.5 0 0 0-22.5-2.8A8 8 0 0 0 15 30z" fill="#f1f5f9" stroke="#0f172a" strokeWidth="2.2" strokeLinejoin="round" />
                <rect x="13" y="24" width="30" height="14" rx="3" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
                <line x1="13" y1="31" x2="43" y2="31" stroke="#0f172a" strokeWidth="1.5" />
                <circle cx="18" cy="27.5" r="1.8" fill="#22c55e" />
                <circle cx="23" cy="27.5" r="1.8" fill="#3b82f6" />
                <line x1="30" y1="27.5" x2="38" y2="27.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="18" cy="34.5" r="1.8" fill="#22c55e" />
                <circle cx="23" cy="34.5" r="1.8" fill="#f59e0b" />
                <line x1="30" y1="34.5" x2="38" y2="34.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
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
