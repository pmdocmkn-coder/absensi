"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./status-badge";

type AttendanceRecord = {
  id: number;
  deviceSerial: string;
  employeeCode: string;
  employeeName: string | null;
  departmentName: string | null;
  recordedAt: string;
  receivedAt: string;
};

type AttendanceResponse = {
  count: number;
  records: AttendanceRecord[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function formatDeviceTime(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? value
    : `${value.replace(" ", "T")}+08:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar"
  }).format(parsed);
}

export function LiveAttendance({ limit = 8, compact = false }: { limit?: number; compact?: boolean }) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/attendance?limit=${limit}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("API tidak tersedia");
        setData((await response.json()) as AttendanceResponse);
        setError(false);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
      }
    };

    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [limit]);

  if (error) {
    return (
      <div className="feedback-state feedback-error" role="alert">
        <strong>Data absensi belum terhubung.</strong>
        <p>Pastikan API Bun berjalan di {API_URL}.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="table-skeleton" aria-label="Memuat data absensi">
        {Array.from({ length: compact ? 4 : 7 }).map((_, index) => <span key={index} />)}
      </div>
    );
  }

  if (data.records.length === 0) {
    return (
      <div className="feedback-state">
        <strong>Belum ada scan tersimpan.</strong>
        <p>Lakukan scan di X105 atau jalankan simulator.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nama karyawan</th>
            <th>Departemen</th>
            <th>Waktu scan</th>
            <th>Status terkini</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {data.records.map((record) => (
            <tr key={record.id}>
              <td>
                <strong className="table-primary">{record.employeeName ?? `ID ${record.employeeCode}`}</strong>
                <small className="table-secondary">PIN {record.employeeCode}</small>
              </td>
              <td>{record.departmentName ?? <span className="muted-value">Belum dipetakan</span>}</td>
              <td className="numeric-cell">{formatDeviceTime(record.recordedAt)}</td>
              <td><StatusBadge tone="pending">Menunggu aturan</StatusBadge></td>
              <td><span className="muted-value">Raw log X105</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
