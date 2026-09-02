import type { DeviceEvent } from "./types";

const serialKeys = ["SN", "sn", "serial", "deviceSerial"];

function firstQueryValue(query: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (query[key]) return query[key];
  }
  return null;
}

export function parseDeviceRequest(input: {
  request: Request;
  body: string;
}): DeviceEvent[] {
  const url = new URL(input.request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const isSimulator = input.request.headers.get("x-attendance-simulator") === "1";
  const base = {
    receivedAt: new Date().toISOString(),
    method: input.request.method,
    path: url.pathname,
    query,
    headers: Object.fromEntries(input.request.headers.entries()),
    deviceSerial: firstQueryValue(query, serialKeys),
    source: isSimulator ? "simulator" as const : url.pathname.includes("iclock") ? "x105" as const : "unknown" as const
  };

  const lines = input.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (query.table === "ATTLOG") {
    return lines.map((line) => {
      const columns = line.split("\t").map((value) => value.trim());
      return {
        ...base,
        id: crypto.randomUUID(),
        body: line,
        employeeCode: columns[0] || null,
        recordedAt: columns[1] || null,
        attendanceStatus: Number.isFinite(Number(columns[2])) ? Number(columns[2]) : null,
        verificationType: Number.isFinite(Number(columns[3])) ? Number(columns[3]) : null
      };
    });
  }

  const safeLines = lines.flatMap((line) => {
    if (line.startsWith("FP ") || line.includes("\tTMP=")) return [];
    if (!line.startsWith("USER ")) return [line];

    const pin = line.match(/(?:^|\s)PIN=([^\t]+)/)?.[1] ?? "";
    const name = line.match(/(?:^|\t)Name=([^\t]*)/)?.[1] ?? "";
    return [`USER PIN=${pin}\tName=${name}`];
  });

  if (safeLines.length > 0) {
    return safeLines.map((line) => {
      const pin = line.match(/(?:^|\s)PIN=([^\t]+)/)?.[1] ?? null;
      const columns = line.split("\t");
      return {
        ...base,
        id: crypto.randomUUID(),
        body: line,
        employeeCode: pin,
        recordedAt: line.startsWith("OPLOG ") ? columns[2] || null : null,
        attendanceStatus: null,
        verificationType: null
      };
    });
  }

  return [{
    ...base,
    id: crypto.randomUUID(),
    body: "",
    employeeCode: null,
    recordedAt: null,
    attendanceStatus: null,
    verificationType: null
  }];
}
