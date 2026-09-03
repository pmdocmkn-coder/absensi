import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/connection";
import {
  departments,
  employees,
  rosterBackupAssignments,
  rosterAssignments,
  scheduleTemplates,
  type RosterBackupReason,
  type RosterAssignmentType,
  type ScheduleTemplateKind
} from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";

export type CreateScheduleTemplateInput = {
  code: string;
  name: string;
  kind?: ScheduleTemplateKind;
  startTime: string;
  endTime: string;
  graceMinutes?: number;
  crossesMidnight?: boolean;
};

export type UpdateScheduleTemplateInput = Partial<CreateScheduleTemplateInput> & { isActive?: boolean };

export type CreateRosterAssignmentInput = {
  employeeId: number;
  assignmentDate: string;
  assignmentType: RosterAssignmentType;
  scheduleTemplateId?: string | null;
  notes?: string | null;
};

export type UpdateRosterAssignmentInput = Partial<Omit<CreateRosterAssignmentInput, "employeeId">>;

export type BulkRosterAssignmentInput = CreateRosterAssignmentInput;

export type CreateRosterBackupInput = {
  coveredEmployeeId: number;
  backupEmployeeId: number;
  startDate: string;
  endDate: string;
  reason: RosterBackupReason;
  reasonDetails?: string | null;
  notes?: string | null;
};

const BACKUP_REASONS: RosterBackupReason[] = ["LEAVE", "SICK", "PERMISSION", "TRAINING", "OUT_OF_OFFICE", "STAFFING", "OTHER"];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: string) {
  return value.trim();
}

function ensureTime(value: string, label: string) {
  const normalized = text(value);
  if (!TIME_PATTERN.test(normalized)) throw new ValidationError(`${label} harus memakai format HH:MM`);
  return normalized;
}

function ensureDate(value: string) {
  const normalized = text(value);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new ValidationError("Tanggal roster harus memakai format YYYY-MM-DD yang valid");
  }
  return normalized;
}

function databaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) {
    throw new ConflictError("Kode template atau jenis penugasan pada tanggal tersebut sudah ada");
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    throw new ValidationError("Karyawan atau template jadwal tidak valid");
  }
  throw error;
}

function validateAssignment(input: Pick<CreateRosterAssignmentInput, "assignmentType" | "scheduleTemplateId">) {
  if (input.assignmentType === "REGULAR" && !input.scheduleTemplateId) {
    throw new ValidationError("Penugasan reguler wajib memiliki template jadwal");
  }
  if ((input.assignmentType === "OFF" || input.assignmentType === "LEAVE") && input.scheduleTemplateId) {
    throw new ValidationError("Penugasan off atau cuti tidak memakai template jadwal");
  }
}

export function listScheduleTemplates(includeInactive = false) {
  const query = db.select().from(scheduleTemplates);
  return includeInactive
    ? query.orderBy(asc(scheduleTemplates.name)).all()
    : query.where(eq(scheduleTemplates.isActive, true)).orderBy(asc(scheduleTemplates.name)).all();
}

export function getScheduleTemplate(id: string) {
  const record = db.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, id)).get();
  if (!record) throw new NotFoundError("Template jadwal tidak ditemukan");
  return record;
}

export function createScheduleTemplate(input: CreateScheduleTemplateInput) {
  const now = new Date().toISOString();
  const code = text(input.code).toUpperCase();
  const name = text(input.name);
  if (!code || !name) throw new ValidationError("Kode dan nama template wajib diisi");
  try {
    return db.insert(scheduleTemplates).values({
      id: crypto.randomUUID(),
      code,
      name,
      kind: input.kind ?? "REGULAR",
      startTime: ensureTime(input.startTime, "Jam mulai"),
      endTime: ensureTime(input.endTime, "Jam selesai"),
      graceMinutes: input.graceMinutes ?? 0,
      crossesMidnight: input.crossesMidnight ?? false,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).returning().get();
  } catch (error) {
    databaseError(error);
  }
}

export function updateScheduleTemplate(id: string, input: UpdateScheduleTemplateInput) {
  getScheduleTemplate(id);
  try {
    const updated = db.update(scheduleTemplates).set({
      ...(input.code === undefined ? {} : { code: text(input.code).toUpperCase() }),
      ...(input.name === undefined ? {} : { name: text(input.name) }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.startTime === undefined ? {} : { startTime: ensureTime(input.startTime, "Jam mulai") }),
      ...(input.endTime === undefined ? {} : { endTime: ensureTime(input.endTime, "Jam selesai") }),
      ...(input.graceMinutes === undefined ? {} : { graceMinutes: input.graceMinutes }),
      ...(input.crossesMidnight === undefined ? {} : { crossesMidnight: input.crossesMidnight }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      updatedAt: new Date().toISOString()
    }).where(eq(scheduleTemplates.id, id)).returning().get();
    if (!updated) throw new NotFoundError("Template jadwal tidak ditemukan");
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    databaseError(error);
  }
}

export function listRoster(input: { from: string; to: string; employeeId?: number }) {
  const from = ensureDate(input.from);
  const to = ensureDate(input.to);
  if (from > to) throw new ValidationError("Tanggal mulai tidak boleh melebihi tanggal akhir");
  const conditions = [
    gte(rosterAssignments.assignmentDate, from),
    lte(rosterAssignments.assignmentDate, to),
    ...(input.employeeId === undefined ? [] : [eq(rosterAssignments.employeeId, input.employeeId)])
  ];
  return db.select({
    id: rosterAssignments.id,
    employeeId: employees.id,
    employeeCode: employees.employeeCode,
    employeeName: employees.name,
    departmentName: departments.name,
    assignmentDate: rosterAssignments.assignmentDate,
    assignmentType: rosterAssignments.assignmentType,
    scheduleTemplateId: rosterAssignments.scheduleTemplateId,
    scheduleTemplateCode: scheduleTemplates.code,
    scheduleTemplateName: scheduleTemplates.name,
    startTime: scheduleTemplates.startTime,
    endTime: scheduleTemplates.endTime,
    crossesMidnight: scheduleTemplates.crossesMidnight,
    notes: rosterAssignments.notes,
    createdAt: rosterAssignments.createdAt,
    updatedAt: rosterAssignments.updatedAt
  }).from(rosterAssignments)
    .innerJoin(employees, eq(rosterAssignments.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(scheduleTemplates, eq(rosterAssignments.scheduleTemplateId, scheduleTemplates.id))
    .where(and(...conditions))
    .orderBy(asc(rosterAssignments.assignmentDate), asc(employees.name), asc(rosterAssignments.assignmentType))
    .all();
}

export function listRosterBackups(input: { from: string; to: string }) {
  const from = ensureDate(input.from);
  const to = ensureDate(input.to);
  if (from > to) throw new ValidationError("Tanggal mulai tidak boleh melebihi tanggal akhir");
  return db.select().from(rosterBackupAssignments)
    .where(and(lte(rosterBackupAssignments.startDate, to), gte(rosterBackupAssignments.endDate, from)))
    .orderBy(asc(rosterBackupAssignments.startDate), asc(rosterBackupAssignments.endDate))
    .all();
}

export function createRosterBackup(input: CreateRosterBackupInput, createdByEmployeeId: number) {
  const startDate = ensureDate(input.startDate);
  const endDate = ensureDate(input.endDate);
  if (startDate > endDate) throw new ValidationError("Tanggal akhir backup tidak boleh sebelum tanggal mulai");
  if (input.coveredEmployeeId === input.backupEmployeeId) throw new ValidationError("Karyawan backup harus berbeda dari karyawan yang digantikan");
  if (!BACKUP_REASONS.includes(input.reason)) throw new ValidationError("Alasan backup tidak valid");
  if (input.reason === "OTHER" && !input.reasonDetails?.trim()) throw new ValidationError("Jelaskan alasan saat memilih Lainnya");
  const targets = db.select({ id: employees.id, isActive: employees.isActive }).from(employees)
    .where(inArray(employees.id, [input.coveredEmployeeId, input.backupEmployeeId])).all();
  if (targets.length !== 2 || targets.some((employee) => !employee.isActive)) {
    throw new NotFoundError("Karyawan pengganti atau yang digantikan tidak aktif");
  }
  const now = new Date().toISOString();
  return db.insert(rosterBackupAssignments).values({
    id: crypto.randomUUID(),
    coveredEmployeeId: input.coveredEmployeeId,
    backupEmployeeId: input.backupEmployeeId,
    startDate,
    endDate,
    reason: input.reason,
    reasonDetails: input.reasonDetails?.trim() || null,
    notes: input.notes?.trim() || null,
    createdByEmployeeId,
    createdAt: now,
    updatedAt: now
  }).returning().get();
}

export function deleteRosterBackup(id: string) {
  const deleted = db.delete(rosterBackupAssignments).where(eq(rosterBackupAssignments.id, id))
    .returning({ id: rosterBackupAssignments.id }).get();
  if (!deleted) throw new NotFoundError("Penugasan backup tidak ditemukan");
  return { success: true };
}

function getRosterAssignment(id: string) {
  const record = db.select().from(rosterAssignments).where(eq(rosterAssignments.id, id)).get();
  if (!record) throw new NotFoundError("Penugasan roster tidak ditemukan");
  return record;
}

export function createRosterAssignment(input: CreateRosterAssignmentInput, createdByEmployeeId: number) {
  const assignmentDate = ensureDate(input.assignmentDate);
  validateAssignment(input);
  const now = new Date().toISOString();
  try {
    return db.insert(rosterAssignments).values({
      id: crypto.randomUUID(),
      employeeId: input.employeeId,
      assignmentDate,
      assignmentType: input.assignmentType,
      scheduleTemplateId: input.scheduleTemplateId ?? null,
      notes: input.notes ? text(input.notes) : null,
      createdByEmployeeId,
      createdAt: now,
      updatedAt: now
    }).returning().get();
  } catch (error) {
    databaseError(error);
  }
}

export function bulkUpsertRosterAssignments(inputs: BulkRosterAssignmentInput[], createdByEmployeeId: number, replaceBaseSchedule = false) {
  if (inputs.length === 0) throw new ValidationError("Pilih minimal satu sel roster");
  const normalized = inputs.map((input) => {
    const assignmentDate = ensureDate(input.assignmentDate);
    validateAssignment(input);
    return {
      ...input,
      assignmentDate,
      scheduleTemplateId: input.scheduleTemplateId ?? null,
      notes: input.notes ? text(input.notes) : null
    };
  });
  const keys = normalized.map((input) => `${input.employeeId}|${input.assignmentDate}|${input.assignmentType}`);
  if (new Set(keys).size !== keys.length) throw new ValidationError("Pilihan roster memuat sel yang sama lebih dari sekali");

  try {
    return db.transaction((tx) => {
      const now = new Date().toISOString();
      let created = 0;
      let updated = 0;
      const records = normalized.map((input) => {
        if (replaceBaseSchedule && (input.assignmentType === "REGULAR" || input.assignmentType === "OFF")) {
          tx.delete(rosterAssignments).where(and(
            eq(rosterAssignments.employeeId, input.employeeId),
            eq(rosterAssignments.assignmentDate, input.assignmentDate),
            inArray(rosterAssignments.assignmentType, ["REGULAR", "OFF"])
          )).run();
        }
        const existing = tx.select({ id: rosterAssignments.id }).from(rosterAssignments).where(and(
          eq(rosterAssignments.employeeId, input.employeeId),
          eq(rosterAssignments.assignmentDate, input.assignmentDate),
          eq(rosterAssignments.assignmentType, input.assignmentType)
        )).get();
        if (existing) {
          updated += 1;
          return tx.update(rosterAssignments).set({
            scheduleTemplateId: input.scheduleTemplateId,
            notes: input.notes,
            updatedAt: now
          }).where(eq(rosterAssignments.id, existing.id)).returning().get();
        }
        created += 1;
        return tx.insert(rosterAssignments).values({
          id: crypto.randomUUID(),
          employeeId: input.employeeId,
          assignmentDate: input.assignmentDate,
          assignmentType: input.assignmentType,
          scheduleTemplateId: input.scheduleTemplateId,
          notes: input.notes,
          createdByEmployeeId,
          createdAt: now,
          updatedAt: now
        }).returning().get();
      });
      return { success: true, count: records.length, created, updated, records };
    });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    databaseError(error);
  }
}

export function bulkDeleteRosterAssignments(ids: string[]) {
  if (ids.length === 0) throw new ValidationError("Tidak ada penugasan roster yang dipilih");
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length) throw new ValidationError("Daftar penugasan memuat ID yang sama lebih dari sekali");
  return db.transaction((tx) => {
    for (const id of uniqueIds) {
      const existing = tx.select({ id: rosterAssignments.id }).from(rosterAssignments).where(eq(rosterAssignments.id, id)).get();
      if (!existing) throw new NotFoundError("Salah satu penugasan roster tidak ditemukan; tidak ada data yang dihapus");
    }
    for (const id of uniqueIds) tx.delete(rosterAssignments).where(eq(rosterAssignments.id, id)).run();
    return { success: true, count: uniqueIds.length };
  });
}

export function updateRosterAssignment(id: string, input: UpdateRosterAssignmentInput) {
  const current = getRosterAssignment(id);
  const next = {
    assignmentType: input.assignmentType ?? current.assignmentType,
    scheduleTemplateId: input.scheduleTemplateId === undefined ? current.scheduleTemplateId : input.scheduleTemplateId
  };
  validateAssignment(next);
  try {
    const updated = db.update(rosterAssignments).set({
      ...(input.assignmentDate === undefined ? {} : { assignmentDate: ensureDate(input.assignmentDate) }),
      ...(input.assignmentType === undefined ? {} : { assignmentType: input.assignmentType }),
      ...(input.scheduleTemplateId === undefined ? {} : { scheduleTemplateId: input.scheduleTemplateId }),
      ...(input.notes === undefined ? {} : { notes: input.notes ? text(input.notes) : null }),
      updatedAt: new Date().toISOString()
    }).where(eq(rosterAssignments.id, id)).returning().get();
    if (!updated) throw new NotFoundError("Penugasan roster tidak ditemukan");
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    databaseError(error);
  }
}

export function deleteRosterAssignment(id: string) {
  const deleted = db.delete(rosterAssignments).where(eq(rosterAssignments.id, id)).returning({ id: rosterAssignments.id }).get();
  if (!deleted) throw new NotFoundError("Penugasan roster tidak ditemukan");
  return { success: true };
}
