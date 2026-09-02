export type AttendanceTone =
  | "on-time"
  | "late"
  | "off"
  | "leave"
  | "on-call"
  | "overtime"
  | "pending"
  | "danger";

export function StatusBadge({ tone, children }: { tone: AttendanceTone; children: React.ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
