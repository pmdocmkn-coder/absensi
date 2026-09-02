import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { requirePermission } from "./auth";
import { enrichEventsWithEmployeeNames, getAttendanceByRange, getAttendanceCount, getAttendanceCountByRange, getAttendanceRange, getRecentAttendance, persistDeviceEvents } from "./database";
import { AppError } from "./errors";
import { parseDeviceRequest } from "./parser";
import { authRoutes } from "./routes/auth";
import { masterDataRoutes } from "./routes/master-data";
import { schedulingRoutes } from "./routes/scheduling";
import { addEvents, clearEvents, listEvents } from "./store";

const webOrigins = (Bun.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

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
  .get("/health", () => ({ status: "ok", time: new Date().toISOString() }))
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
