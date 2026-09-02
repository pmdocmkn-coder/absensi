import { PageHeader } from "../../components/page-header";
import { StatusBadge, type AttendanceTone } from "../../components/status-badge";

export const metadata = { title: "Kalender roster" };

const days = [
  { day: "Sen", date: "31", outside: true },
  { day: "Sel", date: "1" },
  { day: "Rab", date: "2", current: true },
  { day: "Kam", date: "3" },
  { day: "Jum", date: "4" },
  { day: "Sab", date: "5" },
  { day: "Min", date: "6" }
];

const rosterRows: Array<{
  name: string;
  department: string;
  schedules: Array<{ label: string; tone: AttendanceTone }>;
}> = [
  {
    name: "Andi Prakoso",
    department: "Produksi",
    schedules: [
      { label: "Shift pagi", tone: "on-time" }, { label: "Shift pagi", tone: "on-time" },
      { label: "Shift pagi", tone: "on-time" }, { label: "Shift pagi", tone: "on-time" },
      { label: "Shift pagi", tone: "on-time" }, { label: "Off", tone: "off" }, { label: "Off", tone: "off" }
    ]
  },
  {
    name: "Lestari Ayuningtyas",
    department: "Keuangan",
    schedules: [
      { label: "Steady day", tone: "pending" }, { label: "Steady day", tone: "pending" },
      { label: "Steady day", tone: "pending" }, { label: "Cuti", tone: "leave" },
      { label: "Cuti", tone: "leave" }, { label: "Off", tone: "off" }, { label: "Off", tone: "off" }
    ]
  },
  {
    name: "Bayu Firmansyah",
    department: "Maintenance",
    schedules: [
      { label: "Shift malam", tone: "overtime" }, { label: "On-call", tone: "on-call" },
      { label: "Shift malam", tone: "overtime" }, { label: "Shift malam", tone: "overtime" },
      { label: "On-call", tone: "on-call" }, { label: "Off", tone: "off" }, { label: "Off", tone: "off" }
    ]
  }
];

export default function RosterPage() {
  return (
    <>
      <PageHeader
        title="Kalender roster terpadu"
        description="Satu tampilan untuk steady day, shift, cuti, on-call, lembur, dan jadwal off."
      />
      <div className="notice">
        <strong>Pratinjau desain</strong>
        <span>Jadwal di bawah adalah contoh. Penyimpanan dan pengeditan dibangun pada milestone domain jadwal.</span>
      </div>
      <section className="panel roster-panel">
        <div className="panel-heading">
          <div><h2>31 Agustus - 6 September 2026</h2><p>Site Sangatta</p></div>
          <div className="legend">
            <StatusBadge tone="pending">Steady day</StatusBadge>
            <StatusBadge tone="on-call">On-call</StatusBadge>
            <StatusBadge tone="leave">Cuti</StatusBadge>
            <StatusBadge tone="off">Off</StatusBadge>
          </div>
        </div>
        <div className="roster-scroll">
          <div className="roster-grid roster-header-row">
            <div className="roster-employee-column">Karyawan</div>
            {days.map((day) => (
              <div className={`${day.current ? "roster-current" : ""}${day.outside ? " roster-outside" : ""}`} key={`${day.day}-${day.date}`}>
                <span>{day.day}</span><strong>{day.date}</strong>
              </div>
            ))}
          </div>
          {rosterRows.map((row) => (
            <div className="roster-grid roster-data-row" key={row.name}>
              <div className="roster-employee-column"><strong>{row.name}</strong><span>{row.department}</span></div>
              {row.schedules.map((schedule, index) => (
                <div className={days[index]?.current ? "roster-current" : ""} key={`${row.name}-${index}`}>
                  <StatusBadge tone={schedule.tone}>{schedule.label}</StatusBadge>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
