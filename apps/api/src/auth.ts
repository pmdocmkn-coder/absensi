import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "./db/connection";
import { employees, sessions, type UserRole } from "./db/schema";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { roleCan, type Permission } from "./authorization";

export { roleCan, type Permission } from "./authorization";

export const SESSION_COOKIE_NAME = "attendance_session";
const sessionTtlSeconds = Number(Bun.env.SESSION_TTL_SECONDS ?? 28_800);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readSessionToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [name, ...valueParts] = item.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export type AuthContext = {
  sessionId: string;
  employeeId: number;
  employeeCode: string;
  name: string;
  email: string | null;
  role: UserRole;
};

export function getAuthContext(request: Request): AuthContext | null {
  const token = readSessionToken(request);
  if (!token) return null;
  const now = new Date().toISOString();

  return db.select({
    sessionId: sessions.id,
    employeeId: employees.id,
    employeeCode: employees.employeeCode,
    name: employees.name,
    email: employees.email,
    role: employees.role
  }).from(sessions)
    .innerJoin(employees, eq(sessions.employeeId, employees.id))
    .where(and(
      eq(sessions.tokenHash, hashToken(token)),
      gt(sessions.expiresAt, now),
      isNull(sessions.revokedAt),
      eq(employees.isActive, true)
    ))
    .get() ?? null;
}

export function requireAuth(request: Request) {
  const auth = getAuthContext(request);
  if (!auth) throw new UnauthorizedError();
  return auth;
}

export function requirePermission(request: Request, permission: Permission) {
  const auth = requireAuth(request);
  if (!roleCan(auth.role, permission)) throw new ForbiddenError();
  return auth;
}

export async function login(input: {
  identifier: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const identifier = input.identifier.trim().toLowerCase();
  const employee = db.select().from(employees)
    .where(and(
      or(
        eq(employees.employeeCode, identifier),
        eq(employees.email, identifier)
      ),
      eq(employees.isActive, true)
    ))
    .get();

  if (!employee?.passwordHash || !await Bun.password.verify(input.password, employee.passwordHash)) {
    throw new UnauthorizedError("Kode/email atau kata sandi salah");
  }

  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000);
  const sessionId = crypto.randomUUID();

  db.delete(sessions).where(or(
    eq(sessions.employeeId, employee.id),
    lt(sessions.expiresAt, createdAt.toISOString())
  )).run();

  db.insert(sessions).values({
    id: sessionId,
    employeeId: employee.id,
    tokenHash: hashToken(token),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdAt: createdAt.toISOString(),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  }).run();

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      role: employee.role
    }
  };
}

export function logout(request: Request) {
  const token = readSessionToken(request);
  if (!token) return;
  db.update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
}

export function createSessionCookie(token: string, maxAge = sessionTtlSeconds) {
  const secure = Bun.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
