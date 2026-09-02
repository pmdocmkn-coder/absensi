import { asc, eq } from "drizzle-orm";
import { db, sqlite } from "../db/connection";
import { employeeScheduleProfiles, employees, scheduleTemplates, type AttendanceAutoStatus, type AttendanceConfirmedStatus } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";

type ProfileInput = {
  employeeId: number;
  scheduleTemplateId: string;
  workdays: number[];
  autoWeekendOvertime?: boolean;
  overtimeBufferMinutes?: number;
};

type Template = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  crossesMidnight: number;
};

type RosterEntry = {
  assignmentType: "REGULAR" | "OFF" | "LEAVE" | "ON_CALL" | "OVERTIME";
  notes: string | null;
  templateId: string | null;
  templateCode: string | null;
  templateName: string | null;
  startTime: string | null;
  endTime: string | null;
  graceMinutes: number | null;
  crossesMidnight: number | null;
};

type Scan = { recordedAt: string };

export type DailyAttendance = {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  attendanceDate: string;
  autoStatus: AttendanceAutoStatus;
  status: AttendanceAutoStatus | AttendanceConfirmedStatus;
  confirmationState: "AUTO" | "CONFIRMED";
  checkInAt: string | null;
  checkOutAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  hasOnCall: boolean;
  notes: string[];
  confirmationNote: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALL_STATUSES: AttendanceConfirmedStatus[] = ["PRESENT", "LATE", "OVERTIME", "ON_CALL", "OFF", "LEAVE", "ABSENT", "NEEDS_REVIEW"];

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) throw new ValidationError("Tanggal harus memakai format YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError("Tanggal tidak valid");
  }
  return value;
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function dayOfWeek(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function minutes(time: string) {
  const [hours, minute] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minute ?? 0);
}

function scanMinutes(recordedAt: string) {
  return minutes(recordedAt.slice(11, 16));
}

function durationMinutes(start: string, end: string, crossesMidnight: boolean) {
  const result = minutes(end) - minutes(start) + (crossesMidnight ? 1440 : 0);
  return Math.max(result, 0);
}

function parseWorkdays(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) return parsed as number[];
  } catch {
    // Invalid legacy profile values fall back to weekdays.
  }
  return [1, 2, 3, 4, 5];
}

function profileRow(employeeId: number) {
  return sqlite.query<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    departmentName: string | null;
    workdaysJson: string | null;
    autoWeekendOvertime: number | null;
    overtimeBufferMinutes: number | null;
    templateId: string | null;
    templateCode: string | null;
    templateName: string | null;
    startTime: string | null;
    endTime: string | null;
    graceMinutes: number | null;
    crossesMidnight: number | null;
  }, [number]>(`
    SELECT
      employee.id AS employeeId,
      employee.employee_code AS employeeCode,
      employee.name AS employeeName,
      department.name AS departmentName,
      profile.workdays_json AS workdaysJson,
      profile.auto_weekend_overtime AS autoWeekendOvertime,
      profile.overtime_buffer_minutes AS overtimeBufferMinutes,
      template.id AS templateId,
      template.code AS templateCode,
      template.name AS templateName,
      template.start_time AS startTime,
      template.end_time AS endTime,
      template.grace_minutes AS graceMinutes,
      template.crosses_midnight AS crossesMidnight
    FROM employees AS employee
    LEFT JOIN departments AS department ON department.id = employee.department_id
    LEFT JOIN employee_schedule_profiles AS profile ON profile.employee_id = employee.id
    LEFT JOIN schedule_templates AS template ON template.id = profile.schedule_template_id
    WHERE employee.id = ? AND employee.is_active = 1
  `).get(employeeId) ?? null;
}

function rosterFor(employeeId: number, date: string) {
  return sqlite.query<RosterEntry, [number, string]>(`
    SELECT
      roster.assignment_type AS assignmentType,
      roster.notes AS notes,
      template.id AS templateId,
      template.code AS templateCode,
      template.name AS templateName,
      template.start_time AS startTime,
      template.end_time AS endTime,
      template.grace_minutes AS graceMinutes,
      template.crosses_midnight AS crossesMidnight
    FROM roster_assignments AS roster
    LEFT JOIN schedule_templates AS template ON template.id = roster.schedule_template_id
    WHERE roster.employee_id = ? AND roster.assignment_date = ?
  `).all(employeeId, date);
}

function scansFor(employeeId: number, date: string, crossesMidnight: boolean) {
  // A night shift ends the following morning.  Do not include the next
  // evening's check-in as this employee's check-out for the previous shift.
  const until = crossesMidnight ? `${addDays(date, 1)} 12:00:00` : `${addDays(date, 1)} 00:00:00`;
  return sqlite.query<Scan, [number, string, string]>(`
    SELECT attendance.recorded_at AS recordedAt
    FROM attendance_logs AS attendance
    JOIN device_users AS device_user
      ON device_user.device_serial = attendance.device_serial
      AND device_user.device_user_code = attendance.employee_code
    WHERE device_user.employee_id = ?
      AND attendance.recorded_at >= ?
      AND attendance.recorded_at < ?
    ORDER BY attendance.recorded_at ASC
  `).all(employeeId, `${date} 00:00:00`, until);
}

function evaluationRecord(employeeId: number, date: string) {
  return sqlite.query<{
    confirmedStatus: AttendanceConfirmedStatus | null;
    confirmationNote: string | null;
  }, [number, string]>(`
    SELECT confirmed_status AS confirmedStatus, confirmation_note AS confirmationNote
    FROM attendance_evaluations
    WHERE employee_id = ? AND attendance_date = ?
  `).get(employeeId, date) ?? null;
}

function persistAutoEvaluation(record: Omit<DailyAttendance, "status" | "confirmationState" | "confirmationNote">) {
  sqlite.prepare(`
    INSERT INTO attendance_evaluations (
      employee_id, attendance_date, auto_status, check_in_at, check_out_at,
      scheduled_start_at, scheduled_end_at, late_minutes, overtime_minutes,
      detail_json, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, attendance_date) DO UPDATE SET
      auto_status = excluded.auto_status,
      check_in_at = excluded.check_in_at,
      check_out_at = excluded.check_out_at,
      scheduled_start_at = excluded.scheduled_start_at,
      scheduled_end_at = excluded.scheduled_end_at,
      late_minutes = excluded.late_minutes,
      overtime_minutes = excluded.overtime_minutes,
      detail_json = excluded.detail_json,
      generated_at = excluded.generated_at
  `).run(
    record.employeeId,
    record.attendanceDate,
    record.autoStatus,
    record.checkInAt,
    record.checkOutAt,
    record.scheduledStartAt,
    record.scheduledEndAt,
    record.lateMinutes,
    record.overtimeMinutes,
    JSON.stringify({ hasOnCall: record.hasOnCall, notes: record.notes }),
    new Date().toISOString()
  );
}

function dateHasEnded(date: string, endTime: string, crossesMidnight: boolean) {
  const endDate = crossesMidnight ? addDays(date, 1) : date;
  return new Date() >= new Date(`${endDate}T${endTime}:00+08:00`);
}

export function evaluateEmployeeDay(employeeId: number, attendanceDateInput: string): DailyAttendance {
  const attendanceDate = validDate(attendanceDateInput);
  const person = profileRow(employeeId);
  if (!person) throw new NotFoundError("Karyawan aktif tidak ditemukan");

  const roster = rosterFor(employeeId, attendanceDate);
  const regular = roster.find((entry) => entry.assignmentType === "REGULAR");
  const isOff = roster.some((entry) => entry.assignmentType === "OFF");
  const isLeave = roster.some((entry) => entry.assignmentType === "LEAVE");
  const hasOnCall = roster.some((entry) => entry.assignmentType === "ON_CALL");
  const explicitOvertime = roster.some((entry) => entry.assignmentType === "OVERTIME");
  const fallbackTemplate: Template | null = person.templateId && person.startTime && person.endTime && person.templateCode && person.templateName
    ? {
        id: person.templateId, code: person.templateCode, name: person.templateName,
        startTime: person.startTime, endTime: person.endTime,
        graceMinutes: person.graceMinutes ?? 0, crossesMidnight: person.crossesMidnight ?? 0
      }
    : null;
  const regularTemplate: Template | null = regular?.templateId && regular.startTime && regular.endTime && regular.templateCode && regular.templateName
    ? {
        id: regular.templateId, code: regular.templateCode, name: regular.templateName,
        startTime: regular.startTime, endTime: regular.endTime,
        graceMinutes: regular.graceMinutes ?? 0, crossesMidnight: regular.crossesMidnight ?? 0
      }
    : null;
  const profileWorksToday = fallbackTemplate && parseWorkdays(person.workdaysJson ?? "[]").includes(dayOfWeek(attendanceDate));
  const template = regularTemplate ?? (profileWorksToday ? fallbackTemplate : null);
  const crossesMidnight = Boolean(template?.crossesMidnight);
  const scans = scansFor(employeeId, attendanceDate, crossesMidnight);
  const checkInAt = scans[0]?.recordedAt ?? null;
  const checkOutAt = scans.length > 1 ? scans.at(-1)?.recordedAt ?? null : null;
  const notes: string[] = [];
  let autoStatus: AttendanceAutoStatus = "NO_SCHEDULE";
  let lateMinutes = 0;
  let overtimeMinutes = 0;
  let scheduledStartAt: string | null = null;
  let scheduledEndAt: string | null = null;

  if (isLeave || isOff) {
    autoStatus = scans.length ? "NEEDS_REVIEW" : isLeave ? "LEAVE" : "OFF";
    notes.push(scans.length ? "Ada scan pada hari cuti atau off" : isLeave ? "Cuti sesuai roster" : "Off sesuai roster");
  } else if (template) {
    const endDate = template.crossesMidnight ? addDays(attendanceDate, 1) : attendanceDate;
    scheduledStartAt = `${attendanceDate} ${template.startTime}:00`;
    scheduledEndAt = `${endDate} ${template.endTime}:00`;
    const scheduledStartMinutes = minutes(template.startTime);
    const scheduledEndMinutes = minutes(template.endTime) + (template.crossesMidnight ? 1440 : 0);
    const buffer = person.overtimeBufferMinutes ?? 15;

    if (!checkInAt) {
      autoStatus = dateHasEnded(attendanceDate, template.endTime, Boolean(template.crossesMidnight)) ? "ABSENT" : "PENDING";
      notes.push(autoStatus === "ABSENT" ? "Tidak ada scan setelah jadwal selesai" : "Menunggu scan masuk");
    } else {
      const checkInMinutes = scanMinutes(checkInAt);
      const adjustedCheckInMinutes = template.crossesMidnight && checkInAt.slice(0, 10) !== attendanceDate ? checkInMinutes + 1440 : checkInMinutes;
      lateMinutes = Math.max(0, adjustedCheckInMinutes - scheduledStartMinutes - template.graceMinutes);
      autoStatus = lateMinutes > 0 ? "LATE" : "PRESENT";
      if (lateMinutes > 0) notes.push(`Terlambat ${lateMinutes} menit`);

      const scanOutsideBefore = scheduledStartMinutes - adjustedCheckInMinutes;
      const finalScan = scans.at(-1)?.recordedAt;
      const finalMinutesRaw = finalScan ? scanMinutes(finalScan) : adjustedCheckInMinutes;
      const adjustedFinalMinutes = template.crossesMidnight && finalScan && finalScan.slice(0, 10) !== attendanceDate ? finalMinutesRaw + 1440 : finalMinutesRaw;
      const scanOutsideAfter = adjustedFinalMinutes - scheduledEndMinutes;
      overtimeMinutes = Math.max(0, scanOutsideBefore - buffer) + Math.max(0, scanOutsideAfter - buffer);

      if (explicitOvertime || overtimeMinutes > 0) {
        autoStatus = "OVERTIME";
        notes.push(explicitOvertime ? "Lembur sesuai roster" : `Scan di luar jam reguler, estimasi lembur ${overtimeMinutes} menit`);
      } else if (hasOnCall) {
        notes.push("On-call sesuai roster");
      }
    }
  } else if (scans.length && fallbackTemplate && Boolean(person.autoWeekendOvertime)) {
    autoStatus = hasOnCall ? "ON_CALL" : "OVERTIME";
    overtimeMinutes = durationMinutes(fallbackTemplate.startTime, fallbackTemplate.endTime, Boolean(fallbackTemplate.crossesMidnight));
    notes.push(hasOnCall ? "On-call dengan scan di luar hari kerja reguler" : "Scan pada hari di luar jadwal Steady Day, lembur akhir pekan otomatis");
  } else if (scans.length && (explicitOvertime || hasOnCall)) {
    autoStatus = hasOnCall ? "ON_CALL" : "OVERTIME";
    notes.push(hasOnCall ? "On-call dengan scan" : "Lembur sesuai roster");
  } else if (scans.length) {
    autoStatus = "NEEDS_REVIEW";
    notes.push("Ada scan tanpa jadwal atau profil kerja");
  } else if (fallbackTemplate && !profileWorksToday) {
    autoStatus = "OFF";
    notes.push("Hari di luar hari kerja profil");
  } else {
    notes.push("Belum ada roster atau profil kerja");
  }

  const autoRecord = {
    employeeId: person.employeeId,
    employeeCode: person.employeeCode,
    employeeName: person.employeeName,
    departmentName: person.departmentName,
    attendanceDate,
    autoStatus,
    checkInAt,
    checkOutAt,
    scheduledStartAt,
    scheduledEndAt,
    lateMinutes,
    overtimeMinutes,
    hasOnCall,
    notes
  };
  persistAutoEvaluation(autoRecord);
  const existing = evaluationRecord(employeeId, attendanceDate);
  return {
    ...autoRecord,
    status: existing?.confirmedStatus ?? autoStatus,
    confirmationState: existing?.confirmedStatus ? "CONFIRMED" : "AUTO",
    confirmationNote: existing?.confirmationNote ?? null
  };
}

export function listDailyAttendance(input: { from: string; to: string; employeeId?: number }) {
  const from = validDate(input.from);
  const to = validDate(input.to);
  if (from > to) throw new ValidationError("Tanggal mulai tidak boleh melebihi tanggal akhir");
  const targetEmployees = input.employeeId === undefined
    ? sqlite.query<{ id: number }, []>("SELECT id FROM employees WHERE is_active = 1 ORDER BY name ASC").all().map((row) => row.id)
    : [input.employeeId];
  const results: DailyAttendance[] = [];
  for (const employeeId of targetEmployees) {
    for (let date = from; date <= to; date = addDays(date, 1)) results.push(evaluateEmployeeDay(employeeId, date));
  }
  return results.sort((left, right) => `${right.attendanceDate}-${right.employeeName}`.localeCompare(`${left.attendanceDate}-${left.employeeName}`));
}

export function upsertScheduleProfile(input: ProfileInput) {
  if (!input.workdays.length || input.workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new ValidationError("Hari kerja harus berisi angka 1 sampai 7, dengan 1 berarti Senin");
  }
  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)).get();
  if (!employee) throw new NotFoundError("Karyawan tidak ditemukan");
  const template = db.select({ id: scheduleTemplates.id }).from(scheduleTemplates).where(eq(scheduleTemplates.id, input.scheduleTemplateId)).get();
  if (!template) throw new NotFoundError("Template jadwal tidak ditemukan");
  const now = new Date().toISOString();
  return db.insert(employeeScheduleProfiles).values({
    employeeId: input.employeeId,
    scheduleTemplateId: input.scheduleTemplateId,
    workdaysJson: JSON.stringify([...new Set(input.workdays)].sort()),
    autoWeekendOvertime: input.autoWeekendOvertime ?? true,
    overtimeBufferMinutes: input.overtimeBufferMinutes ?? 15,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: employeeScheduleProfiles.employeeId,
    set: {
      scheduleTemplateId: input.scheduleTemplateId,
      workdaysJson: JSON.stringify([...new Set(input.workdays)].sort()),
      autoWeekendOvertime: input.autoWeekendOvertime ?? true,
      overtimeBufferMinutes: input.overtimeBufferMinutes ?? 15,
      updatedAt: now
    }
  }).returning().get();
}

export function listScheduleProfiles() {
  return db.select({
    employeeId: employees.id,
    employeeCode: employees.employeeCode,
    employeeName: employees.name,
    scheduleTemplateId: employeeScheduleProfiles.scheduleTemplateId,
    scheduleTemplateCode: scheduleTemplates.code,
    scheduleTemplateName: scheduleTemplates.name,
    workdaysJson: employeeScheduleProfiles.workdaysJson,
    autoWeekendOvertime: employeeScheduleProfiles.autoWeekendOvertime,
    overtimeBufferMinutes: employeeScheduleProfiles.overtimeBufferMinutes
  }).from(employeeScheduleProfiles)
    .innerJoin(employees, eq(employeeScheduleProfiles.employeeId, employees.id))
    .innerJoin(scheduleTemplates, eq(employeeScheduleProfiles.scheduleTemplateId, scheduleTemplates.id))
    .orderBy(asc(employees.name))
    .all()
    .map((profile) => ({ ...profile, workdays: parseWorkdays(profile.workdaysJson) }));
}

export function confirmDailyAttendance(input: {
  employeeId: number;
  attendanceDate: string;
  status: AttendanceConfirmedStatus;
  note?: string | null;
  confirmedByEmployeeId: number;
}) {
  if (!ALL_STATUSES.includes(input.status)) throw new ValidationError("Status konfirmasi tidak valid");
  const result = evaluateEmployeeDay(input.employeeId, input.attendanceDate);
  sqlite.prepare(`
    UPDATE attendance_evaluations
    SET confirmed_status = ?, confirmation_note = ?, confirmed_by_employee_id = ?, confirmed_at = ?
    WHERE employee_id = ? AND attendance_date = ?
  `).run(input.status, input.note?.trim() || null, input.confirmedByEmployeeId, new Date().toISOString(), input.employeeId, result.attendanceDate);
  return evaluateEmployeeDay(input.employeeId, result.attendanceDate);
}
