import { asc, eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../db/connection";
import { attendanceSettings, departments, employeeScheduleProfiles, employeeWorkModes, employees, scheduleTemplates, type AttendanceAutoStatus, type AttendanceConfirmedStatus, type EmployeeWorkMode, type UserRole } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";

type ProfileInput = {
  employeeId: number;
  scheduleTemplateId: string;
  workdays: number[];
  weeklyTemplates?: WeeklyTemplateInput[];
  autoWeekendOvertime?: boolean;
  overtimeBufferMinutes?: number;
};

type WeeklyTemplateInput = { day: number; scheduleTemplateId: string };

export type WorkModeInput = {
  employeeId: number;
  mode: EmployeeWorkMode;
  rosterGroup?: string | null;
};

export type BulkWorkSetupInput = {
  employeeIds: number[];
  mode: EmployeeWorkMode;
  rosterGroup?: string | null;
  departmentId?: string | null;
  role?: UserRole;
  profile?: {
    scheduleTemplateId: string;
    workdays: number[];
    weeklyTemplates?: WeeklyTemplateInput[];
    autoWeekendOvertime?: boolean;
    overtimeBufferMinutes?: number;
  } | null;
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
  confirmedAt: string | null;
  confirmedByName: string | null;
  confirmedByEmployeeId: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALL_STATUSES: AttendanceConfirmedStatus[] = ["PRESENT", "LATE", "OVERTIME", "ON_CALL", "OFF", "LEAVE", "ABSENT", "NEEDS_REVIEW"];

export type AttendanceSettingsInput = {
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  overtimeBufferMinutes: number;
};

const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettingsInput = {
  lateToleranceMinutes: 15,
  earlyLeaveToleranceMinutes: 0,
  overtimeBufferMinutes: 15
};

const CREW_PATTERN = ["P", "P", "P", "M", "M", "M", "OFF", "OFF", "OFF"] as const;
const CREW_PHASE_ON_REFERENCE_DATE = { A: 5, B: 8, C: 2 } as const;
const CREW_PATTERN_REFERENCE_DATE = "2026-08-16";

export function getAttendanceSettings(): AttendanceSettingsInput {
  return db.select({
    lateToleranceMinutes: attendanceSettings.lateToleranceMinutes,
    earlyLeaveToleranceMinutes: attendanceSettings.earlyLeaveToleranceMinutes,
    overtimeBufferMinutes: attendanceSettings.overtimeBufferMinutes
  }).from(attendanceSettings).where(eq(attendanceSettings.id, 1)).get() ?? DEFAULT_ATTENDANCE_SETTINGS;
}

export function updateAttendanceSettings(input: AttendanceSettingsInput) {
  const values = [input.lateToleranceMinutes, input.earlyLeaveToleranceMinutes, input.overtimeBufferMinutes];
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 240)) {
    throw new ValidationError("Toleransi absensi harus berupa angka antara 0 sampai 240 menit");
  }
  return db.insert(attendanceSettings).values({ id: 1, ...input, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: attendanceSettings.id,
      set: { ...input, updatedAt: new Date().toISOString() }
    }).returning().get();
}

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

function dateDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function crewLetter(value: string | null) {
  return value?.match(/\bcrew\s*([abc])\b/i)?.[1]?.toUpperCase() as "A" | "B" | "C" | undefined;
}

function minutes(time: string) {
  const [hours, minute] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minute ?? 0);
}

function scanMinutes(recordedAt: string) {
  return minutes(recordedAt.slice(11, 16));
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

function parseWeeklyTemplateIds(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as Record<number, string>;
    return Object.fromEntries(Object.entries(parsed)
      .filter(([day, templateId]) => Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 7 && typeof templateId === "string" && templateId.trim())
      .map(([day, templateId]) => [Number(day), templateId])) as Record<number, string>;
  } catch {
    return {} as Record<number, string>;
  }
}

function normalizeWeeklyTemplates(input: WeeklyTemplateInput[] | undefined, scheduleTemplateId: string, workdays: number[]) {
  const source = input?.length ? input : workdays.map((day) => ({ day, scheduleTemplateId }));
  if (!source.length || source.some(({ day, scheduleTemplateId: id }) => !Number.isInteger(day) || day < 1 || day > 7 || !id.trim())) {
    throw new ValidationError("Template per hari harus berisi hari 1 sampai 7 dan jadwal yang valid");
  }
  const days = source.map(({ day }) => day);
  if (new Set(days).size !== days.length) throw new ValidationError("Satu hari hanya boleh memiliki satu template jadwal");
  return source.map(({ day, scheduleTemplateId: id }) => ({ day, scheduleTemplateId: id.trim() }))
    .sort((left, right) => left.day - right.day);
}

function ensureTemplatesExist(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  const records = db.select({ id: scheduleTemplates.id }).from(scheduleTemplates)
    .where(inArray(scheduleTemplates.id, uniqueIds)).all();
  if (records.length !== uniqueIds.length) throw new NotFoundError("Satu atau beberapa template jadwal tidak ditemukan");
}

function isPitCrewDepartment(departmentCode: string | null, departmentName: string | null) {
  return /\bpit\s*crew\b/i.test(`${departmentCode ?? ""} ${departmentName ?? ""}`);
}

function steadyDayTemplate(): Template | null {
  const record = db.select({
    id: scheduleTemplates.id,
    code: scheduleTemplates.code,
    name: scheduleTemplates.name,
    startTime: scheduleTemplates.startTime,
    endTime: scheduleTemplates.endTime,
    graceMinutes: scheduleTemplates.graceMinutes,
    crossesMidnight: scheduleTemplates.crossesMidnight
  }).from(scheduleTemplates).where(eq(scheduleTemplates.code, "STEADY_DAY")).get();
  return record ? { ...record, crossesMidnight: Number(record.crossesMidnight) } : null;
}

function profileRow(employeeId: number) {
  return sqlite.query<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    departmentCode: string | null;
    departmentName: string | null;
    workMode: "FIXED" | "ROSTER" | "NONE" | null;
    rosterGroup: string | null;
    workdaysJson: string | null;
    weeklyTemplateIdsJson: string | null;
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
      department.code AS departmentCode,
      department.name AS departmentName,
      work_mode.mode AS workMode,
      work_mode.roster_group AS rosterGroup,
      profile.workdays_json AS workdaysJson,
      profile.weekly_template_ids_json AS weeklyTemplateIdsJson,
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
    LEFT JOIN employee_work_modes AS work_mode ON work_mode.employee_id = employee.id
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

function scheduleTemplateById(id: string) {
  const record = db.select({
    id: scheduleTemplates.id,
    code: scheduleTemplates.code,
    name: scheduleTemplates.name,
    startTime: scheduleTemplates.startTime,
    endTime: scheduleTemplates.endTime,
    graceMinutes: scheduleTemplates.graceMinutes,
    crossesMidnight: scheduleTemplates.crossesMidnight
  }).from(scheduleTemplates).where(eq(scheduleTemplates.id, id)).get();
  return record ? { ...record, crossesMidnight: Number(record.crossesMidnight) } : null;
}

function scheduleTemplateByCode(code: string) {
  const record = db.select({
    id: scheduleTemplates.id,
    code: scheduleTemplates.code,
    name: scheduleTemplates.name,
    startTime: scheduleTemplates.startTime,
    endTime: scheduleTemplates.endTime,
    graceMinutes: scheduleTemplates.graceMinutes,
    crossesMidnight: scheduleTemplates.crossesMidnight
  }).from(scheduleTemplates).where(eq(scheduleTemplates.code, code)).get();
  return record ? { ...record, crossesMidnight: Number(record.crossesMidnight) } : null;
}

function automaticCrewSchedule(rosterGroup: string | null, date: string) {
  const letter = crewLetter(rosterGroup);
  if (!letter) return null;
  const index = positiveModulo(dateDifference(CREW_PATTERN_REFERENCE_DATE, date) + CREW_PHASE_ON_REFERENCE_DATE[letter], CREW_PATTERN.length);
  const shift = CREW_PATTERN[index]!;
  return {
    group: `Crew ${letter}`,
    shift,
    template: shift === "P" ? scheduleTemplateByCode("SHIFT_PAGI") : shift === "M" ? scheduleTemplateByCode("SHIFT_MALAM") : null
  };
}

function scansFor(employeeId: number, date: string, crossesMidnight: boolean) {
  // A night shift ends the following morning.  Do not include the next
  // evening's check-in as this employee's check-out for the previous shift,
  // or the previous shift's morning check-out as today's night check-in.
  const from = crossesMidnight ? `${date} 12:00:00` : `${date} 00:00:00`;
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
  `).all(employeeId, from, until);
}

function adjustedMinutesForSchedule(recordedAt: string, attendanceDate: string, crossesMidnight: boolean) {
  const value = scanMinutes(recordedAt);
  return crossesMidnight && recordedAt.slice(0, 10) !== attendanceDate ? value + 1440 : value;
}

function identifyScanPair(scans: Scan[], attendanceDate: string, template: Template | null) {
  if (scans.length === 0) return { checkInAt: null, checkOutAt: null, interpretation: "NONE" as const };
  if (!template) {
    return {
      checkInAt: scans[0]?.recordedAt ?? null,
      checkOutAt: scans.length > 1 ? scans.at(-1)?.recordedAt ?? null : null,
      interpretation: scans.length > 1 ? "PAIRED" as const : "UNKNOWN" as const
    };
  }

  const start = minutes(template.startTime);
  const end = minutes(template.endTime) + (template.crossesMidnight ? 1440 : 0);
  const midpoint = start + (end - start) / 2;
  const first = scans[0]!;
  const last = scans.at(-1)!;
  const firstMinutes = adjustedMinutesForSchedule(first.recordedAt, attendanceDate, Boolean(template.crossesMidnight));
  const lastMinutes = adjustedMinutesForSchedule(last.recordedAt, attendanceDate, Boolean(template.crossesMidnight));

  if (scans.length === 1) {
    return firstMinutes <= midpoint
      ? { checkInAt: first.recordedAt, checkOutAt: null, interpretation: "CHECK_IN_ONLY" as const }
      : { checkInAt: null, checkOutAt: first.recordedAt, interpretation: "CHECK_OUT_ONLY" as const };
  }

  // Repeated scans a few minutes apart near the same side of the shift are
  // one attendance event, not a valid in/out pair.
  if (lastMinutes - firstMinutes < 60) {
    if (lastMinutes <= midpoint) return { checkInAt: first.recordedAt, checkOutAt: null, interpretation: "CHECK_IN_ONLY" as const };
    if (firstMinutes > midpoint) return { checkInAt: null, checkOutAt: last.recordedAt, interpretation: "CHECK_OUT_ONLY" as const };
  }

  return { checkInAt: first.recordedAt, checkOutAt: last.recordedAt, interpretation: "PAIRED" as const };
}

function evaluationRecord(employeeId: number, date: string) {
  return sqlite.query<{
    confirmedStatus: AttendanceConfirmedStatus | null;
    confirmationNote: string | null;
    confirmedByEmployeeId: number | null;
    confirmedAt: string | null;
    confirmedByName: string | null;
  }, [number, string]>(`
    SELECT ae.confirmed_status AS confirmedStatus,
           ae.confirmation_note AS confirmationNote,
           ae.confirmed_by_employee_id AS confirmedByEmployeeId,
           ae.confirmed_at AS confirmedAt,
           e.name AS confirmedByName
    FROM attendance_evaluations ae
    LEFT JOIN employees e ON ae.confirmed_by_employee_id = e.id
    WHERE ae.employee_id = ? AND ae.attendance_date = ?
  `).get(employeeId, date) ?? null;
}

function persistAutoEvaluation(record: Omit<DailyAttendance, "status" | "confirmationState" | "confirmationNote" | "confirmedAt" | "confirmedByName" | "confirmedByEmployeeId">) {
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
    JSON.stringify({
      hasOnCall: record.hasOnCall,
      notes: record.notes,
      scheduleCode: record.scheduleCode,
      scheduleName: record.scheduleName,
      scanCount: record.scanCount,
      earlyLeaveMinutes: record.earlyLeaveMinutes
    }),
    new Date().toISOString()
  );
}

function dateHasEnded(date: string, endTime: string, crossesMidnight: boolean) {
  const endDate = crossesMidnight ? addDays(date, 1) : date;
  return new Date() >= new Date(`${endDate}T${endTime}:00+08:00`);
}

type ProfilePerson = NonNullable<ReturnType<typeof profileRow>>;

function resolveEmployeeSchedule(person: ProfilePerson, attendanceDate: string) {
  const roster = rosterFor(person.employeeId, attendanceDate);
  const regular = roster.find((entry) => entry.assignmentType === "REGULAR");
  const isOff = roster.some((entry) => entry.assignmentType === "OFF");
  const isLeave = roster.some((entry) => entry.assignmentType === "LEAVE");
  const hasOnCall = roster.some((entry) => entry.assignmentType === "ON_CALL");
  const explicitOvertime = roster.some((entry) => entry.assignmentType === "OVERTIME");
  const automaticRoster = !regular && !isOff && !isLeave && person.workMode === "ROSTER"
    ? automaticCrewSchedule(person.rosterGroup, attendanceDate)
    : null;
  const isAutomaticRosterOff = automaticRoster?.shift === "OFF";
  const hasFixedProfile = person.templateId && person.startTime && person.endTime && person.templateCode && person.templateName;
  // Departments outside PIT Crew follow Steady Day by policy.  A stored work
  // mode is an explicit override: ROSTER and NONE must never be silently
  // converted to a fixed schedule.
  const usesImplicitSteadyDay = !hasFixedProfile
    && person.workMode === null
    && Boolean(person.departmentName)
    && !isPitCrewDepartment(person.departmentCode, person.departmentName);
  const fallbackTemplate: Template | null = hasFixedProfile
    ? {
        id: person.templateId!, code: person.templateCode!, name: person.templateName!,
        startTime: person.startTime!, endTime: person.endTime!,
        graceMinutes: person.graceMinutes ?? 0, crossesMidnight: person.crossesMidnight ?? 0
      }
    : usesImplicitSteadyDay ? steadyDayTemplate() : null;
  const explicitRegularTemplate: Template | null = regular?.templateId && regular.startTime && regular.endTime && regular.templateCode && regular.templateName
    ? {
        id: regular.templateId, code: regular.templateCode, name: regular.templateName,
        startTime: regular.startTime, endTime: regular.endTime,
        graceMinutes: regular.graceMinutes ?? 0, crossesMidnight: regular.crossesMidnight ?? 0
      }
    : null;
  const regularTemplate = explicitRegularTemplate ?? automaticRoster?.template ?? null;
  const weeklyTemplateIds = parseWeeklyTemplateIds(person.weeklyTemplateIdsJson);
  const hasWeeklyTemplates = Object.keys(weeklyTemplateIds).length > 0;
  const profileTemplateForToday = weeklyTemplateIds[dayOfWeek(attendanceDate)]
    ? scheduleTemplateById(weeklyTemplateIds[dayOfWeek(attendanceDate)]!)
    : fallbackTemplate;
  const profileWorksToday = Boolean(profileTemplateForToday) && (hasWeeklyTemplates
    ? Boolean(weeklyTemplateIds[dayOfWeek(attendanceDate)])
    : parseWorkdays(person.workdaysJson ?? "[1,2,3,4,5]").includes(dayOfWeek(attendanceDate)));
  const template = regularTemplate ?? (profileWorksToday ? profileTemplateForToday : null);

  return {
    roster,
    regular,
    isOff,
    isLeave,
    hasOnCall,
    explicitOvertime,
    automaticRoster,
    isAutomaticRosterOff,
    template,
    fallbackTemplate,
    profileTemplateForToday,
    profileWorksToday,
    usesImplicitSteadyDay
  };
}

export function evaluateEmployeeDay(employeeId: number, attendanceDateInput: string): DailyAttendance {
  const attendanceDate = validDate(attendanceDateInput);
  const person = profileRow(employeeId);
  if (!person) throw new NotFoundError("Karyawan aktif tidak ditemukan");
  const globalSettings = getAttendanceSettings();

  const schedule = resolveEmployeeSchedule(person, attendanceDate);
  const {
    isOff,
    isLeave,
    hasOnCall,
    explicitOvertime,
    automaticRoster,
    isAutomaticRosterOff,
    template,
    fallbackTemplate,
    profileTemplateForToday,
    profileWorksToday,
    usesImplicitSteadyDay
  } = schedule;

  const crossesMidnight = Boolean(template?.crossesMidnight);

  // Periksa jadwal shift kemarin (D - 1).
  // Jika kemarin karyawan memiliki shift yang melintasi tengah malam (seperti Shift Malam 18:00 - 06:00),
  // maka scan di pagi hari ini (sebelum jam 12:00 siang) merupakan absen PULANG (checkout) dari shift malam kemarin.
  // Jika hari ini karyawan berstatus OFF, LEAVE, atau belum dijadwalkan, scan pagi tersebut
  // TIDAK boleh dianggap sebagai scan masuk baru pada hari ini.
  const prevDate = addDays(attendanceDate, -1);
  const prevSchedule = resolveEmployeeSchedule(person, prevDate);
  const prevCrossesMidnight = Boolean(prevSchedule.template?.crossesMidnight);

  let scans = scansFor(employeeId, attendanceDate, crossesMidnight);

  if (prevCrossesMidnight) {
    const prevScans = scansFor(employeeId, prevDate, true);
    const prevPair = identifyScanPair(prevScans, prevDate, prevSchedule.template);
    const prevCheckout = prevPair.checkOutAt;

    scans = scans.filter((scan) => {
      // Jika scan terjadi pada pagi hari attendanceDate (sebelum 12:00 siang)
      if (scan.recordedAt.slice(0, 10) === attendanceDate && scan.recordedAt.slice(11, 19) < "12:00:00") {
        // Jika scan ini digunakan sebagai checkout kemarin
        if (prevCheckout && scan.recordedAt === prevCheckout) return false;
        // Jika hari ini berstatus OFF, LEAVE, atau tanpa jadwal kerja aktif,
        // seluruh scan pagi ini adalah kepulangan dari shift malam kemarin
        if (isOff || isLeave || isAutomaticRosterOff || !template) return false;
      }
      return true;
    });
  }

  const scanPair = identifyScanPair(scans, attendanceDate, template);
  const checkInAt = scanPair.checkInAt;
  const checkOutAt = scanPair.checkOutAt;
  const lastScanAt = scans.at(-1)?.recordedAt ?? null;
  const notes: string[] = [];
  let autoStatus: AttendanceAutoStatus = "NO_SCHEDULE";
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  let scheduledStartAt: string | null = null;
  let scheduledEndAt: string | null = null;

  if (isLeave || isOff || isAutomaticRosterOff) {
    autoStatus = scans.length ? "NEEDS_REVIEW" : isLeave ? "LEAVE" : "OFF";
    notes.push(scans.length
      ? "Ada scan pada hari cuti atau off"
      : isLeave ? "Cuti sesuai roster" : isAutomaticRosterOff ? `Off otomatis ${automaticRoster?.group ?? "roster"}` : "Off sesuai roster");
  } else if (template) {
    const endDate = template.crossesMidnight ? addDays(attendanceDate, 1) : attendanceDate;
    scheduledStartAt = `${attendanceDate} ${template.startTime}:00`;
    scheduledEndAt = `${endDate} ${template.endTime}:00`;
    const scheduledStartMinutes = minutes(template.startTime);
    const scheduledEndMinutes = minutes(template.endTime) + (template.crossesMidnight ? 1440 : 0);
    const buffer = globalSettings.overtimeBufferMinutes;

    if (!checkInAt && checkOutAt) {
      autoStatus = "NEEDS_REVIEW";
      notes.push("Tidak absen masuk");
      notes.push(`Scan ${checkOutAt.slice(11, 19)} dikenali sebagai absen pulang`);
    } else if (!checkInAt) {
      autoStatus = dateHasEnded(attendanceDate, template.endTime, Boolean(template.crossesMidnight)) ? "ABSENT" : "PENDING";
      notes.push(autoStatus === "ABSENT" ? "Tidak absen masuk dan pulang" : "Menunggu absen masuk");
    } else {
      const checkInMinutes = scanMinutes(checkInAt);
      const adjustedCheckInMinutes = template.crossesMidnight && checkInAt.slice(0, 10) !== attendanceDate ? checkInMinutes + 1440 : checkInMinutes;
      lateMinutes = Math.max(0, adjustedCheckInMinutes - scheduledStartMinutes - globalSettings.lateToleranceMinutes);
      autoStatus = lateMinutes > 0 ? "LATE" : "PRESENT";
      if (lateMinutes > 0) notes.push(`Terlambat ${lateMinutes} menit`);

      const finalScan = scans.at(-1)?.recordedAt;
      const finalMinutesRaw = finalScan ? scanMinutes(finalScan) : adjustedCheckInMinutes;
      const adjustedFinalMinutes = template.crossesMidnight && finalScan && finalScan.slice(0, 10) !== attendanceDate ? finalMinutesRaw + 1440 : finalMinutesRaw;
      const scanOutsideAfter = checkOutAt ? adjustedFinalMinutes - scheduledEndMinutes : 0;
      overtimeMinutes = Math.max(0, scanOutsideAfter - buffer);
      earlyLeaveMinutes = checkOutAt ? Math.max(0, scheduledEndMinutes - adjustedFinalMinutes - globalSettings.earlyLeaveToleranceMinutes) : 0;

      if (earlyLeaveMinutes > 0) notes.push(`Pulang ${earlyLeaveMinutes} menit sebelum jadwal selesai`);
      if (!checkOutAt && dateHasEnded(attendanceDate, template.endTime, Boolean(template.crossesMidnight))) {
        autoStatus = explicitOvertime ? "OVERTIME" : "NEEDS_REVIEW";
        notes.unshift("Tidak absen pulang");
        notes.push(`Scan ${checkInAt.slice(11, 19)} dikenali sebagai absen masuk`);
      } else if (!checkOutAt) {
        notes.push("Menunggu absen pulang");
      }

      if (explicitOvertime || (overtimeMinutes > 0 && checkOutAt)) {
        autoStatus = "OVERTIME";
        notes.push(explicitOvertime ? "Lembur sesuai roster" : `Scan di luar jam reguler, estimasi lembur ${overtimeMinutes} menit`);
      } else if (hasOnCall) {
        notes.push("On-call sesuai roster");
      }
      if (checkOutAt && notes.length === 0) notes.push("Absensi masuk dan pulang lengkap");
    }
  } else if (scans.length && fallbackTemplate && (person.autoWeekendOvertime ?? usesImplicitSteadyDay)) {
    autoStatus = scans.length > 1 ? (hasOnCall ? "ON_CALL" : "OVERTIME") : "NEEDS_REVIEW";
    overtimeMinutes = checkInAt && checkOutAt
      ? Math.max(0, Math.round((new Date(`${checkOutAt.replace(" ", "T")}+08:00`).getTime() - new Date(`${checkInAt.replace(" ", "T")}+08:00`).getTime()) / 60_000))
      : 0;
    notes.push(scans.length > 1
      ? hasOnCall ? "On-call dengan scan di luar hari kerja reguler" : "Scan pada hari di luar jadwal Steady Day, lembur akhir pekan otomatis"
      : "Scan akhir pekan belum memiliki pasangan masuk dan keluar");
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

  if (usesImplicitSteadyDay) notes.push("Steady Day otomatis berdasarkan departemen");
  if (automaticRoster) notes.push(`Pola ${automaticRoster.group} otomatis`);

  const autoRecord = {
    employeeId: person.employeeId,
    employeeCode: person.employeeCode,
    employeeName: person.employeeName,
    departmentName: person.departmentName,
    attendanceDate,
    autoStatus,
    checkInAt,
    checkOutAt,
    lastScanAt,
    scheduledStartAt,
    scheduledEndAt,
    scheduleCode: template?.code ?? profileTemplateForToday?.code ?? fallbackTemplate?.code ?? null,
    scheduleName: template?.name ?? profileTemplateForToday?.name ?? fallbackTemplate?.name ?? null,
    scanCount: scans.length,
    lateMinutes,
    earlyLeaveMinutes,
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
    confirmationNote: existing?.confirmationNote ?? null,
    confirmedAt: existing?.confirmedAt ?? null,
    confirmedByName: existing?.confirmedByName ?? null,
    confirmedByEmployeeId: existing?.confirmedByEmployeeId ?? null
  };
}

export function listDailyAttendance(input: { from: string; to: string; employeeId?: number }) {
  const from = validDate(input.from);
  const to = validDate(input.to);
  if (from > to) throw new ValidationError("Tanggal mulai tidak boleh melebihi tanggal akhir");
  const rangeDays = Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
  if (rangeDays > 31) throw new ValidationError("Rentang evaluasi absensi maksimal 31 hari");
  const targetEmployees = input.employeeId === undefined
    ? sqlite.query<{ id: number }, []>("SELECT id FROM employees WHERE is_active = 1 ORDER BY name ASC").all().map((row) => row.id)
    : [input.employeeId];
  const results: DailyAttendance[] = [];
  for (const employeeId of targetEmployees) {
    for (let date = from; date <= to; date = addDays(date, 1)) results.push(evaluateEmployeeDay(employeeId, date));
  }
  return results.sort((left, right) => {
    const leftActivity = left.lastScanAt ?? left.checkOutAt ?? left.checkInAt;
    const rightActivity = right.lastScanAt ?? right.checkOutAt ?? right.checkInAt;
    if (leftActivity && rightActivity) return rightActivity.localeCompare(leftActivity);
    if (leftActivity) return -1;
    if (rightActivity) return 1;
    if (left.attendanceDate !== right.attendanceDate) return right.attendanceDate.localeCompare(left.attendanceDate);
    return left.employeeName.localeCompare(right.employeeName, "id-ID");
  });
}

export function upsertScheduleProfile(input: ProfileInput) {
  if (!input.workdays.length || input.workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new ValidationError("Hari kerja harus berisi angka 1 sampai 7, dengan 1 berarti Senin");
  }
  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)).get();
  if (!employee) throw new NotFoundError("Karyawan tidak ditemukan");
  const weeklyTemplates = normalizeWeeklyTemplates(input.weeklyTemplates, input.scheduleTemplateId, input.workdays);
  ensureTemplatesExist([input.scheduleTemplateId, ...weeklyTemplates.map(({ scheduleTemplateId }) => scheduleTemplateId)]);
  const workdays = weeklyTemplates.map(({ day }) => day);
  const weeklyTemplateIdsJson = JSON.stringify(Object.fromEntries(weeklyTemplates.map(({ day, scheduleTemplateId }) => [day, scheduleTemplateId])));
  const now = new Date().toISOString();
  return db.insert(employeeScheduleProfiles).values({
    employeeId: input.employeeId,
    scheduleTemplateId: input.scheduleTemplateId,
    workdaysJson: JSON.stringify(workdays),
    weeklyTemplateIdsJson,
    autoWeekendOvertime: input.autoWeekendOvertime ?? true,
    overtimeBufferMinutes: input.overtimeBufferMinutes ?? 15,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: employeeScheduleProfiles.employeeId,
    set: {
      scheduleTemplateId: input.scheduleTemplateId,
      workdaysJson: JSON.stringify(workdays),
      weeklyTemplateIdsJson,
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
    weeklyTemplateIdsJson: employeeScheduleProfiles.weeklyTemplateIdsJson,
    autoWeekendOvertime: employeeScheduleProfiles.autoWeekendOvertime,
    overtimeBufferMinutes: employeeScheduleProfiles.overtimeBufferMinutes
  }).from(employeeScheduleProfiles)
    .innerJoin(employees, eq(employeeScheduleProfiles.employeeId, employees.id))
    .innerJoin(scheduleTemplates, eq(employeeScheduleProfiles.scheduleTemplateId, scheduleTemplates.id))
    .orderBy(asc(employees.name))
    .all()
    .map((profile) => ({
      ...profile,
      workdays: parseWorkdays(profile.workdaysJson),
      weeklyTemplates: Object.entries(parseWeeklyTemplateIds(profile.weeklyTemplateIdsJson))
        .map(([day, scheduleTemplateId]) => ({ day: Number(day), scheduleTemplateId }))
        .sort((left, right) => left.day - right.day)
    }));
}

export function deleteScheduleProfile(employeeId: number) {
  const deleted = db.delete(employeeScheduleProfiles)
    .where(eq(employeeScheduleProfiles.employeeId, employeeId))
    .returning({ employeeId: employeeScheduleProfiles.employeeId })
    .get();
  if (!deleted) throw new NotFoundError("Profil kerja karyawan tidak ditemukan");
  return { success: true };
}

export function listEmployeeWorkModes() {
  return db.select({
    employeeId: employees.id,
    mode: employeeWorkModes.mode,
    rosterGroup: employeeWorkModes.rosterGroup
  }).from(employeeWorkModes)
    .innerJoin(employees, eq(employeeWorkModes.employeeId, employees.id))
    .orderBy(asc(employees.name))
    .all();
}

export function upsertEmployeeWorkMode(input: WorkModeInput) {
  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)).get();
  if (!employee) throw new NotFoundError("Karyawan tidak ditemukan");
  const rosterGroup = input.mode === "ROSTER" ? input.rosterGroup?.trim() : null;
  if (input.mode === "ROSTER" && !rosterGroup) throw new ValidationError("Kelompok roster wajib dipilih untuk karyawan shift");
  const now = new Date().toISOString();
  return db.insert(employeeWorkModes).values({
    employeeId: input.employeeId,
    mode: input.mode,
    rosterGroup: rosterGroup || null,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: employeeWorkModes.employeeId,
    set: { mode: input.mode, rosterGroup: rosterGroup || null, updatedAt: now }
  }).returning().get();
}

export function bulkUpsertEmployeeWorkSetup(input: BulkWorkSetupInput) {
  const employeeIds = [...new Set(input.employeeIds)];
  if (!employeeIds.length || employeeIds.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new ValidationError("Pilih minimal satu karyawan yang valid");
  }
  const rosterGroup = input.mode === "ROSTER" ? input.rosterGroup?.trim() : null;
  if (input.mode === "ROSTER" && !rosterGroup) throw new ValidationError("Kelompok roster wajib diisi untuk karyawan shift");
  if (input.mode === "FIXED") {
    if (!input.profile) throw new ValidationError("Detail jadwal tetap wajib diisi");
    if (!input.profile.workdays.length || input.profile.workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new ValidationError("Hari kerja harus berisi angka 1 sampai 7");
    }
  }

  const weeklyTemplates = input.mode === "FIXED" && input.profile
    ? normalizeWeeklyTemplates(input.profile.weeklyTemplates, input.profile.scheduleTemplateId, input.profile.workdays)
    : [];

  return db.transaction((transaction) => {
    const foundEmployees = transaction.select({ id: employees.id }).from(employees).where(inArray(employees.id, employeeIds)).all();
    if (foundEmployees.length !== employeeIds.length) throw new NotFoundError("Satu atau beberapa karyawan tidak ditemukan");
    if (input.mode === "FIXED" && input.profile) {
      const templateIds = [...new Set([input.profile.scheduleTemplateId, ...weeklyTemplates.map(({ scheduleTemplateId }) => scheduleTemplateId)])];
      const templates = transaction.select({ id: scheduleTemplates.id }).from(scheduleTemplates)
        .where(inArray(scheduleTemplates.id, templateIds)).all();
      if (templates.length !== templateIds.length) throw new NotFoundError("Satu atau beberapa template jadwal tidak ditemukan");
    }
    if (input.departmentId) {
      const department = transaction.select({ id: departments.id }).from(departments)
        .where(eq(departments.id, input.departmentId)).get();
      if (!department) throw new NotFoundError("Departemen tidak ditemukan");
    }

    const now = new Date().toISOString();
    for (const employeeId of employeeIds) {
      if (input.departmentId !== undefined || input.role !== undefined) {
        transaction.update(employees).set({
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          ...(input.role === undefined ? {} : { role: input.role }),
          updatedAt: now
        }).where(eq(employees.id, employeeId)).run();
      }

      if (input.mode === "FIXED" && input.profile) {
        const workdays = weeklyTemplates.map(({ day }) => day);
        const weeklyTemplateIdsJson = JSON.stringify(Object.fromEntries(weeklyTemplates.map(({ day, scheduleTemplateId }) => [day, scheduleTemplateId])));
        transaction.insert(employeeScheduleProfiles).values({
          employeeId,
          scheduleTemplateId: input.profile.scheduleTemplateId,
          workdaysJson: JSON.stringify(workdays),
          weeklyTemplateIdsJson,
          autoWeekendOvertime: input.profile.autoWeekendOvertime ?? true,
          overtimeBufferMinutes: input.profile.overtimeBufferMinutes ?? 15,
          createdAt: now,
          updatedAt: now
        }).onConflictDoUpdate({
          target: employeeScheduleProfiles.employeeId,
          set: {
            scheduleTemplateId: input.profile.scheduleTemplateId,
            workdaysJson: JSON.stringify(workdays),
            weeklyTemplateIdsJson,
            autoWeekendOvertime: input.profile.autoWeekendOvertime ?? true,
            overtimeBufferMinutes: input.profile.overtimeBufferMinutes ?? 15,
            updatedAt: now
          }
        }).run();
      } else {
        transaction.delete(employeeScheduleProfiles).where(eq(employeeScheduleProfiles.employeeId, employeeId)).run();
      }

      transaction.insert(employeeWorkModes).values({
        employeeId,
        mode: input.mode,
        rosterGroup: rosterGroup || null,
        createdAt: now,
        updatedAt: now
      }).onConflictDoUpdate({
        target: employeeWorkModes.employeeId,
        set: { mode: input.mode, rosterGroup: rosterGroup || null, updatedAt: now }
      }).run();
    }
    return { success: true, total: employeeIds.length, mode: input.mode };
  });
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

export function confirmBatchDailyAttendance(input: {
  items: Array<{
    employeeId: number;
    attendanceDate: string;
    status: AttendanceConfirmedStatus;
    note?: string | null;
  }>;
  confirmedByEmployeeId: number;
}) {
  if (!input.items.length) return { success: true, count: 0 };
  for (const item of input.items) {
    if (!ALL_STATUSES.includes(item.status)) throw new ValidationError(`Status konfirmasi tidak valid: ${item.status}`);
  }
  const now = new Date().toISOString();
  return sqlite.transaction(() => {
    let count = 0;
    for (const item of input.items) {
      evaluateEmployeeDay(item.employeeId, item.attendanceDate);
      sqlite.prepare(`
        UPDATE attendance_evaluations
        SET confirmed_status = ?, confirmation_note = ?, confirmed_by_employee_id = ?, confirmed_at = ?
        WHERE employee_id = ? AND attendance_date = ?
      `).run(item.status, item.note?.trim() || null, input.confirmedByEmployeeId, now, item.employeeId, item.attendanceDate);
      count++;
    }
    return { success: true, count };
  })();
}
