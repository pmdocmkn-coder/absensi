import type { AttendanceTone } from "./status-badge";

export type DailyAttendance = {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  attendanceDate: string;
  autoStatus: string;
  status: string;
  confirmationState: "AUTO" | "CONFIRMED";
  checkInAt: string | null;
  checkOutAt: string | null;
  lastScanAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduleCode: string | null;
  scheduleName: string | null;
  scanCount: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  hasOnCall: boolean;
  notes: string[];
  confirmationNote: string | null;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
  confirmedByEmployeeId?: number | null;
};

export const attendanceStatuses = ["PRESENT", "LATE", "OVERTIME", "ON_CALL", "OFF", "LEAVE", "ABSENT", "NEEDS_REVIEW"];

export function attendanceLabel(status: string) {
  return ({
    PRESENT: "Hadir tepat waktu",
    LATE: "Terlambat",
    OVERTIME: "Lembur",
    ON_CALL: "On-call",
    OFF: "Jadwal off",
    LEAVE: "Sedang cuti",
    ABSENT: "Alfa",
    PENDING: "Menunggu scan",
    NEEDS_REVIEW: "Perlu ditinjau",
    NO_SCHEDULE: "Belum ada jadwal"
  } as Record<string, string>)[status] ?? status;
}

export function attendanceTone(status: string): AttendanceTone {
  return ({
    PRESENT: "on-time",
    LATE: "late",
    OVERTIME: "overtime",
    ON_CALL: "on-call",
    OFF: "off",
    LEAVE: "leave",
    ABSENT: "danger",
    NEEDS_REVIEW: "pending",
    PENDING: "pending",
    NO_SCHEDULE: "pending"
  } as Record<string, AttendanceTone>)[status] ?? "pending";
}

export function witaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function shortTime(value: string | null) {
  return value?.slice(11, 16) ?? "Belum ada";
}

export function formatScanTime(value: string | null) {
  return value?.slice(11, 19) ?? "Belum ada";
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

const AVATAR_COLORS = [
  "#1e3a8a", // navy
  "#047857", // emerald
  "#b45309", // amber
  "#6d28d9", // purple
  "#be185d", // pink
  "#0f766e", // teal
  "#374151"  // dark gray
];

export function getAvatarColor(identifier: string) {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

export function formatScheduleDisplay(record: Pick<DailyAttendance, "status" | "scheduleCode" | "scheduleName" | "scheduledStartAt" | "scheduledEndAt">) {
  if (record.status === "OFF") return "OFF (Jadwal Libur Shift)";
  if (record.status === "ON_CALL") return "OFF (Reguler) -> Siaga On-Call";
  if (record.status === "LEAVE") return "OFF (Sedang Cuti)";
  
  if (record.scheduledStartAt && record.scheduledEndAt) {
    const start = shortTime(record.scheduledStartAt);
    const end = shortTime(record.scheduledEndAt);
    const label = record.scheduleName ? ` (${record.scheduleName})` : "";
    return `${start} - ${end}${label}`;
  }

  if (record.scheduleName) return record.scheduleName;
  if (record.scheduleCode) return record.scheduleCode;
  return "Belum ada jadwal";
}

export function getInformativeNote(record: Pick<DailyAttendance, "status" | "lateMinutes" | "overtimeMinutes" | "checkInAt" | "checkOutAt" | "notes">): string {
  // Sedang Cuti requirement: "Sedang Cuti. gitu aja keteranganya"
  if (record.status === "LEAVE") return "Sedang Cuti";

  if (record.status === "OFF") return "Libur Roster Reguler";
  if (record.status === "ON_CALL") return "Auto-Detect Finger: Tap di luar jadwal reguler";

  if (record.status === "LATE") {
    return record.lateMinutes > 0 ? `Terlambat ${record.lateMinutes} menit` : "Terlambat";
  }

  if (record.status === "OVERTIME") {
    return record.overtimeMinutes > 0 ? `Lembur disetujui (+${record.overtimeMinutes} menit)` : "Lembur disetujui";
  }

  if (record.status === "PRESENT") {
    if (record.checkInAt && record.checkOutAt) return "Sudah Tap Masuk & Pulang";
    return "Tepat Waktu";
  }

  if (record.status === "ABSENT") return "Belum melakukan tap sidik jari";
  if (record.status === "PENDING") return "Jadwal shift siang (Menunggu Jam Masuk)";

  if (record.notes[0]) return record.notes[0];
  return "Perlu verifikasi data";
}

export function attendanceReason(record: Pick<DailyAttendance, "status" | "checkInAt" | "checkOutAt" | "scheduleCode" | "notes">) {
  if (record.status === "LEAVE") return "Sedang Cuti";
  if (record.notes[0]) return record.notes[0];
  if (!record.scheduleCode) return "Belum ada roster atau profil kerja";
  if (record.checkOutAt && !record.checkInAt) return "Tidak absen masuk";
  if (record.checkInAt && !record.checkOutAt) return record.status === "PENDING" ? "Menunggu absen pulang" : "Tidak absen pulang";
  if (record.checkInAt && record.checkOutAt) return "Sudah Tap Masuk & Pulang";
  if (record.status === "OFF") return "Libur Roster Reguler";
  if (record.status === "PENDING") return "Menunggu absen masuk";
  if (record.status === "ABSENT") return "Belum melakukan tap sidik jari";
  return "Tidak ada scan absensi";
}

export function attendanceReasonDetails(record: Pick<DailyAttendance, "notes" | "scanCount" | "confirmationState" | "confirmationNote">) {
  const details = [...record.notes.slice(1), `${record.scanCount} scan X105`];
  details.push(record.confirmationState === "CONFIRMED" ? "Dikonfirmasi admin" : "Evaluasi otomatis");
  if (record.confirmationNote) details.push(`Catatan admin: ${record.confirmationNote}`);
  return details.join(" · ");
}

export function formatAuditTime(isoString?: string | null) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hours}:${minutes} WITA`;
  } catch {
    return isoString;
  }
}

export function getAnomalyBadge(record: Pick<DailyAttendance, "autoStatus" | "notes" | "scheduleCode">) {
  const notesText = record.notes.join(" ").toLowerCase();
  if (notesText.includes("cuti") || notesText.includes("off")) {
    return { label: "Scan di Hari Off/Cuti", icon: "⚠️", tone: "off" as AttendanceTone };
  }
  if (!record.scheduleCode || notesText.includes("tanpa jadwal") || record.autoStatus === "NO_SCHEDULE") {
    return { label: "Tanpa Jadwal Kerja", icon: "❓", tone: "pending" as AttendanceTone };
  }
  if (notesText.includes("tidak absen pulang")) {
    return { label: "Tidak Absen Pulang", icon: "⏱️", tone: "late" as AttendanceTone };
  }
  if (notesText.includes("tidak absen masuk")) {
    return { label: "Tidak Absen Masuk", icon: "❌", tone: "danger" as AttendanceTone };
  }
  if (record.autoStatus === "LATE") {
    return { label: "Terlambat", icon: "⏰", tone: "late" as AttendanceTone };
  }
  return null;
}

export function isUnverifiedEmployee(employee: {
  employeeName?: string;
  name?: string;
  employeeCode: string;
}): boolean {
  const name = (employee.employeeName ?? employee.name ?? "").trim();
  const code = employee.employeeCode.trim();
  if (!name || name === code) return true;
  if (/^\d+$/.test(name)) return true;
  if (/^id\s*\d+$/i.test(name)) return true;
  if (/^pin\s*\d+$/i.test(name)) return true;
  return false;
}


