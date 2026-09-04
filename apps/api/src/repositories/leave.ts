import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/connection";
import { departments, employees, leaveRequests, rosterAssignments, type LeaveStatus, type LeaveType } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";

function databaseError(error: unknown): never {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    throw new ValidationError("Data konflik atau sudah ada dalam sistem");
  }
  throw error;
}

const LEAVE_TYPES: LeaveType[] = ["ANNUAL", "SICK", "FAMILY", "MATERNITY", "SPECIAL"];
const LEAVE_STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "REJECTED"];

function ensureDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("Format tanggal harus YYYY-MM-DD");
  return value;
}

function calculateDays(start: string, end: string) {
  const d1 = new Date(`${start}T00:00:00Z`);
  const d2 = new Date(`${end}T00:00:00Z`);
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
  return diff + 1;
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (current <= stop) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export type CreateLeaveInput = {
  employeeId: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status?: LeaveStatus;
};

export function listLeaveRequests(filter: { from?: string; to?: string; status?: string; employeeId?: number }) {
  const conditions = [];
  if (filter.from) conditions.push(gte(leaveRequests.endDate, ensureDate(filter.from)));
  if (filter.to) conditions.push(lte(leaveRequests.startDate, ensureDate(filter.to)));
  if (filter.status && LEAVE_STATUSES.includes(filter.status as LeaveStatus)) {
    conditions.push(eq(leaveRequests.status, filter.status as LeaveStatus));
  }
  if (filter.employeeId !== undefined) {
    conditions.push(eq(leaveRequests.employeeId, filter.employeeId));
  }

  const query = db.select({
    id: leaveRequests.id,
    employeeId: employees.id,
    employeeCode: employees.employeeCode,
    employeeName: employees.name,
    departmentName: departments.name,
    leaveType: leaveRequests.leaveType,
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    totalDays: leaveRequests.totalDays,
    reason: leaveRequests.reason,
    status: leaveRequests.status,
    approvedByEmployeeId: leaveRequests.approvedByEmployeeId,
    createdAt: leaveRequests.createdAt,
    updatedAt: leaveRequests.updatedAt
  }).from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leaveRequests.createdAt), asc(leaveRequests.startDate));

  return query.all();
}

export function createLeaveRequest(input: CreateLeaveInput, createdByEmployeeId: number) {
  const startDate = ensureDate(input.startDate);
  const endDate = ensureDate(input.endDate);
  if (startDate > endDate) throw new ValidationError("Tanggal selesai tidak boleh sebelum tanggal mulai");
  if (!LEAVE_TYPES.includes(input.leaveType)) throw new ValidationError("Jenis cuti tidak valid");
  if (!input.reason?.trim()) throw new ValidationError("Alasan cuti wajib diisi");

  const employee = db.select({ id: employees.id, isActive: employees.isActive }).from(employees)
    .where(eq(employees.id, input.employeeId)).get();
  if (!employee || !employee.isActive) throw new NotFoundError("Karyawan tidak ditemukan atau sudah tidak aktif");

  const totalDays = calculateDays(startDate, endDate);
  const status: LeaveStatus = input.status ?? "APPROVED";
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    return db.transaction((tx) => {
      const created = tx.insert(leaveRequests).values({
        id,
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        startDate,
        endDate,
        totalDays,
        reason: input.reason.trim(),
        status,
        approvedByEmployeeId: status === "APPROVED" ? createdByEmployeeId : null,
        createdAt: now,
        updatedAt: now
      }).returning().get();

      // If approved, automatically apply LEAVE roster assignments for each day
      if (status === "APPROVED") {
        const dates = getDateRange(startDate, endDate);
        for (const date of dates) {
          const existing = tx.select({ id: rosterAssignments.id }).from(rosterAssignments).where(and(
            eq(rosterAssignments.employeeId, input.employeeId),
            eq(rosterAssignments.assignmentDate, date),
            eq(rosterAssignments.assignmentType, "LEAVE")
          )).get();

          if (existing) {
            tx.update(rosterAssignments).set({
              notes: "Sedang Cuti",
              updatedAt: now
            }).where(eq(rosterAssignments.id, existing.id)).run();
          } else {
            tx.insert(rosterAssignments).values({
              id: crypto.randomUUID(),
              employeeId: input.employeeId,
              assignmentDate: date,
              assignmentType: "LEAVE",
              scheduleTemplateId: null,
              notes: "Sedang Cuti",
              createdByEmployeeId,
              createdAt: now,
              updatedAt: now
            }).run();
          }
        }
      }

      return created;
    });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    databaseError(error);
  }
}

export function updateLeaveStatus(id: string, status: LeaveStatus, approvedByEmployeeId: number) {
  if (!LEAVE_STATUSES.includes(status)) throw new ValidationError("Status cuti tidak valid");
  const record = db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).get();
  if (!record) throw new NotFoundError("Pengajuan cuti tidak ditemukan");

  const now = new Date().toISOString();

  try {
    return db.transaction((tx) => {
      const updated = tx.update(leaveRequests).set({
        status,
        approvedByEmployeeId: status === "APPROVED" ? approvedByEmployeeId : null,
        updatedAt: now
      }).where(eq(leaveRequests.id, id)).returning().get();

      const dates = getDateRange(record.startDate, record.endDate);

      if (status === "APPROVED") {
        for (const date of dates) {
          const existing = tx.select({ id: rosterAssignments.id }).from(rosterAssignments).where(and(
            eq(rosterAssignments.employeeId, record.employeeId),
            eq(rosterAssignments.assignmentDate, date),
            eq(rosterAssignments.assignmentType, "LEAVE")
          )).get();

          if (!existing) {
            tx.insert(rosterAssignments).values({
              id: crypto.randomUUID(),
              employeeId: record.employeeId,
              assignmentDate: date,
              assignmentType: "LEAVE",
              scheduleTemplateId: null,
              notes: "Sedang Cuti",
              createdByEmployeeId: approvedByEmployeeId,
              createdAt: now,
              updatedAt: now
            }).run();
          }
        }
      } else {
        // Remove LEAVE assignments if rejected or set back to pending
        for (const date of dates) {
          tx.delete(rosterAssignments).where(and(
            eq(rosterAssignments.employeeId, record.employeeId),
            eq(rosterAssignments.assignmentDate, date),
            eq(rosterAssignments.assignmentType, "LEAVE")
          )).run();
        }
      }

      return updated;
    });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    databaseError(error);
  }
}

export function deleteLeaveRequest(id: string) {
  const record = db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).get();
  if (!record) throw new NotFoundError("Pengajuan cuti tidak ditemukan");

  const dates = getDateRange(record.startDate, record.endDate);
  db.transaction((tx) => {
    for (const date of dates) {
      tx.delete(rosterAssignments).where(and(
        eq(rosterAssignments.employeeId, record.employeeId),
        eq(rosterAssignments.assignmentDate, date),
        eq(rosterAssignments.assignmentType, "LEAVE")
      )).run();
    }
    tx.delete(leaveRequests).where(eq(leaveRequests.id, id)).run();
  });

  return { success: true };
}
