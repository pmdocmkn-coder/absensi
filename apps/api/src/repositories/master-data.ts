import { and, asc, eq, like, or } from "drizzle-orm";
import { db } from "../db/connection";
import { departments, deviceUsers, employees, employeeWorkModes, sites, type UserRole } from "../db/schema";
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

export type EmployeeSetupImportRecord = {
  employeeCode: string;
  name: string;
  email?: string | null;
  siteId?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  role?: UserRole;
  deviceSerial?: string | null;
  deviceUserCode?: string | null;
  rosterGroup?: string | null;
};

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
  departmentCode: departments.code,
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

export function importEmployeeSetup(records: EmployeeSetupImportRecord[]) {
  const prepared = records.map((record, index) => {
    const employeeCode = normalized(record.employeeCode);
    const name = normalized(record.name);
    const deviceSerial = record.deviceSerial?.trim() || null;
    const deviceUserCode = record.deviceUserCode?.trim() || null;
    if (!employeeCode || !name) throw new ValidationError(`Baris ${index + 2}: kode dan nama karyawan wajib diisi`);
    if (Boolean(deviceSerial) !== Boolean(deviceUserCode)) throw new ValidationError(`Baris ${index + 2}: serial dan PIN X105 harus diisi bersama`);
    return {
      ...record,
      employeeCode,
      name,
      email: record.email === undefined ? undefined : record.email?.trim().toLowerCase() || null,
      siteId: record.siteId?.trim() || "site-default",
      departmentCode: record.departmentCode?.trim().toUpperCase() || null,
      departmentName: record.departmentName?.trim() || null,
      deviceSerial,
      deviceUserCode,
      rosterGroup: record.rosterGroup?.trim() || null
    };
  });

  const duplicateCodes = prepared.filter((record, index) => prepared.findIndex((item) => item.employeeCode.toLowerCase() === record.employeeCode.toLowerCase()) !== index);
  if (duplicateCodes.length) throw new ValidationError(`Kode karyawan duplikat di file: ${duplicateCodes[0]!.employeeCode}`);
  const mappingKeys = prepared.map((record) => record.deviceSerial && record.deviceUserCode ? `${record.deviceSerial}\u0000${record.deviceUserCode}`.toLowerCase() : null);
  const duplicateMappingIndex = mappingKeys.findIndex((key, index) => key !== null && mappingKeys.indexOf(key) !== index);
  if (duplicateMappingIndex >= 0) throw new ValidationError(`Mapping X105 duplikat di file pada baris ${duplicateMappingIndex + 2}`);

  try {
    return db.transaction((transaction) => {
      const now = new Date().toISOString();
      const knownEmployees = transaction.select({ id: employees.id, employeeCode: employees.employeeCode }).from(employees).all();
      const employeeByCode = new Map(knownEmployees.map((employee) => [employee.employeeCode.toLowerCase(), employee]));
      const knownMappings = transaction.select().from(deviceUsers).all();
      const mappingByIdentity = new Map(knownMappings.map((mapping) => [`${mapping.deviceSerial}\u0000${mapping.deviceUserCode}`.toLowerCase(), mapping]));
      const knownDepartments = transaction.select().from(departments).all();
      const departmentBySiteCode = new Map(knownDepartments.map((department) => [`${department.siteId}\u0000${department.code}`.toLowerCase(), department]));
      const processedEmployeeIds = new Set<number>();
      const report = { total: prepared.length, created: 0, updated: 0, departmentsCreated: 0, mappingsAdded: 0, rosterConfigured: 0 };

      for (const [index, record] of prepared.entries()) {
        let departmentId: string | null | undefined = undefined;
        if (record.departmentCode) {
          const departmentKey = `${record.siteId}\u0000${record.departmentCode}`.toLowerCase();
          let department = departmentBySiteCode.get(departmentKey);
          if (!department) {
            department = transaction.insert(departments).values({
              id: crypto.randomUUID(),
              siteId: record.siteId,
              code: record.departmentCode,
              name: record.departmentName || record.departmentCode,
              isActive: true,
              createdAt: now,
              updatedAt: now
            }).returning().get();
            departmentBySiteCode.set(departmentKey, department);
            report.departmentsCreated += 1;
          }
          departmentId = department.id;
        }

        const byCode = employeeByCode.get(record.employeeCode.toLowerCase());
        const mappingKey = record.deviceSerial && record.deviceUserCode ? `${record.deviceSerial}\u0000${record.deviceUserCode}`.toLowerCase() : null;
        const mapped = mappingKey ? mappingByIdentity.get(mappingKey) : undefined;
        if (byCode && mapped && byCode.id !== mapped.employeeId) {
          throw new ConflictError(`Baris ${index + 2}: kode karyawan dan PIN terhubung ke dua karyawan berbeda`);
        }

        const employeeId = byCode?.id ?? mapped?.employeeId ?? transaction.insert(employees).values({
          employeeCode: record.employeeCode,
          name: record.name,
          email: record.email ?? null,
          siteId: record.siteId,
          departmentId: departmentId ?? null,
          role: record.role ?? "EMPLOYEE",
          isActive: true,
          createdAt: now,
          updatedAt: now
        }).returning({ id: employees.id }).get().id;
        if (processedEmployeeIds.has(employeeId)) throw new ConflictError(`Baris ${index + 2}: karyawan yang sama muncul lebih dari sekali di file`);
        processedEmployeeIds.add(employeeId);

        if (byCode || mapped) {
          transaction.update(employees).set({
            employeeCode: record.employeeCode,
            name: record.name,
            ...(record.email === undefined ? {} : { email: record.email }),
            siteId: record.siteId,
            ...(departmentId === undefined ? {} : { departmentId }),
            ...(record.role === undefined ? {} : { role: record.role }),
            isActive: true,
            updatedAt: now
          }).where(eq(employees.id, employeeId)).run();
          report.updated += 1;
        } else {
          report.created += 1;
        }
        employeeByCode.set(record.employeeCode.toLowerCase(), { id: employeeId, employeeCode: record.employeeCode });

        if (mappingKey && record.deviceSerial && record.deviceUserCode && !mapped) {
          const newMapping = transaction.insert(deviceUsers).values({
            employeeId,
            deviceSerial: record.deviceSerial,
            deviceUserCode: record.deviceUserCode,
            source: "ADMIN_IMPORT",
            createdAt: now,
            updatedAt: now
          }).returning().get();
          mappingByIdentity.set(mappingKey, newMapping);
          report.mappingsAdded += 1;
        }

        if (record.rosterGroup) {
          transaction.insert(employeeWorkModes).values({
            employeeId,
            mode: "ROSTER",
            rosterGroup: record.rosterGroup,
            createdAt: now,
            updatedAt: now
          }).onConflictDoUpdate({
            target: employeeWorkModes.employeeId,
            set: { mode: "ROSTER", rosterGroup: record.rosterGroup, updatedAt: now }
          }).run();
          report.rosterConfigured += 1;
        }
      }
      return report;
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ConflictError) throw error;
    mapDatabaseError(error);
  }
}
