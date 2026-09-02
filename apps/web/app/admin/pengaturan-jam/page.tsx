import { PageHeader } from "../../components/page-header";
import { StatusBadge, type AttendanceTone } from "../../components/status-badge";

export const metadata = { title: "Pengaturan jam" };

const scheduleTemplates: Array<{
  code: string;
  name: string;
  detail: string;
  days: string;
  tone: AttendanceTone;
}> = [
  { code: "STEADY_DAY", name: "Steady day", detail: "08:00 - 17:00", days: "Senin - Jumat", tone: "pending" },
  { code: "SHIFT_MORNING", name: "Shift pagi", detail: "07:00 - 15:00", days: "Mengikuti roster", tone: "on-time" },
  { code: "SHIFT_NIGHT", name: "Shift malam", detail: "19:00 - 07:00", days: "Lintas hari", tone: "overtime" }
];

export default function TimeSettingsPage() {
  return (
    <>
      <PageHeader
        title="Pengaturan jam kerja"
        description="Template ini menjadi dasar perhitungan masuk, keluar, terlambat, pulang cepat, dan lembur."
      />
      <div className="notice">
        <strong>Steady day berbeda dari shift pagi</strong>
        <span>Steady day adalah pola reguler tetap. Shift pagi merupakan jadwal bergilir yang ditentukan roster.</span>
      </div>
      <section className="settings-layout">
        <div className="panel">
          <div className="panel-heading"><div><h2>Template kerja</h2><p>Pratinjau nilai awal yang akan dapat diedit admin.</p></div></div>
          <div className="template-list">
            {scheduleTemplates.map((template) => (
              <article className="template-row" key={template.code}>
                <div>
                  <code>{template.code}</code>
                  <h3>{template.name}</h3>
                </div>
                <div><span>Jam kerja</span><strong className="numeric-cell">{template.detail}</strong></div>
                <div><span>Penerapan</span><strong>{template.days}</strong></div>
                <StatusBadge tone={template.tone}>Draft</StatusBadge>
              </article>
            ))}
          </div>
        </div>
        <aside className="panel rules-panel">
          <div className="panel-heading"><div><h2>Aturan perhitungan</h2><p>Nilai ditetapkan pada milestone rules engine.</p></div></div>
          <dl className="definition-list">
            <div><dt>Toleransi terlambat</dt><dd>Belum diatur</dd></div>
            <div><dt>Minimal lembur</dt><dd>Belum diatur</dd></div>
            <div><dt>Batas scan ganda</dt><dd>Belum diatur</dd></div>
            <div><dt>Zona waktu</dt><dd>Asia/Makassar</dd></div>
          </dl>
        </aside>
      </section>
    </>
  );
}
