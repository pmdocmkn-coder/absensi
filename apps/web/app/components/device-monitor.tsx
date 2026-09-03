"use client";

import { useEffect, useMemo, useState } from "react";
import { Metric } from "./metric";
import { StatusBadge } from "./status-badge";

type DeviceEvent = {
  id: string;
  receivedAt: string;
  deviceSerial: string | null;
  employeeCode: string | null;
  employeeName?: string | null;
  recordedAt: string | null;
  attendanceStatus: number | null;
  verificationType: number | null;
  source: string;
  method: string;
  path: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

function formatReceivedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Makassar"
  }).format(new Date(value));
}

export function DeviceMonitor() {
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let activeController: AbortController | null = null;
    const load = async () => {
      activeController?.abort();
      activeController = new AbortController();
      try {
        const response = await fetch(`${API_URL}/api/events?limit=50`, {
          credentials: "include",
          cache: "no-store",
          signal: activeController.signal
        });
        if (!response.ok) throw new Error("Receiver tidak tersedia");
        const data = (await response.json()) as { events: DeviceEvent[] };
        setEvents(data.events);
        setConnected(true);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setConnected(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 2_000);
    return () => {
      activeController?.abort();
      window.clearInterval(timer);
    };
  }, []);

  const deviceCount = useMemo(
    () => new Set(events.map((event) => event.deviceSerial).filter(Boolean)).size,
    [events]
  );

  return (
    <>
      <div className="monitor-status-line">
        <StatusBadge tone={connected === false ? "danger" : connected ? "on-time" : "pending"}>
          {connected === null ? "Memeriksa receiver" : connected ? "Receiver online" : "Receiver offline"}
        </StatusBadge>
        <code>{API_URL}</code>
      </div>

      <section className="metric-grid metric-grid-compact" aria-label="Status receiver">
        <Metric label="Aktivitas sesi" value={String(events.length)} note="Maksimal 50 baris terbaru" emphasis />
        <Metric label="Perangkat terdeteksi" value={String(deviceCount)} note="Berdasarkan aktivitas sesi" />
        <Metric label="Interval monitor" value="2 detik" note="Polling diagnostik" />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Aktivitas perangkat</h2>
            <p>Payload ADMS terbaru tampil paling atas.</p>
          </div>
          <code>GET /api/events</code>
        </div>
        {connected === false ? (
          <div className="feedback-state feedback-error" role="alert">
            <strong>Receiver tidak dapat dijangkau.</strong>
            <p>Jalankan API Bun lalu periksa port 8080.</p>
          </div>
        ) : events.length === 0 ? (
          <div className="feedback-state">
            <strong>Belum ada aktivitas dalam sesi API ini.</strong>
            <p>Scan di X105 tetap tersimpan di database meski tabel monitor kosong.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Diterima</th><th>Perangkat</th><th>ID</th><th>Nama</th><th>Waktu mesin</th><th>Request</th><th>Sumber</th></tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="numeric-cell">{formatReceivedAt(event.receivedAt)}</td>
                    <td><code>{event.deviceSerial ?? "-"}</code></td>
                    <td>{event.employeeCode ?? "-"}</td>
                    <td>{event.employeeName ?? "Belum dipetakan"}</td>
                    <td className="numeric-cell">{event.recordedAt ?? "-"}</td>
                    <td><code>{event.method} {event.path}</code></td>
                    <td><StatusBadge tone="on-time">{event.source}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
