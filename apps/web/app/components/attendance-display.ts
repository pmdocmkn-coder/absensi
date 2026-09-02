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
