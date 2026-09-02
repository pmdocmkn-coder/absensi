"use client";

import { useEffect, useState } from "react";
import { Metric } from "./metric";
import { StatusBadge, type AttendanceTone } from "./status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type DailyAttendance = {
  autoStatus: string; status: string; confirmationState: "AUTO" | "CONFIRMED";
  checkInAt: string | null; checkOutAt: string | null; scheduledStartAt: string | null;
  lateMinutes: number; overtimeMinutes: number; hasOnCall: boolean; notes: string[];
};

function witaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function time(value: string | null) { return value ? value.slice(11, 16) : "—"; }
function label(status: string) {
  return ({ PRESENT: "Hadir tepat waktu", LATE: "Terlambat", OVERTIME: "Lembur", ON_CALL: "On-call", OFF: "Jadwal off", LEAVE: "Sedang cuti", ABSENT: "Alfa", PENDING: "Menunggu scan", NEEDS_REVIEW: "Perlu ditinjau", NO_SCHEDULE: "Belum ada jadwal" } as Record<string, string>)[status] ?? status;
}
function tone(status: string): AttendanceTone {
  return ({ PRESENT: "on-time", LATE: "late", OVERTIME: "overtime", ON_CALL: "on-call", OFF: "off", LEAVE: "leave", ABSENT: "danger", NEEDS_REVIEW: "pending", PENDING: "pending", NO_SCHEDULE: "pending" } as Record<string, AttendanceTone>)[status] ?? "pending";
}

export function TodayAttendance() {
  const [record, setRecord] = useState<DailyAttendance | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const date = witaDate();
    void fetch(`${API_URL}/api/attendance/daily?from=${date}&to=${date}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { records?: DailyAttendance[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menghitung absensi hari ini");
        setRecord(payload.records?.[0] ?? null);
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Gagal menghitung absensi hari ini"));
  }, []);
  const status = record?.status ?? "PENDING";
  return <>
    <section className="metric-grid" aria-label="Ringkasan hari ini">
      <Metric label="Status hari ini" value={label(status)} note={record?.confirmationState === "CONFIRMED" ? "Dikonfirmasi admin" : "Dihitung otomatis"} emphasis />
      <Metric label="Waktu masuk" value={time(record?.checkInAt ?? null)} note={record?.lateMinutes ? `Terlambat ${record.lateMinutes} menit` : "Scan pertama"} />
      <Metric label="Waktu keluar" value={time(record?.checkOutAt ?? null)} note={record?.overtimeMinutes ? `Estimasi lembur ${record.overtimeMinutes} menit` : "Scan terakhir"} />
      <Metric label="Jadwal" value={record?.scheduledStartAt ? time(record.scheduledStartAt) : "—"} note={record?.hasOnCall ? "On-call aktif" : "Mengikuti roster/profil"} />
    </section>
    <section className="panel today-panel">
      <div className="panel-heading"><div><h2>Evaluasi absensi hari ini</h2><p>Status dari roster/profil kerja dan scan X105.</p></div><StatusBadge tone={tone(status)}>{label(status)}</StatusBadge></div>
      {error ? <div className="notice notice-error"><strong>Belum dapat dihitung</strong><span>{error}</span></div> : null}
      {!error && <dl className="definition-list"><div><dt>Keterangan</dt><dd>{record?.notes.join(" · ") || "Menunggu data jadwal atau scan"}</dd></div><div><dt>Sumber</dt><dd>{record?.confirmationState === "CONFIRMED" ? "Konfirmasi admin" : "Aturan otomatis"}</dd></div></dl>}
    </section>
  </>;
}
