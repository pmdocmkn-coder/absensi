import { resolve } from "node:path";
import { persistDeviceEvents } from "./database";
import type { DeviceEvent } from "./types";

type MdbRow = {
  employeeCode: string;
  employeeName: string;
  recordedAt: string;
  attendanceStatus: string | number | null;
  verificationType: string | number | null;
  sensorId: string;
  workCode: string;
  deviceSerial: string;
};

const [inputPath, from = "2026-07-01", to = "2026-09-01"] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: bun run import:mdb <file.mdb> [from] [to]");
  process.exit(1);
}

const rootDirectory = resolve(import.meta.dir, "../../..");
const outputPath = resolve(rootDirectory, "data", `mdb-${from}-${to}.jsonl`);
await Bun.write(outputPath, "");

const powershell = "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe";
const exportScript = resolve(rootDirectory, "scripts", "export-mdb.ps1");
const exportProcess = Bun.spawn([
  powershell,
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", exportScript,
  "-InputPath", resolve(inputPath),
  "-OutputPath", outputPath,
  "-From", from,
  "-To", to
], { stdout: "inherit", stderr: "inherit" });

if (await exportProcess.exited !== 0) {
  throw new Error("Gagal membaca file MDB");
}

const lines = (await Bun.file(outputPath).text()).split(/\r?\n/).filter(Boolean);
const receivedAt = new Date().toISOString();
let imported = 0;

for (let offset = 0; offset < lines.length; offset += 500) {
  const events: DeviceEvent[] = [];
  for (const line of lines.slice(offset, offset + 500)) {
    const row = JSON.parse(line) as MdbRow;
    const deviceSerial = row.deviceSerial || (row.sensorId ? `MDB-SENSOR-${row.sensorId}` : "MDB-IMPORT");
    const attendanceStatus = Number.isFinite(Number(row.attendanceStatus)) ? Number(row.attendanceStatus) : null;
    const verificationType = Number.isFinite(Number(row.verificationType)) ? Number(row.verificationType) : null;

    if (row.employeeName) {
      events.push({
        id: crypto.randomUUID(), receivedAt, method: "IMPORT", path: inputPath,
        query: { table: "OPERLOG" }, headers: {}, body: `USER PIN=${row.employeeCode}\tName=${row.employeeName}`,
        deviceSerial, employeeCode: row.employeeCode, employeeName: row.employeeName,
        recordedAt: null, attendanceStatus: null, verificationType: null, source: "unknown"
      });
    }

    events.push({
      id: crypto.randomUUID(), receivedAt, method: "IMPORT", path: inputPath,
      query: { table: "ATTLOG" }, headers: {},
      body: `${row.employeeCode}\t${row.recordedAt}\t${attendanceStatus ?? ""}\t${verificationType ?? ""}\t${row.workCode ?? ""}`,
      deviceSerial, employeeCode: row.employeeCode, employeeName: row.employeeName || null,
      recordedAt: row.recordedAt, attendanceStatus, verificationType, source: "unknown"
    });
    imported += 1;
  }
  persistDeviceEvents(events);
}

console.log(`Imported ${imported} attendance records from ${from} until before ${to}.`);
