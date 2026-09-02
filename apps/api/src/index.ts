import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { parseDeviceRequest } from "./parser";
import { addEvents, clearEvents, listEvents } from "./store";
import { enrichEventsWithEmployeeNames, getAttendanceByRange, getAttendanceCount, getAttendanceCountByRange, getAttendanceRange, getRecentAttendance, persistDeviceEvents } from "./database";

const port = Number(Bun.env.API_PORT ?? 8080);

const app = new Elysia()
  .use(cors())
  .get("/health", () => ({ status: "ok", time: new Date().toISOString() }))
  .get("/api/events", ({ query }) => ({
    events: enrichEventsWithEmployeeNames(listEvents(Number(query.limit ?? 100)))
  }))
  .get("/api/attendance", ({ query }) => {
    const limit = Number(query.limit ?? 100);
    const records = query.from && query.to
      ? getAttendanceByRange(query.from, query.to, limit)
      : getRecentAttendance(limit);
    const count = query.from && query.to ? getAttendanceCountByRange(query.from, query.to) : records.length;
    return { count, total: getAttendanceCount(), range: getAttendanceRange(), records };
  })
  .delete("/api/events", () => {
    clearEvents();
    return { success: true };
  })
  // Common ZKTeco-style ADMS paths. Raw requests are retained so the parser can
  // be adjusted safely after observing the exact firmware payload.
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
  // Diagnostic fallback for firmware that uses a different path.
  .all("/device/*", async ({ request }) => {
    const body = await request.text();
    const parsedEvents = parseDeviceRequest({ request, body });
    persistDeviceEvents(parsedEvents);
    const events = addEvents(parsedEvents);
    const url = new URL(request.url);
    console.log(`[DEVICE] ${request.method} ${url.pathname} stored=${events.length}`);
    return `OK: ${body.split(/\r?\n/).filter((line) => line.trim()).length}`;
  })
  .listen({ hostname: "0.0.0.0", port });

console.log(`X105 receiver running at http://0.0.0.0:${app.server?.port}`);

export type App = typeof app;
