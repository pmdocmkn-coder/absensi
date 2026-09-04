"use client";

import { useEffect, useMemo, useState } from "react";

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
  return "Scan berhasil diterima";
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

  return (
    <main className="public-attendance-page">
      <header className="public-attendance-header">
        <div className="public-attendance-brand" aria-label="AbsenKita">
          <span className="public-attendance-brand-mark" aria-hidden="true">A</span>
          <span>
            <strong>ABSENKITA</strong>
            <small>Layar absensi karyawan</small>
          </span>
        </div>

        <div className="public-attendance-site">
          <span className={`public-attendance-dot is-${connectionState}`} aria-hidden="true" />
          <span>
            <small>Lokasi</small>
            <strong>{data?.siteName ?? "Site Sangatta"}</strong>
          </span>
        </div>

        <div className="public-attendance-clock" aria-live="off">
          <strong>{now ? new Intl.DateTimeFormat("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: DISPLAY_TIME_ZONE
          }).format(now).replaceAll(".", ":") : "00:00:00"}</strong>
          <span>{now ? formatLongDate(now) : "Memuat tanggal"} · WITA</span>
        </div>
      </header>

      <div className="public-attendance-content">
        <section className="public-attendance-latest" aria-live="polite">
          <div className="public-attendance-section-label">
            <span>Scan terbaru</span>
            <strong>{connectionState === "offline" ? "Koneksi terputus" : "Data langsung"}</strong>
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
              <div className="public-attendance-avatar" aria-hidden="true">{initials(latest.employeeName)}</div>
              <div className="public-attendance-person-copy">
                <span className={`public-attendance-success is-${latest.eventType.toLowerCase()}`}>
                  ✓ {eventMessage(latest.eventType)}
                </span>
                <h1>{latest.employeeName}</h1>
                <p className="public-attendance-division">
                  <span>Divisi</span>
                  <strong>{latest.departmentName ?? "Belum dipetakan"}</strong>
                </p>
                <div className={`public-attendance-result is-${latest.tone}`}>
                  <span>Keterangan</span>
                  <strong>{latest.note}</strong>
                </div>
              </div>
              <div className={`public-attendance-scan-time is-${latest.eventType.toLowerCase()}`}>
                <small>Waktu {eventLabel(latest.eventType).toLowerCase()}</small>
                <strong>{formatScanTime(latest.recordedAt)}</strong>
                <span>WITA</span>
              </div>
            </div>
          ) : (
            <div className="public-attendance-main-state">
              <span className="public-attendance-state-mark">✓</span>
              <h1>Siap menerima scan</h1>
              <p>Belum ada aktivitas absensi hari ini.</p>
            </div>
          )}

          <div className="public-attendance-confirmation">
            <strong>Tempelkan jari pada perangkat</strong>
            <span>Nama dan waktu scan akan muncul setelah data diterima sistem.</span>
          </div>
        </section>

        <aside className="public-attendance-today" aria-label="Ringkasan hari ini">
          <div className="public-attendance-today-heading">
            <span>Hari ini</span>
            <strong>{data?.date ? new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "short",
              timeZone: DISPLAY_TIME_ZONE
            }).format(new Date(`${data.date}T00:00:00+08:00`)) : ""}</strong>
          </div>
          <div className="public-attendance-metric is-primary">
            <span>Karyawan tercatat</span>
            <strong>{data?.summary.totalEmployees ?? 0}</strong>
            <small>orang sudah melakukan scan</small>
          </div>
          <div className="public-attendance-metric">
            <span>Total aktivitas</span>
            <strong>{data?.summary.totalScans ?? 0}</strong>
            <small>scan tersimpan hari ini</small>
          </div>
          <div className="public-attendance-sync">
            <span className={`public-attendance-dot is-${connectionState}`} aria-hidden="true" />
            <span>
              <strong>{connectionState === "online" ? "Sistem terhubung" : connectionState === "offline" ? "Mencoba menghubungkan" : "Memeriksa koneksi"}</strong>
              <small>Diperbarui otomatis setiap 5 detik</small>
            </span>
          </div>
        </aside>

        <section className="public-attendance-recent">
          <div className="public-attendance-recent-heading">
            <div>
              <span>Aktivitas hari ini</span>
              <h2>Scan sebelumnya</h2>
            </div>
            <small>Informasi sensitif tidak ditampilkan</small>
          </div>
          {recent.length > 0 ? (
            <ol className="public-attendance-list">
              {recent.map((record, index) => (
                <li key={`${record.employeeName}-${record.recordedAt}-${index}`}>
                  <span className="public-attendance-list-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="public-attendance-list-avatar" aria-hidden="true">{initials(record.employeeName)}</span>
                  <span className="public-attendance-list-name">
                    <strong>{record.employeeName}</strong>
                    <small>Divisi: {record.departmentName ?? "Belum dipetakan"}</small>
                  </span>
                  <time dateTime={record.recordedAt}>{formatScanTime(record.recordedAt)}</time>
                  <span className={`public-attendance-list-status is-${record.tone}`}>
                    <strong>{eventLabel(record.eventType)}</strong>
                    <small>{record.note}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="public-attendance-empty-list">
              Aktivitas berikutnya akan tersusun di sini.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
