import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { requirePermission } from "./auth";
import { enrichEventsWithEmployeeNames, getAttendanceByRange, getAttendanceCount, getAttendanceCountByRange, getAttendanceRange, getPublicAttendanceDisplay, getRecentAttendance, persistDeviceEvents } from "./database";
import { AppError } from "./errors";
import { parseDeviceRequest } from "./parser";
import { authRoutes } from "./routes/auth";
import { attendanceRulesRoutes } from "./routes/attendance-rules";
import { evaluateEmployeeDay } from "./repositories/attendance-rules";
import { masterDataRoutes } from "./routes/master-data";
import { schedulingRoutes } from "./routes/scheduling";
import { leaveRoutes } from "./routes/leave";
import { addEvents, clearEvents, listEvents } from "./store";

const webOrigins = (Bun.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

type PublicEventType = "IN" | "OUT" | "SCAN";

function publicAttendanceResult(eventType: PublicEventType, evaluation: ReturnType<typeof evaluateEmployeeDay>) {
  if (eventType === "IN") {
    if (!evaluation.scheduledStartAt) return { note: "Scan masuk tercatat", tone: "neutral" as const };
    if (evaluation.lateMinutes > 0) {
      return { note: `Terlambat ${evaluation.lateMinutes} menit`, tone: "warning" as const };
    }
    return { note: "Masuk tepat waktu", tone: "success" as const };
  }

  if (eventType === "OUT") {
    if (!evaluation.checkInAt) return { note: "Tidak ada scan masuk", tone: "warning" as const };
    if (!evaluation.scheduledEndAt) return { note: "Scan keluar tercatat", tone: "neutral" as const };
    if (evaluation.earlyLeaveMinutes > 0) {
      return { note: `Pulang ${evaluation.earlyLeaveMinutes} menit lebih awal`, tone: "warning" as const };
    }
    if (evaluation.overtimeMinutes > 0) {
      return { note: `Lewat jadwal ${evaluation.overtimeMinutes} menit`, tone: "info" as const };
    }
    return { note: "Pulang sesuai jadwal", tone: "success" as const };
  }

  return { note: "Scan tambahan tercatat", tone: "neutral" as const };
}

export const app = new Elysia()
  .use(cors({ origin: webOrigins, credentials: true }))
  .onError(({ error, set, code }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return { error: { code: error.code, message: error.message } };
    }
    if (code === "VALIDATION") {
      set.status = 422;
      return { error: { code: "INVALID_PAYLOAD", message: "Payload tidak valid" } };
    }
    console.error(error);
    set.status = 500;
    return { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server" } };
  })
  .use(authRoutes)
  .use(masterDataRoutes)
  .use(schedulingRoutes)
  .use(leaveRoutes)
  .use(attendanceRulesRoutes)
  .get("/health", () => ({ status: "ok", time: new Date().toISOString() }))
  .get("/api/public/attendance-display", ({ set }) => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Makassar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const date = formatter.format(new Date());
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const to = nextDate.toISOString().slice(0, 10);
    const previousDateValue = new Date(`${date}T00:00:00.000Z`);
    previousDateValue.setUTCDate(previousDateValue.getUTCDate() - 1);
    const previousDate = previousDateValue.toISOString().slice(0, 10);
    const data = getPublicAttendanceDisplay(`${date} 00:00:00`, `${to} 00:00:00`, 10);
    const evaluationCache = new Map<string, ReturnType<typeof evaluateEmployeeDay>>();
    const evaluationFor = (employeeId: number, attendanceDate: string) => {
      const key = `${employeeId}:${attendanceDate}`;
      const cached = evaluationCache.get(key);
      if (cached) return cached;
      const evaluation = evaluateEmployeeDay(employeeId, attendanceDate);
      evaluationCache.set(key, evaluation);
      return evaluation;
    };

    set.headers["cache-control"] = "no-store, max-age=0";
    return {
      date,
      timeZone: "Asia/Makassar",
      siteName: data.records[0]?.siteName ?? "Site Sangatta",
      generatedAt: new Date().toISOString(),
      summary: data.summary,
      records: data.records.map(({ employeeId, siteName: _siteName, ...record }) => {
        const previousEvaluation = evaluationFor(employeeId, previousDate);
        const currentEvaluation = evaluationFor(employeeId, date);
        const isCheckOut = previousEvaluation.checkOutAt === record.recordedAt
          || currentEvaluation.checkOutAt === record.recordedAt;
        const isCheckIn = currentEvaluation.checkInAt === record.recordedAt
          || previousEvaluation.checkInAt === record.recordedAt;
        const evaluation = previousEvaluation.checkOutAt === record.recordedAt
          ? previousEvaluation
          : currentEvaluation;

        const eventType: PublicEventType = isCheckOut ? "OUT" : isCheckIn ? "IN" : "SCAN";
        return {
          ...record,
          eventType,
          scheduleName: evaluation.scheduleName,
          ...publicAttendanceResult(eventType, evaluation)
        };
      })
    };
  })
  .get("/api/events", ({ request, query }) => {
    requirePermission(request, "VIEW_ATTENDANCE");
    return { events: enrichEventsWithEmployeeNames(listEvents(Number(query.limit ?? 100))) };
  })
  .get("/api/attendance", ({ request, query }) => {
    requirePermission(request, "VIEW_ATTENDANCE");
    const limit = Number(query.limit ?? 100);
    const records = query.from && query.to
      ? getAttendanceByRange(query.from, query.to, limit)
      : getRecentAttendance(limit);
    const count = query.from && query.to ? getAttendanceCountByRange(query.from, query.to) : records.length;
    return { count, total: getAttendanceCount(), range: getAttendanceRange(), records };
  })
  .delete("/api/events", ({ request }) => {
    requirePermission(request, "MANAGE_MASTER_DATA");
    clearEvents();
    return { success: true };
  })
  .all("/iclock/*", async ({ request }) => {
    const body = await request.text();
    const parsedEvents = parseDeviceRequest({ request, body });
    persistDeviceEvents(parsedEvents);
    const events = addEvents(parsedEvents);
    const url = new URL(request.url);
    const rowCount = body.split(/\r?\n/).filter((line) => line.trim()).length;
    console.log(`[ADMS] ${request.method} ${url.pathname} table=${url.searchParams.get("table") ?? "-"} rows=${rowCount} stored=${events.length}`);
    return request.method === "POST" ? `OK: ${rowCount}` : "OK";
  })
  .all("/device/*", async ({ request }) => {
    const body = await request.text();
    const parsedEvents = parseDeviceRequest({ request, body });
    persistDeviceEvents(parsedEvents);
    const events = addEvents(parsedEvents);
    const url = new URL(request.url);
    console.log(`[DEVICE] ${request.method} ${url.pathname} stored=${events.length}`);
    return `OK: ${body.split(/\r?\n/).filter((line) => line.trim()).length}`;
  });

export type App = typeof app;
