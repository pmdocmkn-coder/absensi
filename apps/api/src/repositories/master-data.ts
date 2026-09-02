import { and, asc, eq, like, or } from "drizzle-orm";
import { db } from "../db/connection";
import { departments, deviceUsers, employees, sites, type UserRole } from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";

type DeviceMappingInput = {
  deviceSerial: string;
  deviceUserCode: string;
};

export type CreateEmployeeInput = {
  employeeCode: string;
  name: string;
  email?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  role?: UserRole;
  deviceMappings?: DeviceMappingInput[];
};

export type UpdateEmployeeInput = Partial<Omit<CreateEmployeeInput, "deviceMappings">> & {
  isActive?: boolean;
  deviceMappings?: DeviceMappingInput[];
};

export type EmployeeImportRecord = CreateEmployeeInput;

const employeeSelection = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  name: employees.name,
  email: employees.email,
  role: employees.role,
  isActive: employees.isActive,
  siteId: employees.siteId,
  siteName: sites.name,
  departmentId: employees.departmentId,
  departmentName: departments.name,
  createdAt: employees.createdAt,
  updatedAt: employees.updatedAt
};

function normalized(value: string) {
  return value.trim();
}

function mapDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) {
    throw new ConflictError("Kode, email, atau mapping perangkat sudah digunakan");
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    throw new ValidationError("Site atau departemen tidak valid");
  }
  throw error;
}

export function listSites(includeInactive = false) {
  const query = db.select().from(sites);
  return includeInactive
    ? query.orderBy(asc(sites.name)).all()
    : query.where(eq(sites.isActive, true)).orderBy(asc(sites.name)).all();
}

export function createSite(input: { code: string; name: string; timezone?: string }) {
  const now = new Date().toISOString();
  try {
    return db.insert(sites).values({
      id: crypto.randomUUID(),
      code: normalized(input.code).toUpperCase(),
      name: normalized(input.name),
      timezone: normalized(input.timezone ?? "Asia/Makassar"),
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).returning().get();
  } catch (error) {
    mapDatabaseError(error);
  }
}

export function updateSite(id: string, input: { code?: string; name?: string; timezone?: string; isActive?: boolean }) {
  const values = {
    ...(input.code === undefined ? {} : { code: normalized(input.code).toUpperCase() }),
    ...(input.name === undefined ? {} : { name: normalized(input.name) }),
    ...(input.timezone === undefined ? {} : { timezone: normalized(input.timezone) }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    updatedAt: new Date().toISOString()
  };
  try {
    const updated = db.update(sites).set(values).where(eq(sites.id, id)).returning().get();
    if (!updated) throw new NotFoundError("Site tidak ditemukan");
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    mapDatabaseError(error);
  }
}

export function listDepartments(siteId?: string, includeInactive = false) {
  const conditions = [
    ...(siteId ? [eq(departments.siteId, siteId)] : []),
    ...(!includeInactive ? [eq(departments.isActive, true)] : [])
  ];
  return db.select({
    id: departments.id,
    siteId: departments.siteId,
    siteName: sites.name,
    code: departments.code,
    name: departments.name,
    isActive: departments.isActive,
    createdAt: departments.createdAt,
    updatedAt: departments.updatedAt
  }).from(departments)
    .innerJoin(sites, eq(departments.siteId, sites.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(departments.name))
    .all();
}

export function createDepartment(input: { siteId: string; code: string; name: string }) {
  const now = new Date().toISOString();
  try {
    return db.insert(departments).values({
      id: crypto.randomUUID(),
      siteId: input.siteId,
      code: normalized(input.code).toUpperCase(),
      name: normalized(input.name),
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).returning().get();
  } catch (error) {
    mapDatabaseError(error);
  }
}

export function updateDepartment(id: string, input: { siteId?: string; code?: string; name?: string; isActive?: boolean }) {
  const values = {
    ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
    ...(input.code === undefined ? {} : { code: normalized(input.code).toUpperCase() }),
    ...(input.name === undefined ? {} : { name: normalized(input.name) }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    updatedAt: new Date().toISOString()
  };
  try {
    const updated = db.update(departments).set(values).where(eq(departments.id, id)).returning().get();
    if (!updated) throw new NotFoundError("Departemen tidak ditemukan");
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    mapDatabaseError(error);
  }
}

export function listEmployees(options: { includeInactive?: boolean; search?: string } = {}) {
  const conditions = [
    ...(!options.includeInactive ? [eq(employees.isActive, true)] : []),
    ...(options.search
      ? [or(like(employees.name, `%${options.search}%`), like(employees.employeeCode, `%${options.search}%`))!]
      : [])
  ];

  const records = db.select(employeeSelection)
    .from(employees)
    .leftJoin(sites, eq(employees.siteId, sites.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(employees.name))
    .all();

  if (records.length === 0) return [];
  const mappings = db.select().from(deviceUsers)
    .where(or(...records.map((record) => eq(deviceUsers.employeeId, record.id))))
    .all();
  return records.map((record) => ({
    ...record,
    deviceMappings: mappings.filter((mapping) => mapping.employeeId === record.id)
  }));
}

export function getEmployeeById(id: number) {
  const record = db.select(employeeSelection)
    .from(employees)
    .leftJoin(sites, eq(employees.siteId, sites.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.id, id))
    .get();
  if (!record) throw new NotFoundError("Karyawan tidak ditemukan");
  const mappings = db.select().from(deviceUsers).where(eq(deviceUsers.employeeId, id)).all();
  return { ...record, deviceMappings: mappings };
}

export function createEmployee(input: CreateEmployeeInput) {
  const employeeCode = normalized(input.employeeCode);
  const name = normalized(input.name);
  if (!employeeCode || !name) throw new ValidationError("Kode dan nama karyawan wajib diisi");
  const now = new Date().toISOString();

  try {
    const id = db.transaction((transaction) => {
      const employee = transaction.insert(employees).values({
        employeeCode,
        name,
        email: input.email ? normalized(input.email).toLowerCase() : null,
        siteId: input.siteId ?? "site-default",
        departmentId: input.departmentId ?? null,
        role: input.role ?? "EMPLOYEE",
        isActive: true,
        createdAt: now,
        updatedAt: now
      }).returning({ id: employees.id }).get();

      for (const mapping of input.deviceMappings ?? []) {
        transaction.insert(deviceUsers).values({
          employeeId: employee.id,
          deviceSerial: normalized(mapping.deviceSerial),
          deviceUserCode: normalized(mapping.deviceUserCode),
          source: "ADMIN",
          createdAt: now,
          updatedAt: now
        }).run();
      }
      return employee.id;
    });
    return getEmployeeById(id);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export function updateEmployee(id: number, input: UpdateEmployeeInput) {
  getEmployeeById(id);
  const now = new Date().toISOString();
  try {
    db.transaction((transaction) => {
      transaction.update(employees).set({
        ...(input.employeeCode === undefined ? {} : { employeeCode: normalized(input.employeeCode) }),
        ...(input.name === undefined ? {} : { name: normalized(input.name) }),
        ...(input.email === undefined ? {} : { email: input.email ? normalized(input.email).toLowerCase() : null }),
        ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
        ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        updatedAt: now
      }).where(eq(employees.id, id)).run();

      if (input.deviceMappings) {
        transaction.delete(deviceUsers).where(eq(deviceUsers.employeeId, id)).run();
        for (const mapping of input.deviceMappings) {
          transaction.insert(deviceUsers).values({
            employeeId: id,
            deviceSerial: normalized(mapping.deviceSerial),
            deviceUserCode: normalized(mapping.deviceUserCode),
            source: "ADMIN",
            createdAt: now,
            updatedAt: now
          }).run();
        }
      }
    });
    return getEmployeeById(id);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export function importEmployees(records: EmployeeImportRecord[]) {
  const report = {
    total: records.length,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ employeeCode: string; message: string }>
  };

  for (const record of records) {
    try {
      const existing = db.select({ id: employees.id })
        .from(employees)
        .where(eq(employees.employeeCode, normalized(record.employeeCode)))
        .get();
      if (existing) {
        updateEmployee(existing.id, record);
        report.updated += 1;
      } else {
        createEmployee(record);
        report.created += 1;
      }
    } catch (error) {
      report.failed += 1;
      report.errors.push({
        employeeCode: record.employeeCode,
        message: error instanceof Error ? error.message : "Gagal mengimpor karyawan"
      });
    }
  }

  return report;
}
