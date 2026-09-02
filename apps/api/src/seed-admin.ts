import { or, eq } from "drizzle-orm";
import { db } from "./db/connection";
import { employees } from "./db/schema";

const email = Bun.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = Bun.env.ADMIN_PASSWORD;
const name = Bun.env.ADMIN_NAME?.trim() || "Administrator";
const employeeCode = Bun.env.ADMIN_CODE?.trim() || "ADMIN001";

if (!email || !password) {
  console.error("ADMIN_EMAIL dan ADMIN_PASSWORD wajib diisi.");
  console.error("Contoh: $env:ADMIN_EMAIL='admin@example.com'; $env:ADMIN_PASSWORD='kata-sandi-kuat'; bun run seed:admin");
  process.exit(1);
}

if (password.length < 12) {
  console.error("ADMIN_PASSWORD minimal 12 karakter.");
  process.exit(1);
}

const now = new Date().toISOString();
const passwordHash = await Bun.password.hash(password);
const existing = db.select({ id: employees.id }).from(employees)
  .where(or(eq(employees.email, email), eq(employees.employeeCode, employeeCode)))
  .get();

if (existing) {
  db.update(employees).set({
    email,
    name,
    role: "ADMIN",
    passwordHash,
    isActive: true,
    updatedAt: now
  }).where(eq(employees.id, existing.id)).run();
  console.log(`Admin diperbarui: ${email}`);
} else {
  db.insert(employees).values({
    employeeCode,
    name,
    email,
    siteId: "site-default",
    departmentId: null,
    role: "ADMIN",
    passwordHash,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run();
  console.log(`Admin dibuat: ${email}`);
}
