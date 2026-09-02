"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../../components/page-header";
import { StatusBadge, type AttendanceTone } from "../../components/status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Template = {
  id: string;
  code: string;
  name: string;
  kind: "REGULAR" | "ON_CALL" | "OVERTIME";
  startTime: string;
  endTime: string;
  graceMinutes: number;
  crossesMidnight: boolean;
  isActive: boolean;
};

function toneFor(template: Template): AttendanceTone {
  if (!template.isActive) return "off";
  if (template.kind === "ON_CALL") return "on-call";
  if (template.kind === "OVERTIME") return "overtime";
  return "on-time";
}

export default function TimeSettingsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/schedule-templates`, { credentials: "include", cache: "no-store" });
      const payload = await response.json() as { records?: Template[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengambil template kerja");
      setTemplates(payload.records ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengambil template kerja");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/api/schedule-templates`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          kind: form.get("kind"),
          startTime: form.get("startTime"),
          endTime: form.get("endTime"),
          graceMinutes: Number(form.get("graceMinutes") || 0),
          crossesMidnight: form.get("crossesMidnight") === "on"
        })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal membuat template");
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal membuat template");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Pengaturan jam kerja"
        description="Template adalah sumber aturan masuk, keluar, terlambat, pulang cepat, dan lembur. Nilai dapat diubah admin tanpa mengubah data mesin."
      />
      <div className="notice">
        <strong>Steady day berbeda dari shift pagi</strong>
        <span>Gunakan template reguler tersendiri untuk steady day. Shift pagi dan shift malam dibuat sebagai template berbeda lalu dipilih pada roster.</span>
      </div>
      <section className="settings-layout">
        <div className="panel">
          <div className="panel-heading"><div><h2>Template kerja</h2><p>Aktifkan hanya template yang boleh dipilih pada kalender roster.</p></div></div>
          {loading ? <div className="feedback-state"><strong>Memuat template...</strong></div> : null}
          {!loading && templates.length === 0 ? <div className="feedback-state"><strong>Belum ada template kerja.</strong><p>Buat Steady Day, Shift Pagi, dan Shift Malam sesuai kebijakan perusahaan.</p></div> : null}
          <div className="template-list">
            {templates.map((template) => (
              <article className="template-row" key={template.id}>
                <div><code>{template.code}</code><h3>{template.name}</h3></div>
                <div><span>Jam kerja</span><strong className="numeric-cell">{template.startTime} - {template.endTime}</strong></div>
                <div><span>Toleransi</span><strong>{template.graceMinutes} menit{template.crossesMidnight ? ", lintas hari" : ""}</strong></div>
                <StatusBadge tone={toneFor(template)}>{template.isActive ? template.kind : "NONAKTIF"}</StatusBadge>
              </article>
            ))}
          </div>
        </div>
        <aside className="panel rules-panel">
          <div className="panel-heading"><div><h2>Tambah template</h2><p>Nilai awal dapat disesuaikan kemudian.</p></div></div>
          <form className="compact-form" onSubmit={submit}>
            <label className="form-field"><span>Kode</span><input name="code" placeholder="STEADY_DAY" required maxLength={40} /></label>
            <label className="form-field"><span>Nama</span><input name="name" placeholder="Steady Day" required maxLength={120} /></label>
            <label className="form-field"><span>Jenis</span><select name="kind" defaultValue="REGULAR"><option value="REGULAR">Reguler</option><option value="ON_CALL">On-call</option><option value="OVERTIME">Lembur</option></select></label>
            <div className="form-two-column">
              <label className="form-field"><span>Mulai</span><input name="startTime" type="time" required /></label>
              <label className="form-field"><span>Selesai</span><input name="endTime" type="time" required /></label>
            </div>
            <label className="form-field"><span>Toleransi terlambat</span><input name="graceMinutes" type="number" min="0" max="240" defaultValue="0" required /></label>
            <label className="check-field"><input name="crossesMidnight" type="checkbox" /><span>Jadwal selesai hari berikutnya</span></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "MENYIMPAN..." : "SIMPAN TEMPLATE"}</button>
          </form>
        </aside>
      </section>
    </>
  );
}
