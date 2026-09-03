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

type AttendanceSettings = {
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  overtimeBufferMinutes: number;
};

function toneFor(template: Template): AttendanceTone {
  if (!template.isActive) return "off";
  if (template.kind === "ON_CALL") return "on-call";
  if (template.kind === "OVERTIME") return "overtime";
  return "on-time";
}

type WorkSchedule = {
  grossHours: number;
  netHours: number;
  breakHours: number;
  breakTime: string;
  netLabel: string;
  grossLabel: string;
  hasBreak: boolean;
};

function calculateWorkSchedule(startTime: string, endTime: string, crossesMidnight: boolean): WorkSchedule {
  if (!startTime || !endTime) {
    return {
      grossHours: 0,
      netHours: 0,
      breakHours: 0,
      breakTime: "",
      netLabel: "—",
      grossLabel: "—",
      hasBreak: false
    };
  }

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
  if (crossesMidnight || totalMinutes < 0) totalMinutes += 24 * 60;

  const grossHours = totalMinutes / 60;
  const grossH = Math.floor(totalMinutes / 60);
  const grossM = totalMinutes % 60;
  const grossLabel = grossM > 0 ? `${grossH}j ${grossM}m` : `${grossH} Jam`;

  // Ketentuan: Jadwal shift penuh (>= 5 jam) memiliki 1 jam istirahat (ishoma).
  // Siang: 12:00 - 13:00, Malam: 00:00 - 01:00.
  const hasBreak = grossHours >= 5;
  const breakMinutes = hasBreak ? 60 : 0;
  const netMinutes = totalMinutes - breakMinutes;

  const netH = Math.floor(netMinutes / 60);
  const netM = netMinutes % 60;
  const netLabel = netM > 0 ? `${netH}j ${netM}m Kerja` : `${netH} Jam Kerja`;

  let breakTime = "";
  if (hasBreak) {
    breakTime = crossesMidnight ? "00:00 - 01:00" : "12:00 - 13:00";
  }

  return {
    grossHours,
    netHours: netMinutes / 60,
    breakHours: breakMinutes / 60,
    breakTime,
    netLabel,
    grossLabel,
    hasBreak
  };
}

export default function TimeSettingsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings>({
    lateToleranceMinutes: 15,
    earlyLeaveToleranceMinutes: 0,
    overtimeBufferMinutes: 15
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [isGlobalRulesOpen, setIsGlobalRulesOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Draft states for forms
  const [draftSettings, setDraftSettings] = useState<AttendanceSettings>({
    lateToleranceMinutes: 15,
    earlyLeaveToleranceMinutes: 0,
    overtimeBufferMinutes: 15
  });

  const [templateForm, setTemplateForm] = useState({
    code: "",
    name: "",
    kind: "REGULAR" as "REGULAR" | "ON_CALL" | "OVERTIME",
    startTime: "08:00",
    endTime: "17:00",
    crossesMidnight: false,
    isActive: true
  });

  const load = async () => {
    setLoading(true);
    try {
      const [response, settingsResponse] = await Promise.all([
        fetch(`${API_URL}/api/schedule-templates?includeInactive=true`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/api/attendance-settings`, { credentials: "include", cache: "no-store" })
      ]);
      const [payload, settingsPayload] = await Promise.all([
        response.json() as Promise<{ records?: Template[]; error?: { message?: string } }>,
        settingsResponse.json() as Promise<AttendanceSettings & { error?: { message?: string } }>
      ]);
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengambil template kerja");
      if (!settingsResponse.ok) throw new Error(settingsPayload.error?.message ?? "Gagal mengambil aturan absensi global");
      setTemplates(payload.records ?? []);
      setAttendanceSettings(settingsPayload);
      setDraftSettings(settingsPayload);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengambil template kerja");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openGlobalRules = () => {
    setDraftSettings(attendanceSettings);
    setError("");
    setIsGlobalRulesOpen(true);
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      code: "",
      name: "",
      kind: "REGULAR",
      startTime: "08:00",
      endTime: "17:00",
      crossesMidnight: false,
      isActive: true
    });
    setError("");
    setIsTemplateModalOpen(true);
  };

  const openEditTemplate = (tmpl: Template) => {
    setEditingTemplate(tmpl);
    setTemplateForm({
      code: tmpl.code,
      name: tmpl.name,
      kind: tmpl.kind,
      startTime: tmpl.startTime,
      endTime: tmpl.endTime,
      crossesMidnight: tmpl.crossesMidnight,
      isActive: tmpl.isActive
    });
    setError("");
    setIsTemplateModalOpen(true);
  };

  const saveAttendanceSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/attendance-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftSettings)
      });
      const payload = await response.json() as AttendanceSettings & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan aturan absensi global");
      setAttendanceSettings(payload);
      setNotice("Aturan absensi global berhasil diperbarui.");
      setIsGlobalRulesOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan aturan absensi global");
    } finally {
      setSubmitting(false);
    }
  };

  const saveTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const url = editingTemplate
        ? `${API_URL}/api/schedule-templates/${editingTemplate.id}`
        : `${API_URL}/api/schedule-templates`;
      const method = editingTemplate ? "PATCH" : "POST";

      const body = editingTemplate
        ? {
            name: templateForm.name,
            kind: templateForm.kind,
            startTime: templateForm.startTime,
            endTime: templateForm.endTime,
            crossesMidnight: templateForm.crossesMidnight,
            isActive: templateForm.isActive
          }
        : {
            code: templateForm.code.trim().toUpperCase().replace(/\s+/g, "_"),
            name: templateForm.name.trim(),
            kind: templateForm.kind,
            startTime: templateForm.startTime,
            endTime: templateForm.endTime,
            crossesMidnight: templateForm.crossesMidnight
          };

      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan template jadwal");

      setNotice(editingTemplate ? `Template ${templateForm.name} berhasil diperbarui.` : `Template ${templateForm.name} berhasil ditambahkan.`);
      setIsTemplateModalOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan template jadwal");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (template: Template) => {
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/schedule-templates/${template.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengubah status template");

      setNotice(`Status template ${template.name} diubah menjadi ${!template.isActive ? "Aktif" : "Nonaktif"}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengubah status template");
    }
  };

  const activeCount = templates.filter((t) => t.isActive).length;

  return (
    <>
      <PageHeader
        title="Pengaturan jam kerja"
        description="Kelola template jam kerja dan toleransi absensi otomatis untuk seluruh jadwal dan roster."
        action={
          <div className="time-settings-header-actions">
            <button className="secondary-button" type="button" onClick={openGlobalRules}>
              ⚙️ Aturan Absensi Global
            </button>
            <button className="primary-button" type="button" onClick={openCreateTemplate}>
              + Tambah Template
            </button>
          </div>
        }
      />

      {notice ? (
        <div className="notice notice-success" role="status">
          <strong>Sukses</strong>
          <span>{notice}</span>
          <button type="button" className="notice-dismiss" onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}

      {error ? (
        <div className="notice notice-error" role="alert">
          <strong>Perhatian</strong>
          <span>{error}</span>
          <button type="button" className="notice-dismiss" onClick={() => setError("")}>×</button>
        </div>
      ) : null}

      <div className="notice notice-info">
        <strong>Ketentuan Perhitungan Jam Kerja & Istirahat (1 Jam)</strong>
        <span>
          Pada jadwal kerja penuh (seperti Steady Day, Drill 08:00 - 17:00, Shift Pagi 06:00 - 18:00, dan Shift Malam 18:00 - 06:00), terdapat potongan <strong>1 jam istirahat</strong> (pukul 12:00 - 13:00 untuk shift siang, atau pukul 00:00 - 01:00 untuk shift malam). Sehingga total dihitung sebagai <strong>jam kerja bersih (efektif)</strong>.
        </span>
      </div>

      {/* Overview Metric Cards */}
      <section className="time-rules-summary" aria-label="Ringkasan toleransi dan template">
        <div className="time-rule-card">
          <span className="rule-card-label">Total Template</span>
          <strong className="rule-card-value">{templates.length} <small>Template</small></strong>
          <span className="rule-card-desc">{activeCount} template aktif digunakan</span>
        </div>

        <div className="time-rule-card clickable-card" onClick={openGlobalRules} role="button" tabIndex={0} title="Klik untuk mengubah aturan global">
          <div className="rule-card-header">
            <span className="rule-card-label">Toleransi Terlambat</span>
            <span className="rule-card-action">Ubah ↗</span>
          </div>
          <strong className="rule-card-value">{attendanceSettings.lateToleranceMinutes} <small>Menit</small></strong>
          <span className="rule-card-desc">Scan masuk dalam batas ini tetap tepat waktu</span>
        </div>

        <div className="time-rule-card clickable-card" onClick={openGlobalRules} role="button" tabIndex={0} title="Klik untuk mengubah aturan global">
          <div className="rule-card-header">
            <span className="rule-card-label">Toleransi Pulang Cepat</span>
            <span className="rule-card-action">Ubah ↗</span>
          </div>
          <strong className="rule-card-value">{attendanceSettings.earlyLeaveToleranceMinutes} <small>Menit</small></strong>
          <span className="rule-card-desc">Pulang sebelum jadwal dalam batas ini ditolerir</span>
        </div>

        <div className="time-rule-card clickable-card" onClick={openGlobalRules} role="button" tabIndex={0} title="Klik untuk mengubah aturan global">
          <div className="rule-card-header">
            <span className="rule-card-label">Buffer Lembur</span>
            <span className="rule-card-action">Ubah ↗</span>
          </div>
          <strong className="rule-card-value">{attendanceSettings.overtimeBufferMinutes} <small>Menit</small></strong>
          <span className="rule-card-desc">Scan keluar setelah batas ini mulai dihitung lembur</span>
        </div>
      </section>

      {/* Main Full-Width Template Table Panel */}
      <section className="panel time-templates-panel">
        <div className="panel-heading">
          <div>
            <h2>Daftar Template Jam Kerja</h2>
            <p>Template jadwal aktif dapat dipilih pada kalender roster dan penugasan harian karyawan.</p>
          </div>
          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => void load()}>
              MUAT ULANG
            </button>
          </div>
        </div>

        {loading ? (
          <div className="table-skeleton" aria-label="Memuat template">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
        ) : null}

        {!loading && templates.length === 0 ? (
          <div className="feedback-state">
            <strong>Belum ada template kerja.</strong>
            <p>Buat template pertama seperti Steady Day, Shift Pagi, atau Shift Malam.</p>
            <button className="primary-button" type="button" onClick={openCreateTemplate}>
              + Tambah Template Sekarang
            </button>
          </div>
        ) : null}

        {!loading && templates.length > 0 ? (
          <div className="table-wrap">
            <table className="time-template-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Template</th>
                  <th>Jam Kerja</th>
                  <th>Sifat Jadwal</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className={template.isActive ? "" : "is-template-inactive"}>
                    <td>
                      <code className="template-code-badge">{template.code}</code>
                    </td>
                    <td>
                      <strong className="template-name-title">{template.name}</strong>
                    </td>
                    <td>
                      {(() => {
                        const sched = calculateWorkSchedule(template.startTime, template.endTime, template.crossesMidnight);
                        return (
                          <div className="template-time-cell">
                            <div className="template-time-range">
                              <strong className="time-chip time-in">{template.startTime}</strong>
                              <span className="time-arrow">s/d</span>
                              <strong className="time-chip time-out">{template.endTime}</strong>
                            </div>
                            <span className="template-net-pill" title={sched.hasBreak ? `Jam kerja efektif: ${sched.netLabel} (sudah dipotong 1 jam istirahat)` : `Jam kerja: ${sched.netLabel}`}>
                              {sched.netLabel}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {template.crossesMidnight ? (
                        <span className="schedule-nature nature-night" title="Jadwal selesai keesokan hari">
                          🌙 Lintas Hari
                        </span>
                      ) : (
                        <span className="schedule-nature nature-day" title="Jadwal selesai pada hari yang sama">
                          ☀️ Hari yang Sama
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`template-toggle-pill ${template.isActive ? "is-active" : "is-inactive"}`}
                        onClick={() => void toggleActive(template)}
                        title={`Klik untuk ${template.isActive ? "menonaktifkan" : "mengaktifkan"} template`}
                      >
                        {template.isActive ? "● AKTIF" : "○ NONAKTIF"}
                      </button>
                    </td>
                    <td>
                      <div className="template-row-actions">
                        <button
                          type="button"
                          className="secondary-button table-action-btn"
                          onClick={() => openEditTemplate(template)}
                        >
                          Ubah
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Modal 1: Aturan Absensi Global */}
      {isGlobalRulesOpen ? (
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setIsGlobalRulesOpen(false)}>
          <div
            className="settings-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-rules-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <span className="settings-modal-eyebrow">PENGATURAN SISTEM</span>
                <h2 id="global-rules-title">Aturan Absensi Global</h2>
                <p>Toleransi ini berlaku ke seluruh template jam kerja dan kalender roster absensi X105.</p>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Tutup modal"
                onClick={() => setIsGlobalRulesOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveAttendanceSettings}>
              <div className="settings-modal-body">
                <label className="form-field">
                  <span className="field-title">Toleransi Terlambat</span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={draftSettings.lateToleranceMinutes}
                      onChange={(e) => setDraftSettings((curr) => ({ ...curr, lateToleranceMinutes: Number(e.target.value) }))}
                      required
                    />
                    <span>menit</span>
                  </div>
                  <small className="field-hint">Scan masuk dalam batas menit ini tetap dihitung hadir tepat waktu.</small>
                </label>

                <label className="form-field">
                  <span className="field-title">Toleransi Pulang Cepat</span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={draftSettings.earlyLeaveToleranceMinutes}
                      onChange={(e) => setDraftSettings((curr) => ({ ...curr, earlyLeaveToleranceMinutes: Number(e.target.value) }))}
                      required
                    />
                    <span>menit</span>
                  </div>
                  <small className="field-hint">Selisih kepulangan sebelum jam selesai dalam batas ini tidak dicatat sebagai pulang cepat.</small>
                </label>

                <label className="form-field">
                  <span className="field-title">Buffer Lembur</span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={draftSettings.overtimeBufferMinutes}
                      onChange={(e) => setDraftSettings((curr) => ({ ...curr, overtimeBufferMinutes: Number(e.target.value) }))}
                      required
                    />
                    <span>menit</span>
                  </div>
                  <small className="field-hint">Scan keluar setelah jadwal selesai ditambah buffer ini baru mulai dihitung sebagai estimasi lembur.</small>
                </label>

                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </div>

              <div className="settings-modal-footer">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setIsGlobalRulesOpen(false)}
                  disabled={submitting}
                >
                  BATAL
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "MENYIMPAN..." : "SIMPAN ATURAN GLOBAL"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal 2: Tambah / Edit Template Kerja */}
      {isTemplateModalOpen ? (
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setIsTemplateModalOpen(false)}>
          <div
            className="settings-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div>
                <span className="settings-modal-eyebrow">TEMPLATE JADWAL KERJA</span>
                <h2 id="template-modal-title">
                  {editingTemplate ? "Edit Template Jam Kerja" : "Tambah Template Jam Kerja"}
                </h2>
                <p>
                  {editingTemplate
                    ? `Perbarui parameter jadwal kerja untuk template ${editingTemplate.name}.`
                    : "Buat pola jam kerja baru yang dapat dipetakan pada kalender roster."}
                </p>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Tutup modal"
                onClick={() => setIsTemplateModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveTemplate}>
              <div className="settings-modal-body">
                <div className="form-two-column">
                  <label className="form-field">
                    <span className="field-title">Kode Template</span>
                    <input
                      value={templateForm.code}
                      onChange={(e) => setTemplateForm((curr) => ({ ...curr, code: e.target.value }))}
                      placeholder="SHIFT_SORE"
                      required
                      maxLength={40}
                      disabled={Boolean(editingTemplate)}
                    />
                    <small className="field-hint">
                      {editingTemplate ? "Kode unik template tidak dapat diubah." : "Huruf besar & garis bawah (contoh: SHIFT_PAGI)."}
                    </small>
                  </label>

                  <label className="form-field">
                    <span className="field-title">Nama Template</span>
                    <input
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm((curr) => ({ ...curr, name: e.target.value }))}
                      placeholder="Shift Sore"
                      required
                      maxLength={120}
                    />
                    <small className="field-hint">Nama yang tampil di roster dan laporan.</small>
                  </label>
                </div>

                <label className="form-field">
                  <span className="field-title">Jenis Jadwal</span>
                  <select
                    value={templateForm.kind}
                    onChange={(e) => setTemplateForm((curr) => ({ ...curr, kind: e.target.value as any }))}
                  >
                    <option value="REGULAR">Reguler (Standar)</option>
                    <option value="ON_CALL">On-call (Panggilan Khusus)</option>
                    <option value="OVERTIME">Lembur</option>
                  </select>
                </label>

                <div className="form-two-column">
                  <label className="form-field">
                    <span className="field-title">Jam Mulai Masuk</span>
                    <input
                      type="time"
                      value={templateForm.startTime}
                      onChange={(e) => setTemplateForm((curr) => ({ ...curr, startTime: e.target.value }))}
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-title">Jam Selesai Pulang</span>
                    <input
                      type="time"
                      value={templateForm.endTime}
                      onChange={(e) => setTemplateForm((curr) => ({ ...curr, endTime: e.target.value }))}
                      required
                    />
                  </label>
                </div>

                {(() => {
                  const sched = calculateWorkSchedule(templateForm.startTime, templateForm.endTime, templateForm.crossesMidnight);
                  return (
                    <div className="template-preview-calc">
                      <div className="preview-calc-row">
                        <span>Total Rentang Waktu:</span>
                        <strong>{sched.grossLabel} ({templateForm.startTime} - {templateForm.endTime})</strong>
                      </div>
                      <div className="preview-calc-row">
                        <span>Potongan Istirahat (1 Jam):</span>
                        <strong className={sched.hasBreak ? "break-text" : ""}>
                          {sched.hasBreak ? `1 Jam (${sched.breakTime})` : "0 Jam (Tanpa Istirahat)"}
                        </strong>
                      </div>
                      <div className="preview-calc-row preview-calc-net">
                        <span>Jam Kerja Efektif (Bersih):</span>
                        <strong className="net-text">⚡ {sched.netLabel}</strong>
                      </div>
                    </div>
                  );
                })()}

                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={templateForm.crossesMidnight}
                    onChange={(e) => setTemplateForm((curr) => ({ ...curr, crossesMidnight: e.target.checked }))}
                  />
                  <span>
                    <strong>Jadwal selesai keesokan hari (Lintas Hari)</strong>
                    <small>Centang untuk shift malam (misal: 18:00 malam s/d 06:00 pagi berikutnya).</small>
                  </span>
                </label>

                {editingTemplate ? (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={templateForm.isActive}
                      onChange={(e) => setTemplateForm((curr) => ({ ...curr, isActive: e.target.checked }))}
                    />
                    <span>
                      <strong>Status Template Aktif</strong>
                      <small>Template aktif dapat dipilih pada kalender roster.</small>
                    </span>
                  </label>
                ) : null}

                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </div>

              <div className="settings-modal-footer">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  disabled={submitting}
                >
                  BATAL
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "MENYIMPAN..." : editingTemplate ? "SIMPAN PERUBAHAN" : "BUAT TEMPLATE"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
